/**
 * Compose a Card into full note content, preserving user edits on re-sync.
 *
 * Merge rules:
 *  - Frontmatter: user-authored keys preserved. Recall-owned keys overwritten.
 *  - Body: content outside the `%% recall:start/end %%` fence is preserved.
 *    The fenced contents are replaced with freshly concatenated chunks.
 *  - First-ever sync: a fence is created; no user content yet.
 *  - First sync into a user-authored note: fence is prepended; the user's
 *    existing body moves into the `after` section.
 */

import type { Card, RecallTag } from "../recall/types";
import {
	composeNote,
	mergeRecallFields,
	parseNote,
	type RecallFrontmatter,
} from "./frontmatter";
import { splitBody, upsertManagedBody } from "./fence";

export interface ComposeContext {
	/** Full text of the existing note, or null if the note is new. */
	existing: string | null;
	/** Time of this sync; injected for testability. */
	syncedAt: Date;
	/** URL back to the card in the Recall web app, if caller can build one. */
	recallUrl?: string;
}

export function composeNoteFromCard(card: Card, ctx: ComposeContext): string {
	const parsed = ctx.existing === null
		? { frontmatter: {} as Record<string, unknown>, body: "", hadFrontmatter: false }
		: parseNote(ctx.existing);

	const recallFields = cardToFrontmatter(card, ctx);
	const mergedFm = mergeRecallFields(parsed.frontmatter, recallFields);
	const managed = concatenateChunks(card);
	const mergedBody = upsertManagedBody(parsed.body, managed);

	return composeNote({ frontmatter: mergedFm, body: mergedBody });
}

/**
 * Expose the parse+merge seam so commands that only touch frontmatter
 * (e.g. "Promote to permanent note" setting `promoted_to`) can reuse it.
 */
export function updateFrontmatter(
	existing: string,
	patch: Record<string, unknown>,
): string {
	const parsed = parseNote(existing);
	const next = { ...parsed.frontmatter, ...patch };
	return composeNote({ frontmatter: next, body: parsed.body });
}

/** Extracted so tests can assert the exact mapping rule. */
export function cardToFrontmatter(
	card: Card,
	ctx: ComposeContext,
): Partial<RecallFrontmatter> {
	const fm: Partial<RecallFrontmatter> = {
		recall_id: card.card_id,
		title: card.title,
		created_at: card.created_at,
		synced_at: ctx.syncedAt.toISOString(),
	};
	if (ctx.recallUrl) fm.recall_url = ctx.recallUrl;
	if (card.source_url) {
		fm.source_url = card.source_url;
		const domain = extractDomain(card.source_url);
		if (domain) fm.source_domain = domain;
	}
	if (card.image) fm.image = card.image;
	if (card.tags && card.tags.length > 0) {
		fm.recall_tags = card.tags.map((t: RecallTag) => t.name);
		fm.recall_tag_paths = card.tags.map((t: RecallTag) => t.path);
	}
	return fm;
}

function concatenateChunks(card: Card): string {
	return card.chunks
		.map((c) => c.content.trim())
		.filter((s) => s.length > 0)
		.join("\n\n");
}

function extractDomain(url: string): string | undefined {
	try {
		const host = new URL(url).hostname;
		return host.replace(/^www\./, "") || undefined;
	} catch {
		return undefined;
	}
}

export { splitBody };
