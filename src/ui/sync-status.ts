/**
 * Pure formatters for the sync status bar. Extracted so UI tests (if we
 * add them) don't need a DOM, and so the wording is easy to tune without
 * diffing main.ts.
 */

import type { SyncStatus } from "../sync/background-sync";

export interface StatusDisplay {
	text: string;
	tooltip: string;
}

export function describeStatus(
	status: SyncStatus,
	now: number = Date.now(),
): StatusDisplay {
	switch (status.kind) {
		case "disabled":
			return {
				text: "Recall: manual",
				tooltip:
					"Background sync is off. Pick an interval in Settings or run 'Sync now' to pull new cards.",
			};
		case "unconfigured":
			return {
				text: "Recall: no key",
				tooltip: "Set your Recall API key in Settings to enable sync.",
			};
		case "syncing":
			return {
				text: "Recall: syncing…",
				tooltip: "Pulling new cards from Recall.",
			};
		case "idle": {
			const text = status.lastSyncedAt
				? `Recall: ${formatRelative(status.lastSyncedAt, now)}`
				: "Recall: idle";
			const tooltip = status.lastSyncedAt
				? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}.`
				: "Waiting for the first background sync.";
			return { text, tooltip };
		}
		case "error": {
			const retry = status.retryAt
				? `Retrying ${formatRelative(
						new Date(status.retryAt).toISOString(),
						now,
					).replace(/^synced /, "in ")}`
				: "Sync paused — fix the issue in Settings.";
			return {
				text: "Recall: error",
				tooltip: `${status.message}\n${retry}\nConsecutive failures: ${status.failures}.`,
			};
		}
	}
}

function formatRelative(iso: string, now: number): string {
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "unknown";
	const diffMs = t - now;
	const future = diffMs > 0;
	const abs = Math.abs(diffMs);
	const mins = Math.round(abs / 60000);
	const phrase = future
		? mins < 1
			? "any moment"
			: mins < 60
				? `${mins}m`
				: mins < 1440
					? `${Math.round(mins / 60)}h`
					: `${Math.round(mins / 1440)}d`
		: mins < 1
			? "just now"
			: mins < 60
				? `${mins}m ago`
				: mins < 1440
					? `${Math.round(mins / 60)}h ago`
					: `${Math.round(mins / 1440)}d ago`;
	return future ? phrase : `synced ${phrase}`;
}
