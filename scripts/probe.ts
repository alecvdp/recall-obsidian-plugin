/**
 * Probe script: hits the real Recall API and dumps raw responses so we can
 * tighten our types against actual data.
 *
 *   RECALL_API_KEY=sk_... node --experimental-strip-types scripts/probe.ts
 *
 * Captures three responses:
 *   1. List Cards (limit=3)         → list-cards.json
 *   2. Get Card (first card id)     → get-card.json
 *   3. Search ("the")               → search.json
 *
 * Output goes to scripts/captures/. Do not commit captures — they contain
 * personal content. The directory is gitignored.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RecallClient } from "../src/recall/client.ts";
import { nodeFetch } from "../src/recall/fetchers.ts";

const apiKey = process.env.RECALL_API_KEY;
if (!apiKey) {
	console.error("Set RECALL_API_KEY in the environment.");
	process.exit(1);
}

const baseUrl = process.env.RECALL_BASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "captures");
await mkdir(outDir, { recursive: true });

const client = new RecallClient({ apiKey, fetcher: nodeFetch, baseUrl });

async function dump(name: string, payload: unknown): Promise<void> {
	const path = join(outDir, `${name}.json`);
	await writeFile(path, JSON.stringify(payload, null, 2) + "\n");
	console.log(`wrote ${path}`);
}

console.log(`Probing ${baseUrl ?? "https://api.getrecall.ai"} ...`);

try {
	const list = await client.listCards({ limit: 3 });
	await dump("list-cards", list);

	const firstId = list.cards[0]?.id;
	if (firstId) {
		const card = await client.getCard(firstId);
		await dump("get-card", card);
	} else {
		console.warn("List Cards returned no items; skipping Get Card.");
	}

	const search = await client.search({ query: "the", limit: 3 });
	await dump("search", search);
} catch (err) {
	console.error("Probe failed:", err);
	process.exit(1);
}
