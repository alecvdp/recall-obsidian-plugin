/**
 * Ship a default `Recall.base` alongside the synced cards on first sync.
 *
 * Semantics:
 *  - Written to `{folder}/Recall.base` on any successful sync if absent.
 *  - Never overwritten. The user owns the file after the first write —
 *    they'll tune views, add columns, rename, all of which we must not
 *    clobber on the next sync.
 *
 * The `file.inFolder(...)` filter in the YAML is folder-scoped at write
 * time so moving the sync folder in settings doesn't leave an orphaned
 * base pointed at the old path (if the user later re-deletes the base,
 * the next sync will regenerate it scoped to the current folder).
 */

import type { Vault } from "obsidian";

export const DEFAULT_BASE_FILENAME = "Recall.base";

/**
 * Build the default .base YAML, folder-scoped so the top-level filter
 * only sees Recall-synced notes even if the user has other notes in
 * the vault with a `recall_id` key for some other reason.
 */
export function renderDefaultBaseYaml(folder: string): string {
	const folderFilter = folder
		? `    - file.inFolder("${escapeForYamlString(folder)}")\n`
		: "";
	return `filters:
  and:
${folderFilter}    - file.hasProperty("recall_id")
views:
  - type: table
    name: Inbox
    filters:
      and:
        - "!note.processed"
        - 'note.created_at >= now() - "7 days"'
    groupBy:
      property: note.source_type
      direction: ASC
    order:
      - file.name
      - note.source_type
      - note.source_author
      - note.created_at
  - type: table
    name: By source type
    groupBy:
      property: note.source_type
      direction: ASC
    order:
      - file.name
      - note.source_author
      - note.created_at
  - type: table
    name: Long-form queue
    filters:
      and:
        - "note.word_count > 2000"
        - or:
            - 'note.source_type == "article"'
            - 'note.source_type == "pdf"'
    order:
      - file.name
      - note.word_count
      - note.source_domain
      - note.created_at
  - type: table
    name: By channel
    groupBy:
      property: note.source_author
      direction: ASC
    order:
      - file.name
      - note.source_type
      - note.created_at
  - type: table
    name: Promoted
    filters:
      and:
        - 'note.promoted_to != ""'
    order:
      - file.name
      - note.promoted_to
      - note.created_at
`;
}

export interface DefaultBaseTarget {
	/** True if a Recall.base already exists at the expected path. */
	exists(path: string): boolean;
	/** Create the file with the given content. */
	create(path: string, content: string): Promise<unknown>;
}

/**
 * Write `{folder}/Recall.base` if it doesn't exist yet.
 *
 * Returns the path it wrote to, or null if skipped.
 * Swallows write errors and logs them — this is a nice-to-have that must
 * never break the sync itself.
 */
export async function ensureDefaultBase(
	target: DefaultBaseTarget,
	folder: string,
): Promise<string | null> {
	const path = defaultBasePath(folder);
	if (target.exists(path)) return null;
	try {
		await target.create(path, renderDefaultBaseYaml(folder));
		return path;
	} catch (err) {
		console.warn("Recall: failed to write default Recall.base", err);
		return null;
	}
}

/** Adapt an Obsidian Vault to the target interface. */
export function vaultTarget(vault: Vault): DefaultBaseTarget {
	return {
		exists: (path) => vault.getFileByPath(path) !== null,
		create: (path, content) => vault.create(path, content),
	};
}

function defaultBasePath(folder: string): string {
	const normalized = (folder ?? "").replace(/^\/+|\/+$/g, "");
	return normalized ? `${normalized}/${DEFAULT_BASE_FILENAME}` : DEFAULT_BASE_FILENAME;
}

function escapeForYamlString(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
