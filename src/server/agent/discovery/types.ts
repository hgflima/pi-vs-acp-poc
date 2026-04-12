export type DiscoveredItemType = "skill" | "command" | "subagent";

export type DiscoveredScope =
	| "personal"
	| "project"
	| "plugin"
	| "bundled"
	| "enterprise";

export type DiscoveryHarness = "claude" | "codex" | "gemini";

export interface DiscoveredItem {
	name: string;
	type: DiscoveredItemType;
	scope: DiscoveredScope;
	harness: DiscoveryHarness;
	origin: string;
	description: string;
	argumentHint?: string;
	userInvocable: boolean;
	path: string;
	mtimeMs: number;
	pluginKey?: string;
	pluginName?: string;
}

export type ShadowReason =
	| "skill-over-command"
	| "lower-scope"
	| "duplicate-plugin-install"
	| "user-override-bundled";

export interface ShadowedItem {
	item: DiscoveredItem;
	shadowedBy: DiscoveredItem;
	reason: ShadowReason;
}

export interface DiscoverySource {
	path: string;
	scope: DiscoveredScope;
	exists: boolean;
	itemsFound: number;
	pluginKey?: string;
	pluginName?: string;
}

export interface DiscoveryError {
	path: string;
	message: string;
	kind: "oversized" | "malformed" | "unreadable";
}

export interface DiscoveryResult {
	items: DiscoveredItem[];
	shadowed: ShadowedItem[];
	sources: DiscoverySource[];
	errors: DiscoveryError[];
}

export interface DispatchOptions {
	scope?: DiscoveredScope;
	includeShadowed?: boolean;
	claudeHomeDir?: string;
}
