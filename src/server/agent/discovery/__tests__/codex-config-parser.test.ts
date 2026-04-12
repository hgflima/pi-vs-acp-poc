import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCodexConfig } from "../codex-config-parser.js";

let tmpDir: string;

beforeEach(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-config-parser-"));
});

afterEach(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(content: string): Promise<string> {
	const configPath = path.join(tmpDir, "config.toml");
	await fs.writeFile(configPath, content, "utf8");
	return configPath;
}

describe("parseCodexConfig", () => {
	it("returns empty result when file is missing", async () => {
		const missing = path.join(tmpDir, "does-not-exist.toml");
		const result = await parseCodexConfig(missing);
		expect(result).toEqual({
			configPath: missing,
			overrides: [],
			fatalError: null,
			warnings: [],
		});
	});

	it("returns empty result when file is empty", async () => {
		const configPath = await writeConfig("");
		const result = await parseCodexConfig(configPath);
		expect(result.overrides).toEqual([]);
		expect(result.fatalError).toBeNull();
		expect(result.warnings).toEqual([]);
	});

	it("parses an entry with enabled=false", async () => {
		const configPath = await writeConfig(
			'[[skills.config]]\npath = "/a/SKILL.md"\nenabled = false\n',
		);
		const result = await parseCodexConfig(configPath);
		expect(result.fatalError).toBeNull();
		expect(result.warnings).toEqual([]);
		expect(result.overrides).toEqual([
			{ path: "/a/SKILL.md", enabled: false, sourceLine: 2 },
		]);
	});

	it("defaults enabled to true when omitted", async () => {
		const configPath = await writeConfig(
			'[[skills.config]]\npath = "/a/SKILL.md"\n',
		);
		const result = await parseCodexConfig(configPath);
		expect(result.fatalError).toBeNull();
		expect(result.warnings).toEqual([]);
		expect(result.overrides).toEqual([
			{ path: "/a/SKILL.md", enabled: true, sourceLine: 2 },
		]);
	});

	it("warns and skips entries with relative paths", async () => {
		const configPath = await writeConfig(
			'[[skills.config]]\npath = "relative/SKILL.md"\n',
		);
		const result = await parseCodexConfig(configPath);
		expect(result.overrides).toEqual([]);
		expect(result.fatalError).toBeNull();
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0].message).toBe(
			"Entry 1: path must be absolute",
		);
	});

	it("applies last-wins for duplicate paths and emits warning", async () => {
		const configPath = await writeConfig(
			'[[skills.config]]\npath = "/a"\n[[skills.config]]\npath = "/a"\nenabled = false\n',
		);
		const result = await parseCodexConfig(configPath);
		expect(result.fatalError).toBeNull();
		expect(result.overrides).toHaveLength(1);
		expect(result.overrides[0]).toMatchObject({
			path: "/a",
			enabled: false,
		});
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0].message).toBe(
			"Duplicate path; using last entry",
		);
	});

	it("returns fatalError on broken TOML", async () => {
		const configPath = await writeConfig(
			'[[skills.config]]\npath = "/a"\n}\n',
		);
		const result = await parseCodexConfig(configPath);
		expect(result.overrides).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.fatalError).toBeTruthy();
		expect(result.fatalError?.toLowerCase()).toContain("toml");
	});

	it("returns fatalError when file exceeds 1 MB", async () => {
		const configPath = path.join(tmpDir, "big.toml");
		const big = "x".repeat(1024 * 1024 + 1);
		await fs.writeFile(configPath, big, "utf8");
		const result = await parseCodexConfig(configPath);
		expect(result.overrides).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.fatalError).toBe("Config file too large");
	});
});
