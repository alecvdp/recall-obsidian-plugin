/**
 * Plugin settings shape, defaults, and validation.
 *
 * Persisted via Obsidian's Plugin.loadData / saveData — a single JSON blob
 * per plugin. Changes to this shape MUST preserve backwards compatibility
 * with stored data (i.e. new fields need a default, renames need a
 * migration). Today we have no stored data yet, so the shape is free.
 */

export interface RecallSyncSettings {
	/** Recall API key (starts with `sk_`). Empty string means not configured. */
	apiKey: string;

	/** Vault folder where synced cards land. No leading/trailing slash. */
	folder: string;

	/**
	 * Filename template. Supported tokens:
	 *   {{title}}   — sanitized card title
	 *   {{id}}      — full card UUID
	 *   {{shortId}} — first 8 chars of the card UUID
	 *   {{date}}    — YYYY-MM-DD of card's created_at (UTC)
	 */
	filenameTemplate: string;

	/**
	 * Background sync interval in minutes. 0 = manual only.
	 * Used by PER-47; settings tab exposes the knob now so users don't
	 * have to return here once background sync ships.
	 */
	syncIntervalMinutes: number;

	/**
	 * Base URL of the Recall web app, used to build `recall_url` in
	 * frontmatter. Empty means don't emit recall_url. The card URL pattern
	 * is not documented; users who discover it can set it here as e.g.
	 * `https://app.recall.it/card/{id}` with `{id}` as the placeholder.
	 */
	recallWebAppUrlTemplate: string;
}

export const DEFAULT_SETTINGS: RecallSyncSettings = {
	apiKey: "",
	folder: "Recall",
	filenameTemplate: "{{title}}",
	syncIntervalMinutes: 0,
	recallWebAppUrlTemplate: "",
};

/** Valid choices for the sync interval dropdown. */
export const SYNC_INTERVAL_CHOICES: { label: string; minutes: number }[] = [
	{ label: "Manual only", minutes: 0 },
	{ label: "Every 15 minutes", minutes: 15 },
	{ label: "Every hour", minutes: 60 },
	{ label: "Every 6 hours", minutes: 360 },
	{ label: "Daily", minutes: 1440 },
];

/**
 * Normalize a folder path the user typed: trim, strip surrounding slashes,
 * collapse repeated slashes. Return empty string for the vault root, which
 * Obsidian represents as "".
 */
export function normalizeFolder(input: string): string {
	return input
		.trim()
		.replace(/^\/+|\/+$/g, "")
		.replace(/\/+/g, "/");
}
