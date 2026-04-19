/**
 * "Pull from Recall" commands.
 *
 * Two entry points:
 *  - `pull-one`: fuzzy-picks a single card and syncs it.
 *  - `pull-all-new`: fetches the whole card list and syncs every card
 *    whose `recall_id` isn't already in the vault folder.
 *
 * Both go through `SyncEngine`, which owns idempotency + filename policy.
 * Commands only glue the API and UI together.
 */

import { Notice, Plugin, TFile } from "obsidian";

import { RecallApiError, RecallAuthError } from "../recall/errors";
import { RecallClient } from "../recall/client";
import { obsidianFetch } from "../recall/fetchers-obsidian";
import type { CardPreview } from "../recall/types";
import type { RecallSyncSettings } from "../settings";
import { SyncEngine } from "../sync/sync-engine";
import { CardSuggestModal } from "./card-suggest-modal";

export interface CommandHost extends Plugin {
	settings: RecallSyncSettings;
}

export function registerPullCommands(plugin: CommandHost): void {
	plugin.addCommand({
		id: "pull-one",
		name: "Pull one card from Recall",
		callback: () => pullOne(plugin),
	});

	plugin.addCommand({
		id: "pull-all-new",
		name: "Pull all new cards from Recall",
		callback: () => pullAllNew(plugin),
	});
}

async function pullOne(plugin: CommandHost): Promise<void> {
	const client = makeClient(plugin);
	if (!client) return;

	let cards: CardPreview[];
	try {
		const res = await client.listCards();
		cards = res.results;
	} catch (err) {
		return surfaceError(err, "list cards");
	}

	if (cards.length === 0) {
		new Notice("Recall: your library has no cards.");
		return;
	}

	const engine = new SyncEngine(plugin.app.vault, plugin.settings);

	new CardSuggestModal(plugin.app, cards, (picked) => {
		void syncOne(plugin, client, engine, picked.id, picked.title);
	}).open();
}

async function syncOne(
	plugin: CommandHost,
	client: RecallClient,
	engine: SyncEngine,
	cardId: string,
	label: string,
): Promise<void> {
	const progress = new Notice(`Recall: fetching "${label}"…`, 0);
	try {
		const full = await client.getCard(cardId);
		const result = await engine.syncCard(full);
		progress.hide();
		new Notice(`Recall: ${result.outcome} — ${result.file.basename}`);
		const leaf = plugin.app.workspace.getLeaf(false);
		if (result.file instanceof TFile) {
			await leaf.openFile(result.file);
		}
	} catch (err) {
		progress.hide();
		surfaceError(err, `sync "${label}"`);
	}
}

async function pullAllNew(plugin: CommandHost): Promise<void> {
	const client = makeClient(plugin);
	if (!client) return;

	const engine = new SyncEngine(plugin.app.vault, plugin.settings);
	const progress = new Notice("Recall: scanning existing vault…", 0);

	let cards: CardPreview[];
	try {
		const res = await client.listCards();
		cards = res.results;
	} catch (err) {
		progress.hide();
		return surfaceError(err, "list cards");
	}

	progress.setMessage(`Recall: ${cards.length} cards in Recall, syncing…`);

	let created = 0;
	let updated = 0;
	let renamed = 0;
	let failed = 0;
	let i = 0;

	for (const card of cards) {
		i++;
		progress.setMessage(`Recall: syncing ${i}/${cards.length} — ${card.title.slice(0, 60)}`);
		try {
			const full = await client.getCard(card.id);
			const res = await engine.syncCard(full);
			if (res.outcome === "created") created++;
			else if (res.outcome === "updated") updated++;
			else if (res.outcome === "renamed") renamed++;
		} catch (err) {
			failed++;
			console.warn(`Recall: failed to sync ${card.id}`, err);
			if (err instanceof RecallAuthError) {
				progress.hide();
				new Notice("Recall: API key rejected; aborting pull.");
				return;
			}
		}
	}

	progress.hide();
	new Notice(
		`Recall: pull complete. +${created} new, ${updated} updated, ${renamed} renamed${failed ? `, ${failed} failed` : ""}.`,
		8000,
	);
}

function makeClient(plugin: CommandHost): RecallClient | null {
	if (!plugin.settings.apiKey) {
		new Notice("Recall: set your API key in Settings first.");
		return null;
	}
	return new RecallClient({
		apiKey: plugin.settings.apiKey,
		fetcher: obsidianFetch,
	});
}

function surfaceError(err: unknown, action: string): void {
	if (err instanceof RecallAuthError) {
		new Notice(`Recall: API key rejected. Failed to ${action}.`);
	} else if (err instanceof RecallApiError) {
		new Notice(`Recall: ${err.message} (HTTP ${err.status}).`);
	} else {
		new Notice(`Recall: failed to ${action}. ${(err as Error).message}`);
	}
}
