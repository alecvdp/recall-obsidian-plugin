import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { appendLinkLine, newNoteScaffold } from "./promote-content";

describe("appendLinkLine", () => {
	it("inserts a bullet with a blank line above when the file has content", () => {
		const out = appendLinkLine("Today I did stuff.\n", "[[Card]]");
		assert.equal(out, "Today I did stuff.\n\n- [[Card]]\n");
	});

	it("handles a file with trailing blank lines without stacking them", () => {
		const out = appendLinkLine("Today.\n\n\n", "[[Card]]");
		assert.equal(out, "Today.\n\n- [[Card]]\n");
	});

	it("writes just the bullet into an empty file", () => {
		assert.equal(appendLinkLine("", "[[Card]]"), "- [[Card]]\n");
	});

	it("is idempotent when the link is already present anywhere in the file", () => {
		const prior = "## Sources\n- [[Card]]\n\nMore notes.\n";
		assert.equal(appendLinkLine(prior, "[[Card]]"), prior);
	});
});

describe("newNoteScaffold", () => {
	it("writes a heading and a Source backlink", () => {
		assert.equal(
			newNoteScaffold("My Permanent Note", "2026-04-19 — Some Card"),
			"# My Permanent Note\n\nSource: [[2026-04-19 — Some Card]]\n",
		);
	});
});
