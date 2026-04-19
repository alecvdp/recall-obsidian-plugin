/**
 * Fetcher adapters that bridge the Recall client to its host environment.
 *
 * - `nodeFetch` uses `globalThis.fetch`. Used by `scripts/probe.ts` and tests.
 * - `obsidianFetch` wraps Obsidian's `requestUrl`, which bypasses CORS on
 *   mobile and is the only HTTP surface that works reliably across platforms.
 */

import { requestUrl } from "obsidian";
import type { Fetcher, FetcherResponse } from "./client";

export const nodeFetch: Fetcher = async ({ url, method, headers }) => {
	const res = await fetch(url, { method, headers });
	const body = await parseBody(res);
	return { status: res.status, body };
};

async function parseBody(res: Response): Promise<unknown> {
	const contentType = res.headers.get("content-type") ?? "";
	const text = await res.text();
	if (!text) return undefined;
	if (contentType.includes("application/json")) {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}
	return text;
}

export const obsidianFetch: Fetcher = async ({ url, method, headers }) => {
	const res = await requestUrl({
		url,
		method,
		headers,
		throw: false,
	});
	return { status: res.status, body: parseObsidianBody(res) };
};

function parseObsidianBody(res: {
	headers: Record<string, string>;
	text: string;
	json: unknown;
}): unknown {
	const contentType = res.headers["content-type"] ?? res.headers["Content-Type"] ?? "";
	if (!res.text) return undefined;
	if (contentType.includes("application/json")) {
		try {
			return res.json;
		} catch {
			return res.text;
		}
	}
	return res.text;
}

export type { FetcherResponse };
