import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLAUDE_BUNDLED_SKILLS } from "./claude-bundled.js";
import {
	resolveEnabledClaudePlugins,
	type ResolvedPlugin,
} from "./claude-plugins.js";
import { mergeAndShadow } from "./merge-and-shadow.js";
import { parseSkillFile } from "./parse-skill-file.js";
import type {
	DiscoveredItem,
	DiscoveredItemType,
	DiscoveredScope,
	DiscoveryError,
	DiscoveryResult,
	DiscoverySource,
} from "./types.js";

export interface DiscoverClaudeOptions {
	claudeHomeDir?: string;
}

interface ScanContext {
	candidates: DiscoveredItem[];
	sources: DiscoverySource[];
	errors: DiscoveryError[];
}

export async function discoverClaudeItems(
	activeDirectory: string,
	options?: DiscoverClaudeOptions,
): Promise<DiscoveryResult> {
	const claudeHomeDir =
		options?.claudeHomeDir ?? path.join(os.homedir(), ".claude");

	const ctx: ScanContext = { candidates: [], sources: [], errors: [] };

	await scanScope(ctx, {
		scope: "personal",
		root: claudeHomeDir,
		originLabel: "~/.claude",
	});

	await scanScope(ctx, {
		scope: "project",
		root: path.join(activeDirectory, ".claude"),
		originLabel: ".claude",
	});

	const plugins = await resolveEnabledClaudePlugins(activeDirectory, {
		claudeHomeDir,
	});
	const enabled = plugins.filter((p) => p.enabled);
	for (const plugin of enabled) {
		await scanPlugin(ctx, plugin);
	}

	const bundledHydrated: DiscoveredItem[] = CLAUDE_BUNDLED_SKILLS.map((b) => ({
		...b,
		path: `<bundled:${b.name}>`,
		mtimeMs: 0,
	}));

	const merged = mergeAndShadow([...ctx.candidates, ...bundledHydrated]);

	return {
		items: merged.items,
		shadowed: merged.shadowed,
		sources: ctx.sources,
		errors: ctx.errors,
	};
}

interface ScanScopeArgs {
	scope: DiscoveredScope;
	root: string;
	originLabel: string;
}

async function scanScope(ctx: ScanContext, args: ScanScopeArgs): Promise<void> {
	await scanSkills(ctx, {
		dir: path.join(args.root, "skills"),
		scope: args.scope,
		origin: `${args.originLabel}/skills`,
	});
	await scanCommands(ctx, {
		dir: path.join(args.root, "commands"),
		scope: args.scope,
		origin: `${args.originLabel}/commands`,
	});
	await scanAgents(ctx, {
		dir: path.join(args.root, "agents"),
		scope: args.scope,
		origin: `${args.originLabel}/agents`,
	});
}

async function scanPlugin(ctx: ScanContext, plugin: ResolvedPlugin): Promise<void> {
	const meta = {
		pluginKey: plugin.pluginKey,
		pluginName: plugin.pluginName,
	};
	await scanSkills(ctx, {
		dir: path.join(plugin.installPath, "skills"),
		scope: "plugin",
		origin: `${plugin.pluginName}@${plugin.pluginKey}/skills`,
		plugin: meta,
	});
	await scanCommands(ctx, {
		dir: path.join(plugin.installPath, "commands"),
		scope: "plugin",
		origin: `${plugin.pluginName}@${plugin.pluginKey}/commands`,
		plugin: meta,
	});
	await scanAgents(ctx, {
		dir: path.join(plugin.installPath, "agents"),
		scope: "plugin",
		origin: `${plugin.pluginName}@${plugin.pluginKey}/agents`,
		plugin: meta,
	});
}

interface ScanArgs {
	dir: string;
	scope: DiscoveredScope;
	origin: string;
	plugin?: { pluginKey: string; pluginName: string };
}

async function scanSkills(ctx: ScanContext, args: ScanArgs): Promise<void> {
	const source: DiscoverySource = {
		path: args.dir,
		scope: args.scope,
		exists: false,
		itemsFound: 0,
	};
	if (args.plugin) {
		source.pluginKey = args.plugin.pluginKey;
		source.pluginName = args.plugin.pluginName;
	}

	const entries = await readDirSafe(args.dir);
	if (entries === null) {
		ctx.sources.push(source);
		return;
	}
	source.exists = true;

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith(".")) continue;
		const skillFile = path.join(args.dir, entry.name, "SKILL.md");
		const stat = await statSafe(skillFile);
		if (!stat || !stat.isFile()) continue;
		const item = await buildItem(ctx, {
			filePath: skillFile,
			type: "skill",
			scope: args.scope,
			origin: args.origin,
			plugin: args.plugin,
			defaultName: entry.name,
		});
		if (item) {
			ctx.candidates.push(item);
			source.itemsFound++;
		}
	}

	ctx.sources.push(source);
}

