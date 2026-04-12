import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DiscoveredScope } from "./types.js";

export interface ResolvedPlugin {
	pluginKey: string;
	pluginName: string;
	installPath: string;
	enabled: boolean;
	enabledBy: string | null;
	scope: "user" | "local" | "project";
}

export interface ResolvePluginsOptions {
	claudeHomeDir?: string;
}

interface InstalledEntry {
	scope?: string;
	installPath?: string;
	projectPath?: string;
	pluginName?: string;
}

interface InstalledPluginsFile {
	version?: number;
	plugins?: Record<string, InstalledEntry | InstalledEntry[]>;
}

interface SettingsFile {
	enabledPlugins?: Record<string, boolean>;
}

const ELIGIBLE_SCOPES: ReadonlySet<string> = new Set(["user", "local", "project"]);

export async function resolveEnabledClaudePlugins(
	activeDirectory: string,
	options?: ResolvePluginsOptions,
): Promise<ResolvedPlugin[]> {
	const claudeHomeDir = options?.claudeHomeDir ?? path.join(os.homedir(), ".claude");
	const installedPath = path.join(claudeHomeDir, "plugins", "installed_plugins.json");
	const pluginsCacheDir = path.join(claudeHomeDir, "plugins", "cache");

	const installed = await readJsonSafe<InstalledPluginsFile>(installedPath);
	if (!installed || !installed.plugins) {
		return [];
	}

	const settingsCandidates: string[] = [
		path.join(activeDirectory, ".claude", "settings.local.json"),
		path.join(activeDirectory, ".claude", "settings.json"),
		path.join(claudeHomeDir, "settings.json"),
	];

	const settingsLoaded: Array<{ filePath: string; enabledPlugins: Record<string, boolean> }> = [];
	for (const filePath of settingsCandidates) {
		const data = await readJsonSafe<SettingsFile>(filePath);
		if (data && data.enabledPlugins && typeof data.enabledPlugins === "object") {
			settingsLoaded.push({ filePath, enabledPlugins: data.enabledPlugins });
		}
	}

	let cacheRealRoot: string | null = null;
	try {
		cacheRealRoot = await fs.realpath(pluginsCacheDir);
	} catch {
		cacheRealRoot = pluginsCacheDir;
	}

	const result: ResolvedPlugin[] = [];

	for (const [pluginKey, rawEntry] of Object.entries(installed.plugins)) {
		const entries = Array.isArray(rawEntry) ? rawEntry : [rawEntry];
		for (const entry of entries) {
			if (!entry || typeof entry !== "object") continue;
			const scope = entry.scope;
			const installPath = entry.installPath;
			if (!installPath || typeof installPath !== "string") continue;
			if (!scope || !ELIGIBLE_SCOPES.has(scope)) continue;

			if (scope === "local" || scope === "project") {
				if (entry.projectPath !== activeDirectory) {
					continue;
				}
			}

			let realInstallPath: string;
			try {
				realInstallPath = await fs.realpath(installPath);
			} catch (err) {
				console.warn(
					`[claude-plugins] Skipping ${pluginKey}: cannot resolve installPath ${installPath}: ${(err as Error).message}`,
				);
				continue;
			}

			if (!isInside(realInstallPath, cacheRealRoot)) {
				console.warn(
					`[claude-plugins] Skipping ${pluginKey}: installPath ${realInstallPath} escapes plugins cache ${cacheRealRoot}`,
				);
				continue;
			}

			let enabled = false;
			let enabledBy: string | null = null;
			for (const { filePath, enabledPlugins } of settingsLoaded) {
				if (Object.prototype.hasOwnProperty.call(enabledPlugins, pluginKey)) {
					enabled = enabledPlugins[pluginKey] === true;
					enabledBy = filePath;
					break;
				}
			}

			result.push({
				pluginKey,
				pluginName: entry.pluginName ?? pluginKey.split("@")[0] ?? pluginKey,
				installPath,
				enabled,
				enabledBy,
				scope: scope as "user" | "local" | "project",
			});
		}
	}

	return result;
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw) as T;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ENOTDIR") {
			return null;
		}
		console.warn(`[claude-plugins] Failed to read ${filePath}: ${(err as Error).message}`);
		return null;
	}
}

function isInside(child: string, parent: string | null): boolean {
	if (!parent) return false;
	const rel = path.relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function __pluginsScopeGuard(_scope: DiscoveredScope): void {
	// intentional no-op; keeps DiscoveredScope reachable from this module
}
