/**
 * Compose a Card into full note content, preserving user edits on re-sync.
 *
 * Merge rules:
 *  - Frontmatter: user-authored keys are preserved. Recall-owned keys are
 *    overwritten (see `mergeRecallFields`).
 *  - Body: anything outside the `%% recall:start/end %%` fence is preserved.
 *    The fence's contents are replaced with freshly concatenated chunks.
 *  - First-ever sync: a fence is created; there is no user content yet.
 *  - First sync into a user-authored note: fence is prepended; the user's
 *    existing body moves into the `after` section.
 */

import type { Card } from "../recall/types";
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
	/**
	 * URL back to the card in the Recall web app. The public API doesn't
	 * always return this, so it's passed in explicitly by the caller that
	 * knows how to construct it.
	 */
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
		recall_id: card.id,
		title: card.title,
		created_at: card.created_at,
		synced_at: ctx.syncedAt.toISOString(),
	};
	if (ctx.recallUrl) fm.recall_url = ctx.recallUrl;
	if (card.source_url) fm.source_url = card.source_url;
	if (card.source_type) fm.source_type = card.source_type;
	if (card.source_author) fm.source_author = card.source_author;
	if (card.duration_seconds !== undefined)
		fm.duration_seconds = card.duration_seconds;
	if (card.word_count !== undefined) fm.word_count = card.word_count;
	if (card.tags && card.tags.length > 0) fm.recall_tags = [...card.tags];
	return fm;
}

function concatenateChunks(card: Card): string {
	return card.chunks
		.map((c) => c.content.trim())
		.filter((s) => s.length > 0)
		.join("\n\n");
}

export { splitBody };
