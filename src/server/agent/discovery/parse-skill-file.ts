import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ParseSkillFileSuccess {
	ok: true;
	name: string;
	description: string;
	argumentHint?: string;
	userInvocable: boolean;
	path: string;
	mtimeMs: number;
}

export interface ParseSkillFileError {
	ok: false;
	path: string;
	kind: "oversized" | "malformed" | "unreadable";
	message: string;
}

export type ParseSkillFileResult = ParseSkillFileSuccess | ParseSkillFileError;

const MAX_FILE_BYTES = 256 * 1024;
const MAX_DESCRIPTION_LENGTH = 250;

export async function parseSkillFile(
	filePath: string,
): Promise<ParseSkillFileResult> {
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(filePath);
	} catch (err) {
		return {
			ok: false,
			path: filePath,
			kind: "unreadable",
			message: err instanceof Error ? err.message : String(err),
		};
	}

	if (stat.size > MAX_FILE_BYTES) {
		return {
			ok: false,
			path: filePath,
			kind: "oversized",
			message: "file exceeds 256 KB limit",
		};
	}

	let raw: string;
	try {
		raw = await fs.readFile(filePath, "utf8");
	} catch (err) {
		return {
			ok: false,
			path: filePath,
			kind: "unreadable",
			message: err instanceof Error ? err.message : String(err),
		};
	}

	let parsed: ReturnType<typeof matter>;
	try {
		parsed = matter(raw);
	} catch (err) {
		return {
			ok: false,
			path: filePath,
			kind: "malformed",
			message: err instanceof Error ? err.message : String(err),
		};
	}

	const data = (parsed.data ?? {}) as Record<string, unknown>;

	const frontmatterName =
		typeof data.name === "string" && data.name.trim().length > 0
			? data.name.trim()
			: undefined;
	const name = frontmatterName ?? stemOf(filePath);

	const frontmatterDescription =
		typeof data.description === "string" && data.description.trim().length > 0
			? collapseAndTruncate(data.description)
			: undefined;
	const description =
		frontmatterDescription ?? deriveDescriptionFromBody(parsed.content);

	const argumentHintRaw = data["argument-hint"];
	const argumentHint =
		typeof argumentHintRaw === "string" && argumentHintRaw.trim().length > 0
			? argumentHintRaw.trim()
			: undefined;

	const userInvocableRaw = data["user-invocable"];
	const userInvocable = userInvocableRaw === false ? false : true;

	const result: ParseSkillFileSuccess = {
		ok: true,
		name,
		description,
		userInvocable,
		path: filePath,
		mtimeMs: stat.mtimeMs,
	};
	if (argumentHint !== undefined) {
		result.argumentHint = argumentHint;
	}
	return result;
}

function stemOf(filePath: string): string {
	const base = path.basename(filePath);
	const ext = path.extname(base);
	return ext ? base.slice(0, -ext.length) : base;
}

function collapseAndTruncate(input: string): string {
	const collapsed = input.replace(/\s+/g, " ").trim();
	if (collapsed.length <= MAX_DESCRIPTION_LENGTH) {
		return collapsed;
	}
	return collapsed.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd();
}

function deriveDescriptionFromBody(body: string): string {
	if (!body) return "";
	const normalized = body.replace(/\r\n/g, "\n");
	const paragraphs = normalized.split(/\n\s*\n/);
	for (const paragraph of paragraphs) {
		const trimmed = paragraph.trim();
		if (trimmed.length > 0) {
			return collapseAndTruncate(trimmed);
		}
	}
	return "";
}
