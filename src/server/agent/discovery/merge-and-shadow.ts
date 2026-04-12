import type { DiscoveredItem, ShadowedItem } from "./types.js";

export interface MergeAndShadowResult {
	items: DiscoveredItem[];
	shadowed: ShadowedItem[];
}

export function mergeAndShadow(
	_candidates: DiscoveredItem[],
): MergeAndShadowResult {
	throw new Error("mergeAndShadow not implemented");
}
