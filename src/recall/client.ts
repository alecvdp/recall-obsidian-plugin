/**
 * HTTP client for the Recall public API.
 *
 * The client is fetcher-agnostic so it can run inside Obsidian (where we
 * inject a wrapper around `requestUrl` to dodge CORS on mobile) and inside a
 * plain Node probe script (where it uses `globalThis.fetch`).
 */

import { errorForStatus, RecallApiError } from "./errors";
import type {
	Card,
	GetCardParams,
	ListCardsParams,
	ListCardsResponse,
	SearchParams,
	SearchResponse,
} from "./types";

export const DEFAULT_BASE_URL = "https://api.getrecall.ai";

export interface FetcherResponse {
	status: number;
	body: unknown;
}

/**
 * Minimal HTTP surface the client depends on.
 *
 * `body` is the parsed JSON if Content-Type was JSON, otherwise the raw text
 * (or undefined for empty bodies). Implementations must not throw on non-2xx;
 * the client classifies status codes itself.
 */
export type Fetcher = (init: {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
}) => Promise<FetcherResponse>;

export interface RecallClientOptions {
	apiKey: string;
	fetcher: Fetcher;
	baseUrl?: string;
}

export class RecallClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly fetcher: Fetcher;

	constructor(opts: RecallClientOptions) {
		if (!opts.apiKey) {
			throw new Error("RecallClient requires an apiKey.");
		}
		this.apiKey = opts.apiKey;
		this.fetcher = opts.fetcher;
		this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
	}

	async listCards(params: ListCardsParams = {}): Promise<ListCardsResponse> {
		return this.request<ListCardsResponse>(
			"GET",
			"/v1/cards",
			toQuery(params),
		);
	}

	/**
	 * Yield every card across every page. Caller decides when to stop (e.g.
	 * once it sees a card older than the last sync cursor).
	 */
	async *iterateCards(
		params: ListCardsParams = {},
	): AsyncGenerator<ListCardsResponse["cards"][number]> {
		let cursor = params.cursor;
		do {
			const page = await this.listCards({ ...params, cursor });
			for (const card of page.cards) yield card;
			cursor = page.next_cursor;
		} while (cursor);
	}

	async getCard(id: string, params: GetCardParams = {}): Promise<Card> {
		if (!id) throw new Error("getCard requires a card id.");
		return this.request<Card>(
			"GET",
			`/v1/cards/${encodeURIComponent(id)}`,
			toQuery(params),
		);
	}

	async search(params: SearchParams): Promise<SearchResponse> {
		if (!params.query) throw new Error("search requires a query.");
		return this.request<SearchResponse>("GET", "/v1/search", toQuery(params));
	}

	/** Lightweight call used by the settings tab to validate a key. */
	async ping(): Promise<void> {
		await this.listCards({ limit: 1 });
	}

	private async request<T>(
		method: "GET" | "POST",
		path: string,
		query: string,
	): Promise<T> {
		const url = `${this.baseUrl}${path}${query}`;
		const res = await this.fetcher({
			url,
			method,
			headers: {
				Authorization: this.apiKey,
				Accept: "application/json",
			},
		});

		if (res.status >= 200 && res.status < 300) {
			return res.body as T;
		}
		throw errorForStatus(res.status, res.body);
	}
}

function toQuery(params: object): string {
	const entries: [string, string][] = [];
	for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
		if (v === undefined || v === null) continue;
		entries.push([k, String(v)]);
	}
	if (entries.length === 0) return "";
	const usp = new URLSearchParams(entries);
	return `?${usp.toString()}`;
}

/** Re-export so callers don't need a second import. */
export { RecallApiError };
