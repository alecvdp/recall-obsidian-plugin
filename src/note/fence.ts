/**
 * Fence-aware body splitter.
 *
 * Recall-managed content lives between FENCE_START and FENCE_END. Anything
 * outside the fence (before, after) is user-authored and must survive
 * re-syncs untouched.
 *
 *   %% recall:start %%
 *   <managed body — chunks concatenated>
 *   %% recall:end %%
 *
 *   <user notes, links, follow-ups>
 *
 * If a body has no fence (e.g. first-ever sync into a user-pre-existing note,
 * or a legacy note from a previous plugin version), `splitBody` returns null
 * and the caller decides placement — typically prepending a new fence and
 * keeping the existing content below it.
 */

export const FENCE_START = "%% recall:start %%";
export const FENCE_END = "%% recall:end %%";

export interface FencedBody {
	before: string;
	managed: string;
	after: string;
}

export function splitBody(body: string): FencedBody | null {
	const startIdx = body.indexOf(FENCE_START);
	if (startIdx === -1) return null;
	const endIdx = body.indexOf(FENCE_END, startIdx + FENCE_START.length);
	if (endIdx === -1) return null;

	const before = body.slice(0, startIdx);
	const managed = body.slice(startIdx + FENCE_START.length, endIdx);
	const after = body.slice(endIdx + FENCE_END.length);

	return {
		before,
		managed: trimBlockContent(managed),
		after: trimLeadingNewline(after),
	};
}

export function composeFencedBody(fb: FencedBody): string {
	const managed = fb.managed.trim();
	const block =
		managed.length === 0
			? `${FENCE_START}\n${FENCE_END}`
			: `${FENCE_START}\n${managed}\n${FENCE_END}`;
	const before = fb.before.replace(/\s+$/, "");
	const after = fb.after.replace(/^\s+/, "");
	const beforePart = before.length === 0 ? "" : `${before}\n\n`;
	const afterPart = after.length === 0 ? "" : `\n\n${after}`;
	return `${beforePart}${block}${afterPart}\n`;
}

/**
 * Replace (or insert) the managed section of a body without disturbing user
 * content. When the body had no fence, the managed section is prepended and
 * any existing body text becomes the `after` section.
 */
export function upsertManagedBody(body: string, managed: string): string {
	const split = splitBody(body);
	if (split) {
		return composeFencedBody({ ...split, managed });
	}
	return composeFencedBody({
		before: "",
		managed,
		after: body.trim(),
	});
}

function trimBlockContent(s: string): string {
	// The fenced block's inner content is whatever sits between the two
	// markers; we drop the newlines immediately adjacent to them but keep
	// internal blank lines.
	return s.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

function trimLeadingNewline(s: string): string { return s.replace(/^[\r\n]+/, ""); }
