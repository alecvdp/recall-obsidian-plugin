import { App, FuzzySuggestModal } from "obsidian";

import type { CardPreview } from "../recall/types";

/**
 * Searchable picker for a single card. The displayed text includes the
 * source host so users can disambiguate identically-titled saves.
 */
export class CardSuggestModal extends FuzzySuggestModal<CardPreview> {
	constructor(
		app: App,
		private readonly cards: CardPreview[],
		private readonly onPick: (card: CardPreview) => void,
	) {
		super(app);
		this.setPlaceholder("Search Recall cards…");
	}

	getItems(): CardPreview[] {
		return this.cards;
	}

	getItemText(card: CardPreview): string {
		const host = card.source_url ? ` — ${hostOf(card.source_url)}` : "";
		return `${card.title}${host}`;
	}

	onChooseItem(card: CardPreview): void {
		this.onPick(card);
	}
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}
