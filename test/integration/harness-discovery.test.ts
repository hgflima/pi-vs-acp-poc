import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dispatchDiscovery } from "../../src/server/agent/discovery/index.js";
import type { DiscoveryResult } from "../../src/server/agent/discovery/types.js";

interface Fixture {
	root: string;
	claudeHomeDir: string;
	activeDirectory: string;
	cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "harness-discovery-e2e-"));
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

function frontmatter(name: string, description: string, extra?: Record<string, string>): string {
	const lines = ["---", `name: ${name}`, `description: ${description}`];
	if (extra) {
		for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
	}
	lines.push("---", "", "body", "");
	return lines.join("\n");
}

async function buildFullFixture(fx: Fixture): Promise<void> {
	// Personal scope: 2 skills (1 unique, 1 collides with project), 1 command
	await writeFile(
		path.join(fx.claudeHomeDir, "skills", "personal-only", "SKILL.md"),
		frontmatter("personal-only", "personal-only skill"),
	);
	await writeFile(
		path.join(fx.claudeHomeDir, "skills", "shared", "SKILL.md"),
		frontmatter("shared", "personal version"),
	);
	await writeFile(
		path.join(fx.claudeHomeDir, "commands", "personal-cmd.md"),
		frontmatter("personal-cmd", "personal command"),
	);

	// Project scope: 1 unique skill + 1 colliding (will be shadowed by personal)
	await writeFile(
		path.join(fx.activeDirectory, ".claude", "skills", "project-only", "SKILL.md"),
		frontmatter("project-only", "project-only skill"),
	);
	await writeFile(
		path.join(fx.activeDirectory, ".claude", "skills", "shared", "SKILL.md"),
		frontmatter("shared", "project version"),
	);

	// Plugins: plugin-1 enabled, plugin-2 enabled (distinct names),
	// plugin-disabled installed but enabledPlugins flag is missing (AC-3)
	const plugin1Path = path.join(
		fx.claudeHomeDir,
		"plugins",
		"cache",
		"market",
		"plugin-1",
		"1.0.0",
	);
	const plugin2Path = path.join(
		fx.claudeHomeDir,
		"plugins",
		"cache",
		"market",
		"plugin-2",
		"1.0.0",
	);
	const pluginDisabledPath = path.join(
		fx.claudeHomeDir,
		"plugins",
		"cache",
		"market",
		"plugin-disabled",
		"1.0.0",
	);
	await writeFile(
		path.join(plugin1Path, "skills", "shared-name", "SKILL.md"),
		frontmatter("shared-name", "plugin-1 skill"),
	);
	await writeFile(
		path.join(plugin2Path, "skills", "shared-name", "SKILL.md"),
		frontmatter("shared-name", "plugin-2 skill"),
	);
	await writeFile(
		path.join(pluginDisabledPath, "skills", "ghost", "SKILL.md"),
		frontmatter("ghost", "should never appear"),
	);

	await writeJson(path.join(fx.claudeHomeDir, "plugins", "installed_plugins.json"), {
		plugins: {
			"plugin-1@market": [{ scope: "user", installPath: plugin1Path }],
			"plugin-2@market": [{ scope: "user", installPath: plugin2Path }],
			"plugin-disabled@market": [{ scope: "user", installPath: pluginDisabledPath }],
		},
	});
	await writeJson(path.join(fx.claudeHomeDir, "settings.json"), {
		enabledPlugins: {
			"plugin-1@market": true,
			"plugin-2@market": true,
			// plugin-disabled@market deliberately absent
		},
	});
}

