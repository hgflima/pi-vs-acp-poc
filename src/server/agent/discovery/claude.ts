import type { DiscoveryResult } from "./types.js";

export interface DiscoverClaudeOptions {
	claudeHomeDir?: string;
}

export async function discoverClaudeItems(
	_activeDirectory: string,
	_options?: DiscoverClaudeOptions,
): Promise<DiscoveryResult> {
	throw new Error("discoverClaudeItems not implemented");
}
