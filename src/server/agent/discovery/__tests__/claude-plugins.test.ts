import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveEnabledClaudePlugins } from "../claude-plugins.js";

interface Fixture {
	claudeHomeDir: string;
	activeDirectory: string;
	cleanup: () => Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-plugins-test-"));
	const claudeHomeDir = path.join(root, ".claude");
	const activeDirectory = path.join(root, "project");
	await fs.mkdir(path.join(claudeHomeDir, "plugins", "cache"), { recursive: true });
	await fs.mkdir(activeDirectory, { recursive: true });
	return {
		claudeHomeDir,
		activeDirectory,
		cleanup: async () => {
			await fs.rm(root, { recursive: true, force: true });
		},
	};
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function makePluginInstall(
	claudeHomeDir: string,
	marketplace: string,
	pluginName: string,
	version = "1.0.0",
): Promise<string> {
	const installPath = path.join(
		claudeHomeDir,
		"plugins",
		"cache",
		marketplace,
		pluginName,
		version,
	);
	await fs.mkdir(path.join(installPath, "skills"), { recursive: true });
	return installPath;
}

describe("resolveEnabledClaudePlugins", () => {
	let fixture: Fixture;

	beforeEach(async () => {
		fixture = await makeFixture();
	});

	afterEach(async () => {
		await fixture.cleanup();
		vi.restoreAllMocks();
	});

	it("returns [] when installed_plugins.json is missing", async () => {
		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});
		expect(result).toEqual([]);
	});

	it("marks plugin as disabled when no settings file mentions it", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"alpha",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				version: 2,
				plugins: {
					"alpha@market": [{ scope: "user", installPath }],
				},
			},
		);

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			pluginKey: "alpha@market",
			pluginName: "alpha",
			enabled: false,
			enabledBy: null,
			scope: "user",
		});
	});

	it("enables plugin via user-level settings.json", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"alpha",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"alpha@market": [{ scope: "user", installPath }],
				},
			},
		);
		const userSettings = path.join(fixture.claudeHomeDir, "settings.json");
		await writeJson(userSettings, {
			enabledPlugins: { "alpha@market": true },
		});

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toHaveLength(1);
		expect(result[0].enabled).toBe(true);
		expect(result[0].enabledBy).toBe(userSettings);
	});

	it("respects first-hit precedence: settings.local > settings > home", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"alpha",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"alpha@market": [{ scope: "user", installPath }],
				},
			},
		);
		const homeSettings = path.join(fixture.claudeHomeDir, "settings.json");
		const projSettings = path.join(fixture.activeDirectory, ".claude", "settings.json");
		const localSettings = path.join(
			fixture.activeDirectory,
			".claude",
			"settings.local.json",
		);
		await writeJson(homeSettings, { enabledPlugins: { "alpha@market": true } });
		await writeJson(projSettings, { enabledPlugins: { "alpha@market": true } });
		await writeJson(localSettings, { enabledPlugins: { "alpha@market": false } });

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result[0].enabled).toBe(false);
		expect(result[0].enabledBy).toBe(localSettings);
	});

	it("project settings override home when local is absent", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"alpha",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"alpha@market": [{ scope: "user", installPath }],
				},
			},
		);
		const homeSettings = path.join(fixture.claudeHomeDir, "settings.json");
		const projSettings = path.join(fixture.activeDirectory, ".claude", "settings.json");
		await writeJson(homeSettings, { enabledPlugins: { "alpha@market": false } });
		await writeJson(projSettings, { enabledPlugins: { "alpha@market": true } });

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result[0].enabled).toBe(true);
		expect(result[0].enabledBy).toBe(projSettings);
	});

	it("excludes scope=local plugin when projectPath does not match activeDirectory", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"beta",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"beta@market": [
						{
							scope: "local",
							installPath,
							projectPath: "/some/other/project",
						},
					],
				},
			},
		);

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toEqual([]);
	});

	it("includes scope=local plugin when projectPath matches activeDirectory", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"beta",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"beta@market": [
						{
							scope: "local",
							installPath,
							projectPath: fixture.activeDirectory,
						},
					],
				},
			},
		);

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toHaveLength(1);
		expect(result[0].scope).toBe("local");
		expect(result[0].pluginKey).toBe("beta@market");
	});

	it("scope=user plugin is always eligible regardless of projectPath", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"gamma",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"gamma@market": [
						{
							scope: "user",
							installPath,
							projectPath: "/some/unrelated/path",
						},
					],
				},
			},
		);

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toHaveLength(1);
		expect(result[0].scope).toBe("user");
	});

	it("drops plugin when installPath escapes plugins/cache via symlink and warns", async () => {
		const escapeRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "claude-plugins-escape-"),
		);
		try {
			const realInstall = path.join(escapeRoot, "evil-plugin");
			await fs.mkdir(path.join(realInstall, "skills"), { recursive: true });
			const symlinkPath = path.join(
				fixture.claudeHomeDir,
				"plugins",
				"cache",
				"market",
				"evil",
			);
			await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
			await fs.symlink(realInstall, symlinkPath);

			await writeJson(
				path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
				{
					plugins: {
						"evil@market": [{ scope: "user", installPath: symlinkPath }],
					},
				},
			);

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
				claudeHomeDir: fixture.claudeHomeDir,
			});

			expect(result).toEqual([]);
			expect(warnSpy).toHaveBeenCalled();
			const allCalls = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
			expect(allCalls).toMatch(/evil@market/);
			expect(allCalls).toMatch(/escapes plugins cache/);
		} finally {
			await fs.rm(escapeRoot, { recursive: true, force: true });
		}
	});

	it("includes plugin when installPath is inside cache without symlink escape", async () => {
		const installPath = await makePluginInstall(
			fixture.claudeHomeDir,
			"market",
			"delta",
			"2.0.0",
		);
		await writeJson(
			path.join(fixture.claudeHomeDir, "plugins", "installed_plugins.json"),
			{
				plugins: {
					"delta@market": [{ scope: "user", installPath }],
				},
			},
		);

		const result = await resolveEnabledClaudePlugins(fixture.activeDirectory, {
			claudeHomeDir: fixture.claudeHomeDir,
		});

		expect(result).toHaveLength(1);
		expect(result[0].installPath).toBe(installPath);
	});
});