describe("E2E: dispatchDiscovery via fixture project", () => {
	let fixture: Fixture;

	beforeEach(async () => {
		fixture = await makeFixture();
	});

	afterEach(async () => {
		await fixture.cleanup();
	});

	it("AC-1 + response shape: aggregates personal + project + plugin + bundled with sources/errors", async () => {
		await buildFullFixture(fixture);

		const result: DiscoveryResult = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
			includeShadowed: true,
		});

		// Response shape (AC-asserts items, sources, errors all present)
		expect(result).toHaveProperty("items");
		expect(result).toHaveProperty("sources");
		expect(result).toHaveProperty("errors");
		expect(result).toHaveProperty("shadowed");
		expect(Array.isArray(result.items)).toBe(true);
		expect(Array.isArray(result.sources)).toBe(true);
		expect(Array.isArray(result.errors)).toBe(true);

		const personal = result.items.filter((i) => i.scope === "personal");
		const project = result.items.filter((i) => i.scope === "project");
		const plugin = result.items.filter((i) => i.scope === "plugin");
		const bundled = result.items.filter((i) => i.scope === "bundled");

		// AC-1: at least one of each scope present
		expect(personal.length).toBeGreaterThanOrEqual(1);
		expect(project.length).toBeGreaterThanOrEqual(1);
		expect(plugin.length).toBeGreaterThanOrEqual(1);
		expect(bundled.length).toBeGreaterThanOrEqual(1);

		// Personal: 2 skills (personal-only, shared) + 1 command (personal-cmd) = 3 items
		expect(personal.map((i) => i.name).sort()).toEqual([
			"personal-cmd",
			"personal-only",
			"shared",
		]);

		// Project: only project-only survives (shared shadowed)
		expect(project.map((i) => i.name)).toEqual(["project-only"]);

		// Bundled: 5 hardcoded entries
		expect(bundled).toHaveLength(5);

		// errors empty
		expect(result.errors).toEqual([]);
	});

	it("AC-3: plugin in installed_plugins.json but absent from enabledPlugins is excluded", async () => {
		await buildFullFixture(fixture);

		const result = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const ghost = result.items.find((i) => i.name === "plugin-disabled:ghost");
		expect(ghost).toBeUndefined();
		const anyDisabled = result.items.filter((i) => i.pluginKey === "plugin-disabled@market");
		expect(anyDisabled).toEqual([]);
	});

	it("AC-5: personal vs project shadow → personal wins, project in shadowed", async () => {
		await buildFullFixture(fixture);

		const result = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
			includeShadowed: true,
		});

		const sharedItems = result.items.filter((i) => i.name === "shared");
		expect(sharedItems).toHaveLength(1);
		expect(sharedItems[0]?.scope).toBe("personal");

		const shadowedShared = result.shadowed.filter((s) => s.item.name === "shared");
		expect(shadowedShared).toHaveLength(1);
		expect(shadowedShared[0]?.reason).toBe("lower-scope");
		expect(shadowedShared[0]?.item.scope).toBe("project");
	});

	it("AC-6: plugin skills appear as pluginname:skillname; two plugins with same short-name coexist", async () => {
		await buildFullFixture(fixture);

		const result = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const pluginItems = result.items.filter((i) => i.scope === "plugin");
		const names = pluginItems.map((i) => i.name).sort();
		expect(names).toEqual(["plugin-1:shared-name", "plugin-2:shared-name"]);

		for (const item of pluginItems) {
			expect(item.pluginName).toBeDefined();
			expect(item.pluginKey).toBeDefined();
		}
	});

	it("AC-2: discovery reflects current filesystem state — removed files disappear on next call", async () => {
		// First pass: project skill present
		await writeFile(
			path.join(fixture.activeDirectory, ".claude", "skills", "ephemeral", "SKILL.md"),
			frontmatter("ephemeral", "will be removed"),
		);

		const before = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});
		expect(before.items.find((i) => i.name === "ephemeral")).toBeDefined();

		// Remove the skill (simulates user deleting symlink target)
		await fs.rm(path.join(fixture.activeDirectory, ".claude", "skills", "ephemeral"), {
			recursive: true,
			force: true,
		});

		const after = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});
		expect(after.items.find((i) => i.name === "ephemeral")).toBeUndefined();
	});

	it("AC-9: discovery completes in <150ms with realistic-shaped fixture (50% headroom over 100ms target)", async () => {
		await buildFullFixture(fixture);

		// Warm-up call (filesystem stat cache, JIT, gray-matter init)
		await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		const start = performance.now();
		const result = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});
		const elapsed = performance.now() - start;

		expect(result.items.length).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(150);
	});

	it("sources reports every native scope path with exists/itemsFound", async () => {
		await buildFullFixture(fixture);

		const result = await dispatchDiscovery("claude", fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		// Personal: 3 native paths (skills, commands, agents)
		const personalSources = result.sources.filter((s) => s.scope === "personal");
		expect(personalSources).toHaveLength(3);

		// Project: 3 native paths
		const projectSources = result.sources.filter((s) => s.scope === "project");
		expect(projectSources).toHaveLength(3);

		// At least one personal source has items > 0
		const personalSkillSrc = personalSources.find((s) => s.path.endsWith("skills"));
		expect(personalSkillSrc?.exists).toBe(true);
		expect((personalSkillSrc?.itemsFound ?? 0)).toBeGreaterThan(0);
	});
});
