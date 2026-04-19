/**
 * Write or update a note in the vault from a Recall Card.
 *
 * Idempotency: every note's `recall_id` frontmatter is the source of truth.
 * Before writing, we scan the target folder for existing notes and build a
 * `recall_id → TFile` index. If the incoming card matches an existing note
 * (even if the title changed, which changes the filename), we update in
 * place and rename the file if the preferred filename differs.
 *
 * File collisions: if the preferred filename is taken by a note with a
 * DIFFERENT `recall_id`, we append a short id suffix and retry. We do not
 * overwrite someone else's work.
 */

import { TFile, normalizePath, type Vault } from "obsidian";

import { composeNoteFromCard } from "../note/compose";
import { parseNote } from "../note/frontmatter";
import type { Card } from "../recall/types";
import type { RecallSyncSettings } from "../settings";
import { renderFilenameStem } from "./filename";

export type SyncOutcome = "created" | "updated" | "renamed";

export interface SyncResult {
	outcome: SyncOutcome;
	file: TFile;
}

export class SyncEngine {
	private index: Map<string, TFile> | null = null;

	constructor(
		private readonly vault: Vault,
		private readonly settings: RecallSyncSettings,
	) {}

	/** Force the next operation to rebuild its `recall_id → TFile` index. */
	invalidate(): void {
		this.index = null;
	}

	async syncCard(card: Card): Promise<SyncResult> {
		await this.ensureFolder();
		const index = await this.getIndex();

		const preferredPath = this.preferredPath(card);
		const existing = index.get(card.card_id);

		if (existing) {
			return this.updateExisting(card, existing, preferredPath);
		}
		return this.createNew(card, preferredPath, index);
	}

	private async ensureFolder(): Promise<void> {
		const folder = this.settings.folder;
		if (!folder) return;
		const path = normalizePath(folder);
		if (!this.vault.getFolderByPath(path)) {
			await this.vault.createFolder(path);
		}
	}

	private async getIndex(): Promise<Map<string, TFile>> {
		if (this.index) return this.index;

		const folder = normalizePath(this.settings.folder);
		const prefix = folder ? `${folder}/` : "";
		const index = new Map<string, TFile>();

		for (const file of this.vault.getMarkdownFiles()) {
			if (prefix && !file.path.startsWith(prefix)) continue;
			if (!prefix && file.path.includes("/")) continue;
			const content = await this.vault.cachedRead(file);
			const { frontmatter } = parseNote(content);
			const recallId = frontmatter["recall_id"];
			if (typeof recallId === "string" && recallId.length > 0) {
				index.set(recallId, file);
			}
		}

		this.index = index;
		return index;
	}

	private preferredPath(card: Card): string {
		const stem = renderFilenameStem(this.settings.filenameTemplate, {
			title: card.title,
			id: card.card_id,
			createdAt: card.created_at,
		});
		const folder = normalizePath(this.settings.folder);
		const prefix = folder ? `${folder}/` : "";
		return `${prefix}${stem}.md`;
	}

	private async updateExisting(
		card: Card,
		file: TFile,
		preferredPath: string,
	): Promise<SyncResult> {
		const existing = await this.vault.read(file);
		const next = composeNoteFromCard(card, {
			existing,
			syncedAt: new Date(),
			recallUrl: this.buildRecallUrl(card.card_id),
		});

		let outcome: SyncOutcome = "updated";
		if (next !== existing) {
			await this.vault.modify(file, next);
		}

		if (file.path !== preferredPath) {
			const available = await this.findAvailablePath(preferredPath, card.card_id);
			if (available !== file.path) {
				await this.vault.rename(file, available);
				outcome = "renamed";
			}
		}

		return { outcome, file };
	}

	private async createNew(
		card: Card,
		preferredPath: string,
		index: Map<string, TFile>,
	): Promise<SyncResult> {
		const path = await this.findAvailablePath(preferredPath, card.card_id);
		const content = composeNoteFromCard(card, {
			existing: null,
			syncedAt: new Date(),
			recallUrl: this.buildRecallUrl(card.card_id),
		});
		const file = await this.vault.create(path, content);
		index.set(card.card_id, file);
		return { outcome: "created", file };
	}

	/**
	 * Return a vault path that is either free, or already belongs to the
	 * same `recall_id`. If the preferred path is held by a DIFFERENT
	 * recall_id (or a non-Recall file), append a short-id suffix.
	 */
	private async findAvailablePath(
		preferred: string,
		recallId: string,
	): Promise<string> {
		const existing = this.vault.getFileByPath(preferred);
		if (!existing) return preferred;

		if (existing instanceof TFile && existing.extension === "md") {
			const content = await this.vault.cachedRead(existing);
			const { frontmatter } = parseNote(content);
			if (frontmatter["recall_id"] === recallId) {
				return preferred;
			}
		}
		return withSuffix(preferred, recallId);
	}

	private buildRecallUrl(cardId: string): string | undefined {
		const template = this.settings.recallWebAppUrlTemplate;
		if (!template) return undefined;
		return template.replace(/\{\{\s*id\s*\}\}/g, cardId).replace(/\{id\}/g, cardId);
	}
}

function withSuffix(path: string, recallId: string): string {
	const short = recallId.slice(0, 8);
	const dot = path.lastIndexOf(".");
	if (dot === -1) return `${path}-${short}`;
	return `${path.slice(0, dot)}-${short}${path.slice(dot)}`;
}
