import { discoverClaudeItems } from "./claude.js";
import type { DiscoveryHarness, DiscoveryResult, DispatchOptions } from "./types.js";

export * from "./types.js";
export { parseCodexConfig } from "./codex-config-parser.js";
export { discoverClaudeItems } from "./claude.js";

export async function dispatchDiscovery(
	harness: DiscoveryHarness,
	activeDirectory: string,
	options?: DispatchOptions,
): Promise<DiscoveryResult> {
	if (harness === "claude") {
		return discoverClaudeItems(activeDirectory, {
			claudeHomeDir: options?.claudeHomeDir,
		});
	}
	throw new Error(`dispatchDiscovery(${harness}) not implemented`);
}
