/**
 * Recall public API types.
 *
 * The official docs do not publish a JSON schema; these types reflect what the
 * docs describe ("List Cards", "Get Card", "Search") and will be tightened
 * against real responses captured by `scripts/probe.ts`.
 *
 * Fields the docs explicitly mark as "omitted when not available" are typed
 * as optional. Anything not mentioned is left out — we do not invent fields.
 */

export type IsoDateString = string;

/** Preview returned by List Cards. */
export interface CardPreview {
	id: string;
	title: string;
	created_at: IsoDateString;
	source_url?: string;
	source_type?: string;
	tags?: string[];
}

/** Single chunk of a card's content. */
export interface CardChunk {
	id?: string;
	content: string;
	/** Some endpoints attach a relevance score when query-targeted. */
	score?: number;
}

/** Full card returned by Get Card, including content chunks. */
export interface Card extends CardPreview {
	chunks: CardChunk[];
	source_author?: string;
	duration_seconds?: number;
	word_count?: number;
}

/** Single hit from semantic Search — chunk-level, not card-level. */
export interface SearchHit {
	card_id: string;
	title: string;
	chunk: CardChunk;
	source_url?: string;
	source_type?: string;
	created_at?: IsoDateString;
}

export interface ListCardsResponse {
	cards: CardPreview[];
	/** Cursor for the next page; absent when no more results. */
	next_cursor?: string;
}

export interface SearchResponse {
	results: SearchHit[];
}

export interface ListCardsParams {
	limit?: number;
	cursor?: string;
	created_after?: IsoDateString;
	created_before?: IsoDateString;
	source_type?: string;
	tag?: string;
}

export interface GetCardParams {
	/** When provided, the API returns the most relevant chunks for this query. */
	query?: string;
}

export interface SearchParams {
	query: string;
	limit?: number;
}
