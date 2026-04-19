/**
 * Exponential-backoff delay for the background-sync scheduler.
 *
 * Behavior:
 *  - 0 failures: return the base interval unchanged.
 *  - 1 failure: also return the base interval (one miss isn't enough to
 *    slow the cadence — transient blips shouldn't penalize the user).
 *  - N ≥ 2 failures: double the base on each additional failure, capped
 *    at MAX_BACKOFF_MS so we never stall forever.
 */

export const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function backoffMs(baseMs: number, failures: number): number {
	if (failures <= 1) return Math.min(baseMs, MAX_BACKOFF_MS);
	const exponent = Math.min(failures - 1, 12);
	const delay = baseMs * Math.pow(2, exponent);
	return Math.min(delay, MAX_BACKOFF_MS);
}
