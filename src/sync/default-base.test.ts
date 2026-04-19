/**
 * Tests for the default Recall.base writer.
 *
 * The core invariants, in priority order:
 *  1. First successful sync into an empty folder writes Recall.base.
 *  2. A subsequent sync with Recall.base already present is a no-op —
 *     user edits survive untouched. This is the "never overwrite" contract.
 *  3. YAML content is valid-looking and names all five required views,
 *     so a regression that drops one is loud.
 */

import { strict as assert } from "node:assert";
import { load as yamlLoad } from "js-yaml";
import { describe, it } from "node:test";

import {
	DEFAULT_BASE_FILENAME,
	ensureDefaultBase,
	renderDefaultBaseYaml,
	type DefaultBaseTarget,
} from "./default-base";

function makeTarget(existing: Set<string> = new Set()): {
	target: DefaultBaseTarget;
	writes: Array<{ path: string; content: string }>;
} {
	const writes: Array<{ path: string; content: string }> = [];
	const target: DefaultBaseTarget = {
		exists: (path) => existing.has(path),
		create: async (path, content) => {
			existing.add(path);
			writes.push({ path, content });
		},
	};
	return { target, writes };
}

describe("ensureDefaultBase", () => {
	it("writes Recall.base into the configured folder on first call", async () => {
		const { target, writes } = makeTarget();
		const result = await ensureDefaultBase(target, "Recall");
		assert.equal(result, "Recall/Recall.base");
		assert.equal(writes.length, 1);
		assert.equal(writes[0].path, "Recall/Recall.base");
	});

	it("is a no-op when Recall.base already exists", async () => {
		const { target, writes } = makeTarget(new Set(["Recall/Recall.base"]));
		const result = await ensureDefaultBase(target, "Recall");
		assert.equal(result, null);
		assert.equal(writes.length, 0);
	});

	it("writes to the vault root when folder is empty", async () => {
		const { target, writes } = makeTarget();
		const result = await ensureDefaultBase(target, "");
		assert.equal(result, DEFAULT_BASE_FILENAME);
		assert.equal(writes[0].path, DEFAULT_BASE_FILENAME);
	});

	it("honors a user-configured folder name", async () => {
		const { target, writes } = makeTarget();
		const result = await ensureDefaultBase(target, "Imports/Recall");
		assert.equal(result, "Imports/Recall/Recall.base");
		assert.equal(writes[0].path, "Imports/Recall/Recall.base");
	});

	it("swallows write errors so sync continues", async () => {
		const target: DefaultBaseTarget = {
			exists: () => false,
			create: async () => {
				throw new Error("disk full");
			},
		};
		const result = await ensureDefaultBase(target, "Recall");
		assert.equal(result, null);
	});
});

describe("renderDefaultBaseYaml", () => {
	it("produces parseable YAML with the five required views", () => {
		const yaml = renderDefaultBaseYaml("Recall");
		const parsed = yamlLoad(yaml) as {
			views: Array<{ name: string; type: string }>;
		};
		const names = parsed.views.map((v) => v.name);
		assert.deepEqual(names, [
			"Inbox",
			"By source type",
			"Long-form queue",
			"By channel",
			"Promoted",
		]);
		for (const view of parsed.views) {
			assert.equal(view.type, "table");
		}
	});

	it("scopes the top-level filter to the sync folder", () => {
		const yaml = renderDefaultBaseYaml("Recall");
		assert.match(yaml, /file\.inFolder\("Recall"\)/);
		assert.match(yaml, /file\.hasProperty\("recall_id"\)/);
	});

	it("drops the folder filter when syncing to vault root", () => {
		const yaml = renderDefaultBaseYaml("");
		assert.doesNotMatch(yaml, /file\.inFolder/);
		assert.match(yaml, /file\.hasProperty\("recall_id"\)/);
	});
});
