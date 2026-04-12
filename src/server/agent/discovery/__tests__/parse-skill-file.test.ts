import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSkillFile } from "../parse-skill-file.ts";

let workDir: string;

beforeAll(async () => {
	workDir = await fs.mkdtemp(path.join(os.tmpdir(), "parse-skill-file-"));
});

afterAll(async () => {
	await fs.rm(workDir, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string): Promise<string> {
	const filePath = path.join(workDir, name);
	await fs.writeFile(filePath, content, "utf8");
	return filePath;
}

describe("parseSkillFile", () => {
	it("parses a file with full frontmatter", async () => {
		const filePath = await writeFixture(
			"full.md",
			[
				"---",
				"name: my-skill",
				"description: A useful skill",
				"argument-hint: <foo> [bar]",
				"user-invocable: true",
				"---",
				"",
				"Body content",
				"",
			].join("\n"),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("my-skill");
		expect(result.description).toBe("A useful skill");
		expect(result.argumentHint).toBe("<foo> [bar]");
		expect(result.userInvocable).toBe(true);
		expect(result.path).toBe(filePath);
		expect(typeof result.mtimeMs).toBe("number");
		expect(result.mtimeMs).toBeGreaterThan(0);
	});

	it("falls back to file stem and first paragraph when frontmatter missing", async () => {
		const filePath = await writeFixture(
			"fallback-name.md",
			[
				"This is the first paragraph that should become the description.",
				"Continued on the next line of the same paragraph.",
				"",
				"This is a second paragraph and should be ignored.",
				"",
			].join("\n"),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("fallback-name");
		expect(result.description).toBe(
			"This is the first paragraph that should become the description. Continued on the next line of the same paragraph.",
		);
		expect(result.argumentHint).toBeUndefined();
		expect(result.userInvocable).toBe(true);
	});

	it("treats user-invocable: false as userInvocable false", async () => {
		const filePath = await writeFixture(
			"hidden.md",
			[
				"---",
				"name: hidden",
				"description: not in autocomplete",
				"user-invocable: false",
				"---",
				"",
				"body",
			].join("\n"),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.userInvocable).toBe(false);
	});

	it("returns oversized error for files larger than 256 KB", async () => {
		const filePath = path.join(workDir, "oversized.md");
		const big = "a".repeat(256 * 1024 + 10);
		await fs.writeFile(filePath, big, "utf8");

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.kind).toBe("oversized");
		expect(result.path).toBe(filePath);
		expect(result.message).toMatch(/256 KB/);
	});

	it("handles UTF-8 BOM transparently", async () => {
		const filePath = path.join(workDir, "bom.md");
		const content =
			"\uFEFF---\nname: bom-skill\ndescription: handles bom\n---\nbody";
		await fs.writeFile(filePath, content, "utf8");

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("bom-skill");
		expect(result.description).toBe("handles bom");
	});

	it("collapses multi-line descriptions and truncates to 250 chars without trailing whitespace", async () => {
		const longParagraph = `${"word ".repeat(100).trim()}\nmore text on a second line that pushes way past the limit so we can verify truncation behavior.`;
		const filePath = await writeFixture("long.md", `${longParagraph}\n`);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.description.length).toBeLessThanOrEqual(250);
		expect(result.description).toBe(result.description.trimEnd());
		expect(result.description).not.toMatch(/\n/);
	});

	it("maps argument-hint frontmatter field to argumentHint", async () => {
		const filePath = await writeFixture(
			"hinted.md",
			[
				"---",
				"name: hinted",
				"description: takes args",
				"argument-hint: <target>",
				"---",
				"body",
			].join("\n"),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.argumentHint).toBe("<target>");
	});

	it("returns malformed error when YAML frontmatter is invalid", async () => {
		const filePath = await writeFixture(
			"broken.md",
			["---", "name: broken", "description: : : invalid", "  - [unclosed", "---", "body"].join(
				"\n",
			),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.kind).toBe("malformed");
		expect(result.path).toBe(filePath);
		expect(typeof result.message).toBe("string");
		expect(result.message.length).toBeGreaterThan(0);
	});

	it("falls back to body paragraph when frontmatter has name but no description", async () => {
		const filePath = await writeFixture(
			"name-only.md",
			[
				"---",
				"name: name-only",
				"---",
				"",
				"This paragraph fills in for the missing description.",
				"",
			].join("\n"),
		);

		const result = await parseSkillFile(filePath);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.name).toBe("name-only");
		expect(result.description).toBe(
			"This paragraph fills in for the missing description.",
		);
	});
});