async function scanCommands(ctx: ScanContext, args: ScanArgs): Promise<void> {
	const source: DiscoverySource = {
		path: args.dir,
		scope: args.scope,
		exists: false,
		itemsFound: 0,
	};
	if (args.plugin) {
		source.pluginKey = args.plugin.pluginKey;
		source.pluginName = args.plugin.pluginName;
	}

	const exists = await dirExists(args.dir);
	if (!exists) {
		ctx.sources.push(source);
		return;
	}
	source.exists = true;

	const files = await walkMarkdown(args.dir);
	for (const filePath of files) {
		const base = path.basename(filePath);
		if (base.startsWith(".")) continue;
		if (base.endsWith(".local.md")) continue;
		const stem = base.replace(/\.md$/, "");
		const item = await buildItem(ctx, {
			filePath,
			type: "command",
			scope: args.scope,
			origin: args.origin,
			plugin: args.plugin,
			defaultName: stem,
		});
		if (item) {
			ctx.candidates.push(item);
			source.itemsFound++;
		}
	}

	ctx.sources.push(source);
}

async function scanAgents(ctx: ScanContext, args: ScanArgs): Promise<void> {
	const source: DiscoverySource = {
		path: args.dir,
		scope: args.scope,
		exists: false,
		itemsFound: 0,
	};
	if (args.plugin) {
		source.pluginKey = args.plugin.pluginKey;
		source.pluginName = args.plugin.pluginName;
	}

	const entries = await readDirSafe(args.dir);
	if (entries === null) {
		ctx.sources.push(source);
		return;
	}
	source.exists = true;

	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".md")) continue;
		if (entry.name.startsWith(".")) continue;
		const filePath = path.join(args.dir, entry.name);
		const stem = entry.name.replace(/\.md$/, "");
		const item = await buildItem(ctx, {
			filePath,
			type: "subagent",
			scope: args.scope,
			origin: args.origin,
			plugin: args.plugin,
			defaultName: stem,
			forceUserInvocable: false,
		});
		if (item) {
			ctx.candidates.push(item);
			source.itemsFound++;
		}
	}

	ctx.sources.push(source);
}

interface BuildItemArgs {
	filePath: string;
	type: DiscoveredItemType;
	scope: DiscoveredScope;
	origin: string;
	plugin?: { pluginKey: string; pluginName: string };
	defaultName: string;
	forceUserInvocable?: boolean;
}

async function buildItem(
	ctx: ScanContext,
	args: BuildItemArgs,
): Promise<DiscoveredItem | null> {
	const parsed = await parseSkillFile(args.filePath);
	if (!parsed.ok) {
		ctx.errors.push({
			path: parsed.path,
			message: parsed.message,
			kind: parsed.kind,
		});
		return null;
	}

	const baseName = parsed.name || args.defaultName;
	const finalName = args.plugin
		? `${args.plugin.pluginName}:${baseName}`
		: baseName;

	const item: DiscoveredItem = {
		name: finalName,
		type: args.type,
		scope: args.scope,
		harness: "claude",
		origin: args.origin,
		description: parsed.description,
		userInvocable:
			args.forceUserInvocable === false ? false : parsed.userInvocable,
		path: parsed.path,
		mtimeMs: parsed.mtimeMs,
	};
	if (parsed.argumentHint !== undefined) {
		item.argumentHint = parsed.argumentHint;
	}
	if (args.plugin) {
		item.pluginKey = args.plugin.pluginKey;
		item.pluginName = args.plugin.pluginName;
	}
	return item;
}

async function readDirSafe(
	dirPath: string,
): Promise<Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }> | null> {
	try {
		return await fs.readdir(dirPath, { withFileTypes: true });
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ENOTDIR") return null;
		return null;
	}
}

async function statSafe(filePath: string) {
	try {
		return await fs.stat(filePath);
	} catch {
		return null;
	}
}

async function dirExists(dirPath: string): Promise<boolean> {
	const stat = await statSafe(dirPath);
	return !!stat && stat.isDirectory();
}

async function walkMarkdown(rootDir: string): Promise<string[]> {
	const out: string[] = [];
	async function recurse(dir: string): Promise<void> {
		const entries = await readDirSafe(dir);
		if (!entries) return;
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await recurse(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				out.push(full);
			}
		}
	}
	await recurse(rootDir);
	return out;
}
