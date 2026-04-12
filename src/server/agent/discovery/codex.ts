import type { DiscoveryResult } from "./types.js";

export async function discoverCodexItems(
	_activeDirectory: string,
): Promise<DiscoveryResult> {
	throw new Error("discoverCodexItems not implemented");
}
