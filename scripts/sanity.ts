/** Compose the first real captured card and print output for inspection. */
import { readFile } from "node:fs/promises";
import { composeNoteFromCard } from "../src/note/compose.ts";
import type { Card } from "../src/recall/types.ts";

async function main(): Promise<void> {
	const raw = await readFile("scripts/captures/get-card.json", "utf8");
	const card = JSON.parse(raw) as Card;
	const note = composeNoteFromCard(card, {
		existing: null,
		syncedAt: new Date("2026-04-19T12:00:00Z"),
	});
	const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(note);
	if (!m) {
		console.error("Expected frontmatter block.");
		process.exit(1);
	}
	console.log("--- frontmatter ---");
	console.log(m[1]);
	console.log("--- body start ---");
	console.log(m[2].slice(0, 800));
	console.log(`... (${m[2].length} chars total body)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
