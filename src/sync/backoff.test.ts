import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { backoffMs, MAX_BACKOFF_MS } from "./backoff";

describe("backoffMs", () => {
	const base = 60 * 1000;

	it("returns the base interval when there are no failures", () => {
		assert.equal(backoffMs(base, 0), base);
	});

	it("absorbs a single failure without extending the delay", () => {
		assert.equal(backoffMs(base, 1), base);
	});

	it("doubles the delay for each additional failure", () => {
		assert.equal(backoffMs(base, 2), base * 2);
		assert.equal(backoffMs(base, 3), base * 4);
		assert.equal(backoffMs(base, 4), base * 8);
	});

	it("caps at MAX_BACKOFF_MS no matter how many failures accrue", () => {
		assert.equal(backoffMs(base, 50), MAX_BACKOFF_MS);
	});

	it("respects MAX_BACKOFF_MS even when the base exceeds it", () => {
		assert.equal(backoffMs(MAX_BACKOFF_MS * 4, 0), MAX_BACKOFF_MS);
	});
});
