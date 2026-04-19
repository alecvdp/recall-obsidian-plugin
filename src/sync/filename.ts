/**
 * Filename derivation and sanitization.
 *
 * Obsidian forbids these characters in vault filenames on at least one
 * supported platform: `/ \ : * ? " < > |`. We also strip control chars and
 * collapse whitespace so the output is safe cross-platform.
 *
 * Reserved Windows names (CON, PRN, …) are rare enough in real card titles
 * that we don't preemptively rewrite them; if a user hits one, Obsidian
 * will surface an error on save and we'll revisit.
 */

const FORBIDDEN_CHARS = /[\/\\:*?"<>|\x00-\x1f]/g;
const WHITESPACE_COLLAPSE = /\s+/g;
const MAX_LENGTH = 200;

export function sanitizeTitle(raw: string): string {
	const cleaned = raw
		.replace(FORBIDDEN_CHARS, " ")
		.replace(WHITESPACE_COLLAPSE, " ")
		.trim();
	if (cleaned.length <= MAX_LENGTH) return cleaned;
	// Truncate at a word boundary if we can, otherwise hard cut.
	const hardCut = cleaned.slice(0, MAX_LENGTH);
	const lastSpace = hardCut.lastIndexOf(" ");
	return lastSpace > MAX_LENGTH * 0.6
		? hardCut.slice(0, lastSpace)
		: hardCut;
}

export interface FilenameContext {
	title: string;
	id: string;
	createdAt: string;
}

/**
 * Apply a template like `{{title}}` or `{{date}}-{{title}}` to produce a
 * filename stem (no extension). The template is substituted mechanically;
 * the caller appends ".md".
 */
export function renderFilenameStem(
	template: string,
	ctx: FilenameContext,
): string {
	const title = sanitizeTitle(ctx.title) || "Untitled";
	const shortId = ctx.id.slice(0, 8);
	const date = isoToYmd(ctx.createdAt);

	const stem = template
		.replace(/\{\{\s*title\s*\}\}/g, title)
		.replace(/\{\{\s*id\s*\}\}/g, ctx.id)
		.replace(/\{\{\s*shortId\s*\}\}/g, shortId)
		.replace(/\{\{\s*date\s*\}\}/g, date);

	// Sanitize the result again in case the template produced forbidden chars
	// (tokens themselves are safe, but users may add separators like `:`).
	return sanitizeTitle(stem) || "Untitled";
}

function isoToYmd(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "0000-00-00";
	return d.toISOString().slice(0, 10);
}
