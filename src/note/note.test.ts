/**
 * Round-trip tests for frontmatter + fence + compose.
 *
 * Invariants, in priority order:
 *  1. User content below the fence survives re-sync.
 *  2. User-authored frontmatter keys survive re-sync.
 *  3. Recall-managed content is always overwritten with fresh data.
 *  4. First-ever sync into a pre-existing user note moves user content
 *     below the fence, not above it.
 *  5. Notes with no frontmatter block parse back to { fm: {}, body: input }.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { Card } from "../recall/types";
import { composeNoteFromCard, updateFrontmatter } from "./compose";
import { FENCE_END, FENCE_START, splitBody } from "./fence";
import { composeNote, mergeRecallFields, parseNote } from "./frontmatter";

const SYNC_TIME = new Date("2026-04-19T12:00:00Z");

const BASE_CARD: Card = {
	card_id: "d78d7ed5-1404-4cf3-ad83-09b4b38dee0a",
	title: "How Rust's borrow checker evolved",
	created_at: "2026-04-18T10:00:00.000000+00:00",
	source_url: "https://www.youtube.com/watch?v=abc123",
	image: "https://i.ytimg.com/vi/abc123/sddefault.jpg",
	tags: [
		{ tag_id: "t1", name: "Rust", path: "Technology / Programming / Rust" },
		{ tag_id: "t2", name: "PLT", path: "Technology / Programming" },
	],
	chunks: [
		{ chunk_id: "c1", content: "First chunk about borrowing.\n" },
		{ chunk_id: "c2", content: "\nSecond chunk about lifetimes." },
	],
};

describe("parseNote / composeNote", () => {
	it("round-trips a note with full frontmatter and body", () => {
		const fm = { recall_id: "x", title: "T", created_at: "t", synced_at: "t" };
		const original = composeNote({ frontmatter: fm, body: "hello\n" });
		const parsed = parseNote(original);
		assert.equal(parsed.hadFrontmatter, true);
		assert.deepEqual(parsed.frontmatter, fm);
		assert.equal(parsed.body, "hello\n");
	});

	it("returns body unchanged when there is no frontmatter", () => {
		const parsed = parseNote("just some notes\nno yaml here\n");
		assert.equal(parsed.hadFrontmatter, false);
		assert.deepEqual(parsed.frontmatter, {});
		assert.equal(parsed.body, "just some notes\nno yaml here\n");
	});

	it("preserves user-authored frontmatter keys on write-back", () => {
		const fm = {
			recall_id: "x",
			title: "T",
			created_at: "t",
			synced_at: "t",
			aliases: ["alt-title"],
			custom_tag: "mine",
		};
		const out = composeNote({ frontmatter: fm, body: "" });
		const parsed = parseNote(out);
		assert.deepEqual(parsed.frontmatter.aliases, ["alt-title"]);
		assert.equal(parsed.frontmatter.custom_tag, "mine");
	});

	it("ignores corrupt frontmatter (treats input as body)", () => {
		const corrupt = "---\nnot: [valid\nmore: stuff\n---\nbody\n";
		const parsed = parseNote(corrupt);
		assert.equal(parsed.hadFrontmatter, false);
		assert.equal(parsed.body, corrupt);
	});
});

describe("fence", () => {
	it("splits a body with a fenced managed section", () => {
		const body = `${FENCE_START}\nmanaged body\n${FENCE_END}\n\nmy notes\n`;
		const split = splitBody(body);
		assert.ok(split);
		assert.equal(split.managed, "managed body");
		assert.equal(split.before, "");
		assert.equal(split.after, "my notes\n");
	});

	it("returns null when there is no fence", () => {
		assert.equal(splitBody("no fence here"), null);
	});

	it("returns null when only a start marker is present", () => {
		assert.equal(splitBody(`${FENCE_START}\nno end marker`), null);
	});
});

describe("mergeRecallFields", () => {
	it("overwrites Recall keys and preserves user keys", () => {
		const existing = { aliases: ["a"], source_url: "https://old", processed: true };
		const merged = mergeRecallFields(existing, {
			recall_id: "id",
			title: "new",
			created_at: "c",
			synced_at: "s",
			source_url: "https://new",
		});
		assert.deepEqual(merged.aliases, ["a"]);
		assert.equal(merged.source_url, "https://new");
		// processed isn't in the patch, so mergeRecallFields must clear it so
		// stale Recall values don't linger after a card changes.
		assert.equal(merged.processed, undefined);
	});
});

describe("composeNoteFromCard", () => {
	it("creates a fresh note when none exists", () => {
		const note = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const parsed = parseNote(note);
		assert.equal(parsed.frontmatter.recall_id, BASE_CARD.card_id);
		assert.equal(parsed.frontmatter.source_url, BASE_CARD.source_url);
		assert.equal(parsed.frontmatter.source_domain, "youtube.com");
		assert.equal(parsed.frontmatter.image, BASE_CARD.image);
		assert.deepEqual(parsed.frontmatter.recall_tags, ["Rust", "PLT"]);
		assert.deepEqual(parsed.frontmatter.recall_tag_paths, [
			"Technology / Programming / Rust",
			"Technology / Programming",
		]);
		const split = splitBody(parsed.body);
		assert.ok(split);
		assert.match(split.managed, /First chunk about borrowing\./);
		assert.match(split.managed, /Second chunk about lifetimes\./);
		assert.equal(split.after, "");
	});

	it("preserves user content below the fence across re-sync", () => {
		const first = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const withUserNotes = first + "## My thoughts\nThis matters because...\n";

		const changedCard: Card = {
			...BASE_CARD,
			chunks: [{ chunk_id: "c3", content: "FRESH content replacing everything." }],
			title: "Updated title",
		};
		const resynced = composeNoteFromCard(changedCard, {
			existing: withUserNotes,
			syncedAt: new Date("2026-04-20T00:00:00Z"),
		});

		assert.match(resynced, /## My thoughts/);
		assert.match(resynced, /This matters because\.\.\./);
		assert.match(resynced, /FRESH content replacing everything\./);
		assert.doesNotMatch(resynced, /First chunk about borrowing\./);
		const parsed = parseNote(resynced);
		assert.equal(parsed.frontmatter.title, "Updated title");
	});

	it("preserves user-authored frontmatter keys across re-sync", () => {
		const first = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const withUserFm = first.replace(
			"---\nrecall_id:",
			"---\naliases:\n  - rust-borrow-history\ncssclasses:\n  - wide\nrecall_id:",
		);

		const resynced = composeNoteFromCard(BASE_CARD, {
			existing: withUserFm,
			syncedAt: new Date("2026-04-20T00:00:00Z"),
		});
		const parsed = parseNote(resynced);
		assert.deepEqual(parsed.frontmatter.aliases, ["rust-borrow-history"]);
		assert.deepEqual(parsed.frontmatter.cssclasses, ["wide"]);
	});

	it("folds user content into the after-fence region on first sync", () => {
		const preExisting =
			"---\naliases: [draft]\n---\nI started writing about this last week.\n";
		const note = composeNoteFromCard(BASE_CARD, {
			existing: preExisting,
			syncedAt: SYNC_TIME,
		});
		const parsed = parseNote(note);
		assert.deepEqual(parsed.frontmatter.aliases, ["draft"]);
		const split = splitBody(parsed.body);
		assert.ok(split);
		assert.match(split.after, /I started writing about this last week\./);
	});

	it("is idempotent: syncing the same card twice yields identical output", () => {
		const first = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const second = composeNoteFromCard(BASE_CARD, {
			existing: first,
			syncedAt: SYNC_TIME,
		});
		assert.equal(first, second);
	});

	it("clears optional Recall fields when they disappear from the card", () => {
		const first = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const strippedCard: Card = {
			card_id: BASE_CARD.card_id,
			title: BASE_CARD.title,
			created_at: BASE_CARD.created_at,
			tags: [],
			chunks: [{ chunk_id: "c1", content: "still here" }],
		};
		const resynced = composeNoteFromCard(strippedCard, {
			existing: first,
			syncedAt: SYNC_TIME,
		});
		const parsed = parseNote(resynced);
		assert.equal(parsed.frontmatter.source_url, undefined);
		assert.equal(parsed.frontmatter.source_domain, undefined);
		assert.equal(parsed.frontmatter.image, undefined);
		assert.equal(parsed.frontmatter.recall_tags, undefined);
		assert.equal(parsed.frontmatter.recall_tag_paths, undefined);
	});

	it("strips www. from source_domain", () => {
		const card: Card = { ...BASE_CARD, source_url: "https://www.example.com/x" };
		const note = composeNoteFromCard(card, { existing: null, syncedAt: SYNC_TIME });
		const parsed = parseNote(note);
		assert.equal(parsed.frontmatter.source_domain, "example.com");
	});

	it("leaves source_domain unset when source_url is malformed", () => {
		const card: Card = { ...BASE_CARD, source_url: "not a url" };
		const note = composeNoteFromCard(card, { existing: null, syncedAt: SYNC_TIME });
		const parsed = parseNote(note);
		assert.equal(parsed.frontmatter.source_domain, undefined);
	});
});

describe("updateFrontmatter", () => {
	it("patches a single key without touching the body", () => {
		const note = composeNoteFromCard(BASE_CARD, {
			existing: null,
			syncedAt: SYNC_TIME,
		});
		const patched = updateFrontmatter(note, {
			promoted_to: "[[Rust Borrow Checker Synthesis]]",
		});
		const parsed = parseNote(patched);
		assert.equal(
			parsed.frontmatter.promoted_to,
			"[[Rust Borrow Checker Synthesis]]",
		);
		const before = parseNote(note).body;
		assert.equal(parsed.body, before);
	});
});
