import type { DiscoveryHarness, DiscoveryResult, DispatchOptions } from "./types.js";

export * from "./types.js";
export { parseCodexConfig } from "./codex-config-parser.js";

export async function dispatchDiscovery(
	harness: DiscoveryHarness,
	_activeDirectory: string,
	_options?: DispatchOptions,
): Promise<DiscoveryResult> {
	throw new Error(`dispatchDiscovery(${harness}) not implemented`);
}
