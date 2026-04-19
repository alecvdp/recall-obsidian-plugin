/**
 * Recall public API types — validated against real responses from
 * `scripts/probe.ts` on 2026-04-19.
 *
 * Base URL: https://backend.getrecall.ai/api/v1
 * Auth:     Authorization: Bearer sk_...
 *
 * Quirks baked into the surface:
 *  - `id` on List Cards, `card_id` on Get Card / Search. Same underlying UUID;
 *    the API is inconsistent about the field name.
 *  - No pagination on List Cards. `total_count` is returned; the response
 *    contains every matching card. Sync uses `date_from` to bound payload.
 *  - No `source_type` / `source_author` / `duration` / `word_count` fields.
 *    We infer type/channel from `source_url` where useful.
 */

export type IsoDateString = string;

/** Tag object returned on every card. */
export interface RecallTag {
	tag_id: string;
	name: string;
	/** Hierarchical path, e.g. "Productivity / Apps / Obsidian". */
	path: string;
}

/** Chunk of a card's content as returned by Get Card / Search. */
export interface CardChunk {
	chunk_id: string;
	content: string;
	/** Origin within Recall's pipeline, e.g. "notebook" or "reader". */
	source?: string;
	/** Timestamp strings like "(00:00:00)" for audio/video content. */
	timestamps?: string[];
}

/** Card preview shape from List Cards. */
export interface CardPreview {
	id: string;
	title: string;
	created_at: IsoDateString;
	tags: RecallTag[];
	image?: string;
	source_url?: string;
}

/**
 * Full card shape from Get Card. Also identical to the per-document shape
 * returned inside Search results, so `SearchDocument` is an alias.
 *
 * Note the `card_id` field name (not `id`, as in CardPreview).
 */
export interface Card {
	card_id: string;
	title: string;
	created_at: IsoDateString;
	chunks: CardChunk[];
	tags: RecallTag[];
	image?: string;
	source_url?: string;
}

export type SearchDocument = Card;

export interface ListCardsResponse {
	results: CardPreview[];
	total_count: number;
}

export interface ListCardsParams {
	tags?: string;
	date_from?: IsoDateString;
	date_to?: IsoDateString;
	source_url_contains?: string;
}

export interface GetCardParams {
	/** Returns only the chunks most relevant to this query. */
	focus_query?: string;
	/** Cap the number of chunks returned. */
	max_chunks?: number;
}

export interface SearchParams {
	q: string;
	mode?: "focused" | "exhaustive";
	card_id?: string;
	tags?: string;
	date_from?: IsoDateString;
	date_to?: IsoDateString;
	source_url_contains?: string;
}

export interface SearchResponse {
	documents: SearchDocument[];
	total_cards: number;
}
