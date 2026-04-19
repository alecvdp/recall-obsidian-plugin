/**
 * Node fetcher: used by `scripts/probe.ts` and tests.
 * Must not import from "obsidian" — that package only resolves inside a vault.
 */

import type { Fetcher } from "./client";

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
