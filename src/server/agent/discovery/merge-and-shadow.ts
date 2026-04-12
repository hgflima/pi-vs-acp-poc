import type { DiscoveredItem, ShadowedItem } from "./types.js";

export interface MergeAndShadowResult {
	items: DiscoveredItem[];
	shadowed: ShadowedItem[];
}

const SCOPE_ORDER: Record<DiscoveredItem["scope"], number> = {
	personal: 0,
	project: 1,
	plugin: 2,
	bundled: 3,
	enterprise: -1,
};

export function mergeAndShadow(
	candidates: DiscoveredItem[],
): MergeAndShadowResult {
	const shadowed: ShadowedItem[] = [];

	const nonPlugin: DiscoveredItem[] = [];
	const plugin: DiscoveredItem[] = [];
	const bundled: DiscoveredItem[] = [];
	for (const item of candidates) {
		if (item.scope === "bundled") bundled.push(item);
		else if (item.scope === "plugin") plugin.push(item);
		else nonPlugin.push(item);
	}

	const afterStep1 = stepSkillOverCommand(nonPlugin, shadowed);
	const afterStep2 = stepPersonalOverProject(afterStep1, shadowed);
	const afterStep3 = stepPluginDedupe(plugin, shadowed);
	const afterStep4 = stepBundledShadow(bundled, afterStep2, afterStep3, shadowed);

	const items = sortFinal([...afterStep2, ...afterStep3, ...afterStep4]);
	return { items, shadowed };
}

function stepSkillOverCommand(
	items: DiscoveredItem[],
	shadowed: ShadowedItem[],
): DiscoveredItem[] {
	const skillKeys = new Set<string>();
	for (const item of items) {
		if (item.type === "skill") {
			skillKeys.add(`${item.scope}::${item.name}`);
		}
	}
	const skillByKey = new Map<string, DiscoveredItem>();
	for (const item of items) {
		if (item.type === "skill") {
			skillByKey.set(`${item.scope}::${item.name}`, item);
		}
	}

	const survivors: DiscoveredItem[] = [];
	for (const item of items) {
		if (item.type === "command") {
			const key = `${item.scope}::${item.name}`;
			const winner = skillByKey.get(key);
			if (winner) {
				shadowed.push({ item, shadowedBy: winner, reason: "skill-over-command" });
				continue;
			}
		}
		survivors.push(item);
	}
	return survivors;
}

function stepPersonalOverProject(
	items: DiscoveredItem[],
	shadowed: ShadowedItem[],
): DiscoveredItem[] {
	const personalByName = new Map<string, DiscoveredItem>();
	for (const item of items) {
		if (item.scope === "personal") {
			const existing = personalByName.get(item.name);
			if (!existing) personalByName.set(item.name, item);
		}
	}

	const survivors: DiscoveredItem[] = [];
	for (const item of items) {
		if (item.scope === "project") {
			const winner = personalByName.get(item.name);
			if (winner) {
				shadowed.push({ item, shadowedBy: winner, reason: "lower-scope" });
				continue;
			}
		}
		survivors.push(item);
	}
	return survivors;
}

function stepPluginDedupe(
	items: DiscoveredItem[],
	shadowed: ShadowedItem[],
): DiscoveredItem[] {
	const winners = new Map<string, DiscoveredItem>();
	const losers: ShadowedItem[] = [];
	for (const item of items) {
		const key = `${item.pluginName ?? ""}::${item.name}`;
		const existing = winners.get(key);
		if (!existing) {
			winners.set(key, item);
			continue;
		}
		if (item.mtimeMs > existing.mtimeMs) {
			losers.push({
				item: existing,
				shadowedBy: item,
				reason: "duplicate-plugin-install",
			});
			winners.set(key, item);
		} else {
			losers.push({
				item,
				shadowedBy: existing,
				reason: "duplicate-plugin-install",
			});
		}
	}
	for (const entry of losers) shadowed.push(entry);
	return Array.from(winners.values());
}

function stepBundledShadow(
	bundled: DiscoveredItem[],
	nonPluginSurvivors: DiscoveredItem[],
	pluginSurvivors: DiscoveredItem[],
	shadowed: ShadowedItem[],
): DiscoveredItem[] {
	const userNames = new Map<string, DiscoveredItem>();
	for (const item of nonPluginSurvivors) userNames.set(item.name, item);
	for (const item of pluginSurvivors) userNames.set(item.name, item);

	const survivors: DiscoveredItem[] = [];
	for (const item of bundled) {
		const winner = userNames.get(item.name);
		if (winner) {
			shadowed.push({ item, shadowedBy: winner, reason: "user-override-bundled" });
			continue;
		}
		survivors.push(item);
	}
	return survivors;
}

function sortFinal(items: DiscoveredItem[]): DiscoveredItem[] {
	return [...items].sort((a, b) => {
		const scopeDiff = (SCOPE_ORDER[a.scope] ?? 99) - (SCOPE_ORDER[b.scope] ?? 99);
		if (scopeDiff !== 0) return scopeDiff;
		return a.name.localeCompare(b.name);
	});
}
