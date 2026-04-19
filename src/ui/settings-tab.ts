import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

import { RecallAuthError, RecallApiError } from "../recall/errors";
import { RecallClient } from "../recall/client";
import { obsidianFetch } from "../recall/fetchers-obsidian";
import {
	DEFAULT_SETTINGS,
	SYNC_INTERVAL_CHOICES,
	normalizeFolder,
	type RecallSyncSettings,
} from "../settings";

/** Host plugin interface — what the tab needs from main.ts. */
export interface SettingsHost extends Plugin {
	settings: RecallSyncSettings;
	saveSettings(): Promise<void>;
}

export class RecallSyncSettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly host: SettingsHost) {
		super(app, host);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const s = this.host.settings;

		new Setting(containerEl)
			.setName("Recall API key")
			.setDesc(
				"Personal API key from Recall → Settings → API & MCP. Starts with 'sk_'.",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text
					.setPlaceholder("sk_...")
					.setValue(s.apiKey)
					.onChange(async (value) => {
						s.apiKey = value.trim();
						await this.host.saveSettings();
					});
			})
			.addButton((btn) =>
				btn
					.setButtonText("Test connection")
					.setCta()
					.onClick(() => this.testConnection()),
			);

		new Setting(containerEl)
			.setName("Vault folder")
			.setDesc(
				"Where synced cards are written. Created if it doesn't exist. Leave blank for vault root.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.folder)
					.setValue(s.folder)
					.onChange(async (value) => {
						s.folder = normalizeFolder(value);
						await this.host.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Filename template")
			.setDesc(
				"Tokens: {{title}}, {{id}}, {{shortId}}, {{date}}. Example: '{{date}} — {{title}}'.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.filenameTemplate)
					.setValue(s.filenameTemplate)
					.onChange(async (value) => {
						s.filenameTemplate = value.trim() || DEFAULT_SETTINGS.filenameTemplate;
						await this.host.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Background sync")
			.setDesc("How often to pull new cards automatically.")
			.addDropdown((dd) => {
				for (const choice of SYNC_INTERVAL_CHOICES) {
					dd.addOption(String(choice.minutes), choice.label);
				}
				dd.setValue(String(s.syncIntervalMinutes));
				dd.onChange(async (value) => {
					s.syncIntervalMinutes = Number(value);
					await this.host.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Recall web-app URL template")
			.setDesc(
				"Optional. If your Recall cards have a public web URL, paste a template with '{{id}}' as the card-id placeholder. Leave blank to omit recall_url from frontmatter.",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://app.recall.it/card/{{id}}")
					.setValue(s.recallWebAppUrlTemplate)
					.onChange(async (value) => {
						s.recallWebAppUrlTemplate = value.trim();
						await this.host.saveSettings();
					}),
			);
	}

	private async testConnection(): Promise<void> {
		const key = this.host.settings.apiKey;
		if (!key) {
			new Notice("Enter an API key first.");
			return;
		}
		const client = new RecallClient({ apiKey: key, fetcher: obsidianFetch });
		try {
			const res = await client.listCards();
			new Notice(`Recall: connected. ${res.total_count} cards in your library.`);
		} catch (err) {
			if (err instanceof RecallAuthError) {
				new Notice("Recall: API key rejected. Check or regenerate it.");
			} else if (err instanceof RecallApiError) {
				new Notice(`Recall: ${err.message} (HTTP ${err.status})`);
			} else {
				new Notice(`Recall: connection failed. ${(err as Error).message}`);
			}
		}
	}
}
