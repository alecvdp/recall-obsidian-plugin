/**
 * Obsidian fetcher: wraps `requestUrl` to bypass CORS on mobile.
 * Only importable from within the plugin runtime where "obsidian" resolves.
 */

import { requestUrl } from "obsidian";
import type { Fetcher } from "./client";

export const obsidianFetch: Fetcher = async ({ url, method, headers }) => {
	const res = await requestUrl({
		url,
		method,
		headers,
		throw: false,
	});
	return { status: res.status, body: parseBody(res) };
};

function parseBody(res: {
	headers: Record<string, string>;
	text: string;
	json: unknown;
}): unknown {
	const contentType =
		res.headers["content-type"] ?? res.headers["Content-Type"] ?? "";
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
