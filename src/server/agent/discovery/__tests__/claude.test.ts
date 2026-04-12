import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverClaudeItems } from "../claude.js";

interface Fixture {
	root: string;
	claudeHomeDir: string;
	activeDirectory: string;
	cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-discovery-"));
	const claudeHomeDir = path.join(root, "home", ".claude");
	const activeDirectory = path.join(root, "project");
	await fs.mkdir(claudeHomeDir, { recursive: true });
	await fs.mkdir(activeDirectory, { recursive: true });
	return {
		root,
		claudeHomeDir,
		activeDirectory,
		cleanup: async () => {
			await fs.rm(root, { recursive: true, force: true });
		},
	};
}

async function writeFile(filePath: string, content: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
	await writeFile(filePath, JSON.stringify(data, null, 2));
}

function frontmatter(name: string, description: string): string {
	return ["---", `name: ${name}`, `description: ${description}`, "---", "", "body", ""].join(
		"\n",
	);
}

describe("discoverClaudeItems", () => {
	let fixture: Fixture;

	beforeEach(async () => {
		fixture = await makeFixture();
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	it("returns only personal + bundled when activeDirectory has no .claude/", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "skills", "personal-skill", "SKILL.md"),
			frontmatter("personal-skill", "a personal skill"),
		);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const userScopeNames = result.items
			.filter((i) => i.scope === "personal")
			.map((i) => i.name);
		expect(userScopeNames).toContain("personal-skill");
		expect(result.items.filter((i) => i.scope === "project")).toEqual([]);
		expect(result.items.filter((i) => i.scope === "plugin")).toEqual([]);
		const bundled = result.items.filter((i) => i.scope === "bundled");
		expect(bundled.length).toBeGreaterThan(0);
	});

	it("aggregates 1 personal + 1 project + 1 plugin skill plus bundled", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "skills", "personal-skill", "SKILL.md"),
			frontmatter("personal-skill", "personal description"),
		);
		await writeFile(
			path.join(fixture.activeDirectory, ".claude", "skills", "project-skill", "SKILL.md"),
			frontmatter("project-skill", "project description"),
		);

		const installPath = path.join(
			fixture.claudeHomeDir,
			"plugins",
			"cache",
			"market",
			"test-plugin",
			"1.0.0",
		);
		await fs.mkdir(path.join(installPath, "skills"), { recursive: true });
		await writeFile(
			path.join(installPath, "skills", "plugin-skill", "SKILL.md"),
			frontmatter("plugin-skill", "plugin description"),
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"test-plugin@market": [{ scope: "user", installPath }],
				},
			},
		);
		await writeJson(path.join(fixture.claudeHomeDir, "settings.json"), {
			enabledPlugins: { "test-plugin@market": true },
		});

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const personalNames = result.items
			.filter((i) => i.scope === "personal")
			.map((i) => i.name);
		const projectNames = result.items
			.filter((i) => i.scope === "project")
			.map((i) => i.name);
		const pluginItems = result.items.filter((i) => i.scope === "plugin");
		const bundledNames = result.items
			.filter((i) => i.scope === "bundled")
			.map((i) => i.name);

		expect(personalNames).toEqual(["personal-skill"]);
		expect(projectNames).toEqual(["project-skill"]);
		expect(pluginItems).toHaveLength(1);
		expect(pluginItems[0]?.name).toBe("test-plugin:plugin-skill");
		expect(pluginItems[0]?.pluginName).toBe("test-plugin");
		expect(pluginItems[0]?.pluginKey).toBe("test-plugin@market");
		// 1 personal + 1 project + 1 plugin + 5 bundled = 8
		expect(result.items).toHaveLength(8);
		expect(bundledNames).toHaveLength(5);
		expect(result.errors).toEqual([]);
	});

	it("places oversized files in errors, not items", async () => {
		const skillDir = path.join(
			fixture.claudeHomeDir,
			"skills",
			"oversized-skill",
		);
		const big = "a".repeat(256 * 1024 + 100);
		await writeFile(path.join(skillDir, "SKILL.md"), big);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const personalSkills = result.items.filter(
			(i) => i.scope === "personal" && i.name === "oversized-skill",
		);
		expect(personalSkills).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.kind).toBe("oversized");
		expect(result.errors[0]?.path).toContain("oversized-skill");
	});

	it("reports sources with exists + itemsFound for every scanned path", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "skills", "alpha", "SKILL.md"),
			frontmatter("alpha", "first"),
		);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const personalSkillSource = result.sources.find(
			(s) =>
				s.scope === "personal" &&
				s.path === path.join(fixture.claudeHomeDir, "skills"),
		);
		expect(personalSkillSource).toBeDefined();
		expect(personalSkillSource?.exists).toBe(true);
		expect(personalSkillSource?.itemsFound).toBe(1);

		const projectSkillSource = result.sources.find(
			(s) =>
				s.scope === "project" &&
				s.path === path.join(fixture.activeDirectory, ".claude", "skills"),
		);
		expect(projectSkillSource).toBeDefined();
		expect(projectSkillSource?.exists).toBe(false);
		expect(projectSkillSource?.itemsFound).toBe(0);

		// 3 personal + 3 project = 6 source entries minimum
		const personalSources = result.sources.filter((s) => s.scope === "personal");
		const projectSources = result.sources.filter((s) => s.scope === "project");
		expect(personalSources).toHaveLength(3);
		expect(projectSources).toHaveLength(3);
	});

	it("personal + project with same name → personal wins, project shadowed", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "skills", "shared", "SKILL.md"),
			frontmatter("shared", "personal version"),
		);
		await writeFile(
			path.join(fixture.activeDirectory, ".claude", "skills", "shared", "SKILL.md"),
			frontmatter("shared", "project version"),
		);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const sharedItems = result.items.filter((i) => i.name === "shared");
		expect(sharedItems).toHaveLength(1);
		expect(sharedItems[0]?.scope).toBe("personal");

		const shadowedShared = result.shadowed.filter((s) => s.item.name === "shared");
		expect(shadowedShared).toHaveLength(1);
		expect(shadowedShared[0]?.reason).toBe("lower-scope");
		expect(shadowedShared[0]?.item.scope).toBe("project");
	});

	it("subagents have type=subagent and userInvocable=false", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "agents", "reviewer.md"),
			frontmatter("reviewer", "code reviewer subagent"),
		);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const subagent = result.items.find((i) => i.name === "reviewer");
		expect(subagent).toBeDefined();
		expect(subagent?.type).toBe("subagent");
		expect(subagent?.userInvocable).toBe(false);
		expect(subagent?.scope).toBe("personal");
	});

	it("walks commands recursively, skips dotfiles and *.local.md, filename is name fallback", async () => {
		await writeFile(
			path.join(fixture.claudeHomeDir, "commands", "foo.md"),
			frontmatter("foo", "top-level command"),
		);
		await writeFile(
			path.join(fixture.claudeHomeDir, "commands", "nested", "bar.md"),
			"# bar command\n\nA nested command without frontmatter.\n",
		);
		await writeFile(
			path.join(fixture.claudeHomeDir, "commands", ".hidden.md"),
			frontmatter("hidden", "should be skipped"),
		);
		await writeFile(
			path.join(fixture.claudeHomeDir, "commands", "secret.local.md"),
			frontmatter("secret", "should be skipped"),
		);

		const result = await discoverClaudeItems(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const commandNames = result.items
			.filter((i) => i.type === "command")
			.map((i) => i.name)
			.sort();
		expect(commandNames).toEqual(["bar", "foo"]);
	});
});
