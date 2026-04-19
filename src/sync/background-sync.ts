/**
 * Background interval sync for Recall.
 *
 * Each tick:
 *   1. GET /cards?date_from=<lastSyncCursor>  (unfiltered when cursor is null)
 *   2. For each result, GET /cards/{id} and hand the full Card to SyncEngine
 *   3. Advance the cursor to the max `created_at` seen, persist, schedule next
 *
 * Limitations:
 *  - List Cards only filters on `created_at`, so this picks up *new* cards
 *    but NOT edits to already-synced cards. Edits must be pulled by hand
 *    via "Pull all new" (which scans without a cursor) or a future
 *    updated-at-aware endpoint.
 *
 * Error handling:
 *  - A failed tick doesn't advance the cursor — next tick retries the same
 *    window. SyncEngine is idempotent, so partial progress is wasted but
 *    never corrupt.
 *  - Retries use exponential backoff capped at MAX_BACKOFF_MS.
 *  - Auth errors stop the scheduler; user must fix the key and restart.
 */

import type { App } from "obsidian";

import { RecallApiError, RecallAuthError } from "../recall/errors";
import { RecallClient } from "../recall/client";
import { obsidianFetch } from "../recall/fetchers-obsidian";
import type { RecallSyncSettings } from "../settings";
import { backoffMs } from "./backoff";
import { SyncEngine } from "./sync-engine";

export interface BackgroundSyncHost {
	app: App;
	settings: RecallSyncSettings;
	saveSettings(): Promise<void>;
}

export type SyncStatus =
	| { kind: "disabled" }
	| { kind: "unconfigured" }
	| { kind: "idle"; lastSyncedAt: string | null }
	| { kind: "syncing" }
	| {
			kind: "error";
			message: string;
			retryAt: number | null;
			failures: number;
	  };

const FIRST_TICK_DELAY_MS = 60 * 1000;

export class BackgroundSync {
	private timer: number | null = null;
	private inFlight: Promise<void> | null = null;
	private consecutiveFailures = 0;
	private status: SyncStatus = { kind: "disabled" };

	constructor(
		private readonly host: BackgroundSyncHost,
		private readonly onStatusChange: (s: SyncStatus) => void = () => {},
	) {}

	getStatus(): SyncStatus {
		return this.status;
	}

	/** Start (or re-seed) the scheduler. Call from onload and after setting changes. */
	start(): void {
		this.clearTimer();
		this.consecutiveFailures = 0;
		const { apiKey, syncIntervalMinutes, lastSyncedAt } = this.host.settings;
		if (!apiKey) {
			this.setStatus({ kind: "unconfigured" });
			return;
		}
		if (syncIntervalMinutes <= 0) {
			this.setStatus({ kind: "disabled" });
			return;
		}
		this.setStatus({ kind: "idle", lastSyncedAt });
		this.scheduleNext(FIRST_TICK_DELAY_MS);
	}

	stop(): void {
		this.clearTimer();
	}

	/** Tear down the current schedule and start fresh from current settings. */
	restart(): void {
		this.start();
	}

	/**
	 * Run one tick immediately. Safe to call while a tick is already in
	 * flight; callers await the existing promise.
	 */
	async syncNow(): Promise<void> {
		if (this.inFlight) return this.inFlight;
		this.clearTimer();
		this.inFlight = this.tick().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private scheduleNext(delayMs: number): void {
		if (this.host.settings.syncIntervalMinutes <= 0) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.syncNow();
		}, delayMs);
	}

	private clearTimer(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private async tick(): Promise<void> {
		const settings = this.host.settings;
		if (!settings.apiKey) {
			this.setStatus({ kind: "unconfigured" });
			return;
		}

		this.setStatus({ kind: "syncing" });

		const client = new RecallClient({
			apiKey: settings.apiKey,
			fetcher: obsidianFetch,
		});
		const engine = new SyncEngine(this.host.app.vault, settings);

		try {
			const listParams = settings.lastSyncCursor
				? { date_from: settings.lastSyncCursor }
				: {};
			const listRes = await client.listCards(listParams);

			let maxSeenAt: string | null = settings.lastSyncCursor;
			for (const preview of listRes.results) {
				const full = await client.getCard(preview.id);
				await engine.syncCard(full);
				if (!maxSeenAt || full.created_at > maxSeenAt) {
					maxSeenAt = full.created_at;
				}
			}

			if (maxSeenAt && maxSeenAt !== settings.lastSyncCursor) {
				settings.lastSyncCursor = maxSeenAt;
			}
			settings.lastSyncedAt = new Date().toISOString();
			await this.host.saveSettings();

			this.consecutiveFailures = 0;
			if (settings.syncIntervalMinutes <= 0) {
				this.setStatus({ kind: "disabled" });
			} else {
				this.setStatus({ kind: "idle", lastSyncedAt: settings.lastSyncedAt });
				this.scheduleNext(this.baseIntervalMs());
			}
		} catch (err) {
			this.consecutiveFailures += 1;
			const message =
				err instanceof RecallApiError
					? `${err.message} (HTTP ${err.status})`
					: (err as Error).message;
			console.warn(
				`Recall: background sync error (failure #${this.consecutiveFailures})`,
				err,
			);

			if (err instanceof RecallAuthError) {
				this.setStatus({
					kind: "error",
					message,
					retryAt: null,
					failures: this.consecutiveFailures,
				});
				return;
			}

			const delay = backoffMs(this.baseIntervalMs(), this.consecutiveFailures);
			this.setStatus({
				kind: "error",
				message,
				retryAt: Date.now() + delay,
				failures: this.consecutiveFailures,
			});
			this.scheduleNext(delay);
		}
	}

	private baseIntervalMs(): number {
		return this.host.settings.syncIntervalMinutes * 60 * 1000;
	}

	private setStatus(status: SyncStatus): void {
		this.status = status;
		this.onStatusChange(status);
	}
}
