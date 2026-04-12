import { describe, expect, it } from "vitest";

import { mergeAndShadow } from "../merge-and-shadow.js";
import type { DiscoveredItem } from "../types.js";

function makeItem(overrides: Partial<DiscoveredItem>): DiscoveredItem {
	return {
		name: "thing",
		type: "skill",
		scope: "personal",
		harness: "claude",
		origin: "~/.claude/skills",
		description: "",
		userInvocable: true,
		path: "/tmp/thing/SKILL.md",
		mtimeMs: 1000,
		...overrides,
	};
}

describe("mergeAndShadow", () => {
	it("happy path with no collisions returns all items in scope order alphabetical", () => {
		const candidates: DiscoveredItem[] = [
			makeItem({ name: "zeta", scope: "project" }),
			makeItem({ name: "alpha", scope: "personal" }),
			makeItem({
				name: "octo:do",
				scope: "plugin",
				pluginName: "octo",
				pluginKey: "octo@market",
			}),
			makeItem({ name: "beta", scope: "personal" }),
			makeItem({ name: "bundled-thing", scope: "bundled" }),
		];

		const result = mergeAndShadow(candidates);

		expect(result.shadowed).toEqual([]);
		expect(result.items.map((i) => `${i.scope}:${i.name}`)).toEqual([
			"personal:alpha",
			"personal:beta",
			"project:zeta",
			"plugin:octo:do",
			"bundled:bundled-thing",
		]);
	});

	it("skill beats command at same scope and same name", () => {
		const skill = makeItem({
			name: "deploy",
			type: "skill",
			scope: "project",
			path: "/tmp/skill",
		});
		const command = makeItem({
			name: "deploy",
			type: "command",
			scope: "project",
			path: "/tmp/command",
		});

		const result = mergeAndShadow([command, skill]);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.type).toBe("skill");
		expect(result.shadowed).toHaveLength(1);
		expect(result.shadowed[0]).toMatchObject({
			reason: "skill-over-command",
		});
		expect(result.shadowed[0]?.item.type).toBe("command");
		expect(result.shadowed[0]?.shadowedBy.type).toBe("skill");
	});

	it("skill at one scope does not shadow command at a different scope", () => {
		const skill = makeItem({
			name: "deploy",
			type: "skill",
			scope: "personal",
		});
		const command = makeItem({
			name: "deploy",
			type: "command",
			scope: "project",
		});

		const result = mergeAndShadow([skill, command]);

		// Step 1 leaves both alone (different scopes), but Step 2 then
		// shadows the project-scope command with the personal-scope skill.
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.scope).toBe("personal");
		expect(result.shadowed).toHaveLength(1);
		expect(result.shadowed[0]?.reason).toBe("lower-scope");
	});

	it("personal beats project for non-plugin items with the same name", () => {
		const personal = makeItem({ name: "tool", scope: "personal" });
		const project = makeItem({ name: "tool", scope: "project" });

		const result = mergeAndShadow([project, personal]);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.scope).toBe("personal");
		expect(result.shadowed).toHaveLength(1);
		expect(result.shadowed[0]).toMatchObject({ reason: "lower-scope" });
		expect(result.shadowed[0]?.item.scope).toBe("project");
		expect(result.shadowed[0]?.shadowedBy.scope).toBe("personal");
	});

	it("plugin item with short name colliding with personal item leaves both present", () => {
		const personal = makeItem({ name: "deploy", scope: "personal" });
		const pluginItem = makeItem({
			name: "octo:deploy",
			scope: "plugin",
			pluginName: "octo",
			pluginKey: "octo@market",
		});

		const result = mergeAndShadow([personal, pluginItem]);

		expect(result.items).toHaveLength(2);
		expect(result.items.map((i) => i.name).sort()).toEqual([
			"deploy",
			"octo:deploy",
		]);
		expect(result.shadowed).toEqual([]);
	});

	it("two plugin installs with same pluginName + name shadow the older by mtime", () => {
		const older = makeItem({
			name: "octo:do",
			scope: "plugin",
			pluginName: "octo",
			pluginKey: "octo@market",
			mtimeMs: 1000,
			path: "/tmp/old",
		});
		const newer = makeItem({
			name: "octo:do",
			scope: "plugin",
			pluginName: "octo",
			pluginKey: "octo@other",
			mtimeMs: 2000,
			path: "/tmp/new",
		});

		const result = mergeAndShadow([older, newer]);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.path).toBe("/tmp/new");
		expect(result.shadowed).toHaveLength(1);
		expect(result.shadowed[0]).toMatchObject({
			reason: "duplicate-plugin-install",
		});
		expect(result.shadowed[0]?.item.path).toBe("/tmp/old");
		expect(result.shadowed[0]?.shadowedBy.path).toBe("/tmp/new");
	});

	it("bundled skill is shadowed when a user skill exists with the same name", () => {
		const userSkill = makeItem({ name: "simplify", scope: "personal" });
		const bundled = makeItem({ name: "simplify", scope: "bundled" });

		const result = mergeAndShadow([userSkill, bundled]);

		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.scope).toBe("personal");
		expect(result.shadowed).toHaveLength(1);
		expect(result.shadowed[0]).toMatchObject({
			reason: "user-override-bundled",
		});
		expect(result.shadowed[0]?.item.scope).toBe("bundled");
	});

	it("bundled skills appear when no user override exists", () => {
		const bundled1 = makeItem({ name: "simplify", scope: "bundled" });
		const bundled2 = makeItem({ name: "debug", scope: "bundled" });

		const result = mergeAndShadow([bundled1, bundled2]);

		expect(result.items).toHaveLength(2);
		expect(result.items.map((i) => i.name)).toEqual(["debug", "simplify"]);
		expect(result.shadowed).toEqual([]);
	});

	it("final order is personal → project → plugin → bundled, alphabetical within group", () => {
		const candidates: DiscoveredItem[] = [
			makeItem({ name: "z-bundled", scope: "bundled" }),
			makeItem({ name: "a-bundled", scope: "bundled" }),
			makeItem({
				name: "b:plugin",
				scope: "plugin",
				pluginName: "b",
				pluginKey: "b@market",
			}),
			makeItem({
				name: "a:plugin",
				scope: "plugin",
				pluginName: "a",
				pluginKey: "a@market",
			}),
			makeItem({ name: "z-project", scope: "project" }),
			makeItem({ name: "a-project", scope: "project" }),
			makeItem({ name: "z-personal", scope: "personal" }),
			makeItem({ name: "a-personal", scope: "personal" }),
		];

		const result = mergeAndShadow(candidates);

		expect(result.items.map((i) => `${i.scope}:${i.name}`)).toEqual([
			"personal:a-personal",
			"personal:z-personal",
			"project:a-project",
			"project:z-project",
			"plugin:a:plugin",
			"plugin:b:plugin",
			"bundled:a-bundled",
			"bundled:z-bundled",
		]);
		expect(result.shadowed).toEqual([]);
	});
});
