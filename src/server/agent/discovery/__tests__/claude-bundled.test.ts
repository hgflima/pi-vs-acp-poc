import { describe, expect, it } from "vitest";
import { CLAUDE_BUNDLED_SKILLS } from "../claude-bundled.js";

describe("CLAUDE_BUNDLED_SKILLS", () => {
	it("contains exactly 5 entries", () => {
		expect(CLAUDE_BUNDLED_SKILLS).toHaveLength(5);
	});

	it("has the expected skill names in order", () => {
		expect(CLAUDE_BUNDLED_SKILLS.map((s) => s.name)).toEqual([
			"simplify",
			"batch",
			"debug",
			"loop",
			"claude-api",
		]);
	});

	it("every entry has scope 'bundled'", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.scope).toBe("bundled");
		}
	});

	it("every entry has harness 'claude'", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.harness).toBe("claude");
		}
	});

	it("every entry has origin 'Claude Code'", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.origin).toBe("Claude Code");
		}
	});

	it("every entry has type 'skill'", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.type).toBe("skill");
		}
	});

	it("every entry is userInvocable", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.userInvocable).toBe(true);
		}
	});

	it("no entry has an empty description", () => {
		for (const entry of CLAUDE_BUNDLED_SKILLS) {
			expect(entry.description.trim().length).toBeGreaterThan(0);
		}
	});
});
