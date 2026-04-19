/**
 * Parse and serialize Obsidian-style YAML frontmatter.
 *
 * Design invariants:
 *  - A note may have user-authored frontmatter keys the plugin doesn't own.
 *    Parse preserves them; serialize writes them back untouched.
 *  - Recall-managed keys always overwrite their same-named user key on sync.
 *    Callers merge with `{ ...user, ...recall }`.
 *  - Key order on write is deterministic: canonical Recall keys in a fixed
 *    order first, then any additional keys alphabetically. This keeps diffs
 *    stable across re-syncs.
 */

import { dump as yamlDump, load as yamlLoad } from "js-yaml";

/** Canonical Recall-managed frontmatter shape. */
export interface RecallFrontmatter {
	recall_id: string;
	title: string;
	created_at: string;
	synced_at: string;
	recall_url?: string;
	source_url?: string;
	source_type?: string;
	source_author?: string;
	duration_seconds?: number;
	word_count?: number;
	recall_tags?: string[];
	processed?: boolean;
	promoted_to?: string;
}

/** Every key the plugin manages, in canonical write order. */
export const RECALL_KEYS = [
	"recall_id",
	"recall_url",
	"title",
	"source_url",
	"source_type",
	"source_author",
	"created_at",
	"synced_at",
	"duration_seconds",
	"word_count",
	"recall_tags",
	"processed",
	"promoted_to",
] as const satisfies readonly (keyof RecallFrontmatter)[];

export type FrontmatterRecord = Record<string, unknown>;

export interface ParsedNote {
	/** All frontmatter keys, unmodified. Empty object if none present. */
	frontmatter: FrontmatterRecord;
	/** Note body, excluding the frontmatter block and its delimiters. */
	body: string;
	/** Whether the input actually started with a frontmatter block. */
	hadFrontmatter: boolean;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseNote(content: string): ParsedNote {
	const match = FRONTMATTER_RE.exec(content);
	if (!match) {
		return { frontmatter: {}, body: content, hadFrontmatter: false };
	}
	const yaml = match[1];
	const body = content.slice(match[0].length);
	let parsed: unknown;
	try {
		parsed = yamlLoad(yaml);
	} catch {
		// Corrupt frontmatter — treat as body so we don't eat user content.
		return { frontmatter: {}, body: content, hadFrontmatter: false };
	}
	if (parsed === null || parsed === undefined) {
		return { frontmatter: {}, body, hadFrontmatter: true };
	}
	if (typeof parsed !== "object" || Array.isArray(parsed)) {
		return { frontmatter: {}, body: content, hadFrontmatter: false };
	}
	return {
		frontmatter: parsed as FrontmatterRecord,
		body,
		hadFrontmatter: true,
	};
}

export interface ComposeOptions {
	frontmatter: FrontmatterRecord;
	body: string;
}

export function composeNote({ frontmatter, body }: ComposeOptions): string {
	if (Object.keys(frontmatter).length === 0) return body;
	const ordered = orderForWrite(frontmatter);
	const yaml = yamlDump(ordered, {
		lineWidth: -1,
		noRefs: true,
		quotingType: '"',
		forceQuotes: false,
	}).trimEnd();
	return `---\n${yaml}\n---\n${body}`;
}

function orderForWrite(fm: FrontmatterRecord): FrontmatterRecord {
	const out: FrontmatterRecord = {};
	const known = new Set<string>(RECALL_KEYS);
	for (const key of RECALL_KEYS) {
		if (key in fm && fm[key] !== undefined) out[key] = fm[key];
	}
	const extras = Object.keys(fm)
		.filter((k) => !known.has(k) && fm[k] !== undefined)
		.sort();
	for (const key of extras) out[key] = fm[key];
	return out;
}

/**
 * Merge fresh Recall data into existing frontmatter, preserving user keys.
 * Recall keys overwrite whatever was there; undefined Recall values clear
 * the corresponding key so optional fields don't stick around after a card
 * stops having e.g. a duration.
 */
export function mergeRecallFields(
	existing: FrontmatterRecord,
	recall: Partial<RecallFrontmatter>,
): FrontmatterRecord {
	const merged: FrontmatterRecord = { ...existing };
	for (const key of RECALL_KEYS) {
		const value = recall[key];
		if (value === undefined) delete merged[key];
		else merged[key] = value as unknown;
	}
	return merged;
}
