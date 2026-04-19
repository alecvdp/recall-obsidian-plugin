import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { renderFilenameStem, sanitizeTitle } from "./filename";

describe("sanitizeTitle", () => {
	it("strips forbidden characters", () => {
		assert.equal(sanitizeTitle("A / B : C"), "A B C");
		assert.equal(sanitizeTitle('title with "quotes"'), "title with quotes");
		assert.equal(sanitizeTitle("path\\with\\backslash"), "path with backslash");
	});

	it("collapses whitespace and trims", () => {
		assert.equal(sanitizeTitle("  many   spaces  "), "many spaces");
	});

	it("preserves em-dashes and unicode", () => {
		assert.equal(
			sanitizeTitle("Stop Using Separate Task Apps — Manage Everything"),
			"Stop Using Separate Task Apps — Manage Everything",
		);
	});

	it("truncates long titles at word boundaries when possible", () => {
		const long = "word ".repeat(60).trim();
		const result = sanitizeTitle(long);
		assert.ok(result.length <= 200);
		assert.ok(!result.endsWith("wor"), "should not cut mid-word");
	});

	it("falls back to hard cut if no reasonable word boundary exists", () => {
		const stretch = "x".repeat(250);
		const result = sanitizeTitle(stretch);
		assert.equal(result.length, 200);
	});
});

describe("renderFilenameStem", () => {
	const ctx = {
		title: "How Rust's borrow checker evolved",
		id: "d78d7ed5-1404-4cf3-ad83-09b4b38dee0a",
		createdAt: "2026-04-18T10:00:00.000000+00:00",
	};

	it("substitutes {{title}}", () => {
		assert.equal(
			renderFilenameStem("{{title}}", ctx),
			"How Rust's borrow checker evolved",
		);
	});

	it("substitutes {{date}} and {{title}} together", () => {
		assert.equal(
			renderFilenameStem("{{date}} — {{title}}", ctx),
			"2026-04-18 — How Rust's borrow checker evolved",
		);
	});

	it("substitutes {{shortId}} and {{id}}", () => {
		assert.equal(
			renderFilenameStem("{{title}} ({{shortId}})", ctx),
			"How Rust's borrow checker evolved (d78d7ed5)",
		);
		assert.equal(
			renderFilenameStem("{{id}}", ctx),
			"d78d7ed5-1404-4cf3-ad83-09b4b38dee0a",
		);
	});

	it("tolerates whitespace inside tokens", () => {
		assert.equal(
			renderFilenameStem("{{ title }}", ctx),
			"How Rust's borrow checker evolved",
		);
	});

	it("returns 'Untitled' when template resolves to empty", () => {
		assert.equal(
			renderFilenameStem("", { ...ctx, title: "" }),
			"Untitled",
		);
	});

	it("falls back to 'Untitled' when title is only forbidden characters", () => {
		assert.equal(
			renderFilenameStem("{{title}}", { ...ctx, title: "////" }),
			"Untitled",
		);
	});
});
