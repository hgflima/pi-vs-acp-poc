import { promises as fs } from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

const MAX_CONFIG_BYTES = 1024 * 1024;

export interface CodexSkillOverride {
	path: string;
	enabled: boolean;
	sourceLine: number;
}

export interface CodexConfigWarning {
	sourceLine: number;
	message: string;
}

export interface CodexConfigParseResult {
	configPath: string;
	overrides: CodexSkillOverride[];
	fatalError: string | null;
	warnings: CodexConfigWarning[];
}

export async function parseCodexConfig(
	configPath: string,
): Promise<CodexConfigParseResult> {
	let source: string;
	try {
		const stat = await fs.stat(configPath);
		if (stat.size > MAX_CONFIG_BYTES) {
			return {
				configPath,
				overrides: [],
				fatalError: "Config file too large",
				warnings: [],
			};
		}
		source = await fs.readFile(configPath, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { configPath, overrides: [], fatalError: null, warnings: [] };
		}
		return {
			configPath,
			overrides: [],
			fatalError: `Failed to read config: ${(err as Error).message}`,
			warnings: [],
		};
	}

	if (source.trim() === "") {
		return { configPath, overrides: [], fatalError: null, warnings: [] };
	}

	let parsed: TOML.JsonMap;
	try {
		parsed = TOML.parse(source);
	} catch (err) {
		return {
			configPath,
			overrides: [],
			fatalError: `TOML parse error: ${(err as Error).message}`,
			warnings: [],
		};
	}

	const skillsRaw = (parsed as Record<string, unknown>).skills;
	const configRaw =
		skillsRaw && typeof skillsRaw === "object"
			? (skillsRaw as Record<string, unknown>).config
			: undefined;

	if (!Array.isArray(configRaw)) {
		return { configPath, overrides: [], fatalError: null, warnings: [] };
	}

	const entryLines = computeEntryPathLines(source);

	const warnings: CodexConfigWarning[] = [];
	const ordered: CodexSkillOverride[] = [];
	const indexByPath = new Map<string, number>();

	configRaw.forEach((entryRaw, index) => {
		const oneIndex = index + 1;
		const sourceLine = entryLines[index] ?? 0;
		const entry =
			entryRaw && typeof entryRaw === "object"
				? (entryRaw as Record<string, unknown>)
				: null;

		if (!entry) {
			warnings.push({
				sourceLine,
				message: `Entry ${oneIndex}: missing path`,
			});
			return;
		}

		const rawPath = entry.path;
		if (typeof rawPath !== "string" || rawPath.length === 0) {
			warnings.push({
				sourceLine,
				message: `Entry ${oneIndex}: missing path`,
			});
			return;
		}

		if (!path.isAbsolute(rawPath)) {
			warnings.push({
				sourceLine,
				message: `Entry ${oneIndex}: path must be absolute`,
			});
			return;
		}

		const normalized = path.normalize(rawPath);

		let enabled: boolean;
		if (entry.enabled === undefined) {
			enabled = true;
		} else if (typeof entry.enabled === "boolean") {
			enabled = entry.enabled;
		} else {
			warnings.push({
				sourceLine,
				message: `Entry ${oneIndex}: enabled must be boolean`,
			});
			enabled = true;
		}

		const override: CodexSkillOverride = {
			path: normalized,
			enabled,
			sourceLine,
		};

		const existingIdx = indexByPath.get(normalized);
		if (existingIdx !== undefined) {
			warnings.push({
				sourceLine,
				message: "Duplicate path; using last entry",
			});
			ordered[existingIdx] = override;
		} else {
			indexByPath.set(normalized, ordered.length);
			ordered.push(override);
		}
	});

	return {
		configPath,
		overrides: ordered,
		fatalError: null,
		warnings,
	};
}

function computeEntryPathLines(source: string): number[] {
	const lines = source.split(/\r?\n/);
	const entryStarts: number[] = [];
	let inSkillsConfigBlock = false;
	let currentBlockLineHasPath = false;
	let blockStartLine = 0;

	const pushIfNeeded = () => {
		if (inSkillsConfigBlock) {
			entryStarts.push(currentBlockLineHasPath ? blockStartLine : 0);
		}
	};

	const tableHeaderRe = /^\s*\[\[\s*([^\]]+?)\s*\]\]\s*$/;
	const otherTableHeaderRe = /^\s*\[\s*([^\]]+?)\s*\]\s*$/;
	const pathLineRe = /^\s*path\s*=/;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const arrTable = line.match(tableHeaderRe);
		const stdTable = line.match(otherTableHeaderRe);

		if (arrTable) {
			if (inSkillsConfigBlock) {
				pushIfNeeded();
			}
			if (arrTable[1] === "skills.config") {
				inSkillsConfigBlock = true;
				blockStartLine = i + 1;
				currentBlockLineHasPath = false;
			} else {
				inSkillsConfigBlock = false;
			}
			continue;
		}

		if (stdTable && !arrTable) {
			if (inSkillsConfigBlock) {
				pushIfNeeded();
			}
			inSkillsConfigBlock = false;
			continue;
		}

		if (inSkillsConfigBlock && pathLineRe.test(line)) {
			if (!currentBlockLineHasPath) {
				blockStartLine = i + 1;
				currentBlockLineHasPath = true;
			}
		}
	}

	if (inSkillsConfigBlock) {
		pushIfNeeded();
	}

	return entryStarts;
}
