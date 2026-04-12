import type { DiscoveredItem } from "./types.js";

export type BundledSkillMetadata = Omit<DiscoveredItem, "mtimeMs" | "path">;

// UNVERIFIED: bundled on-disk location — metadata hardcoded; actual bundled
// skills on disk path is undocumented. Grep for UNVERIFIED to resolve later.
export const CLAUDE_BUNDLED_SKILLS: ReadonlyArray<BundledSkillMetadata> = [
	{
		name: "simplify",
		type: "skill",
		scope: "bundled",
		harness: "claude",
		origin: "Claude Code",
		description:
			"Review changed code for reuse, quality, and efficiency, then fix issues",
		argumentHint: "[focus]",
		userInvocable: true,
	},
	{
		name: "batch",
		type: "skill",
		scope: "bundled",
		harness: "claude",
		origin: "Claude Code",
		description:
			"Research and plan a large-scale codebase change, then execute in parallel",
		argumentHint: "<instruction>",
		userInvocable: true,
	},
	{
		name: "debug",
		type: "skill",
		scope: "bundled",
		harness: "claude",
		origin: "Claude Code",
		description:
			"Enable debug logging for this session and analyze the session log",
		argumentHint: "[description]",
		userInvocable: true,
	},
	{
		name: "loop",
		type: "skill",
		scope: "bundled",
		harness: "claude",
		origin: "Claude Code",
		description: "Run a prompt or slash command on a recurring interval",
		argumentHint: "[interval] [prompt]",
		userInvocable: true,
	},
	{
		name: "claude-api",
		type: "skill",
		scope: "bundled",
		harness: "claude",
		origin: "Claude Code",
		description: "Build, debug, and optimize Claude API / Anthropic SDK apps",
		userInvocable: true,
	},
];
