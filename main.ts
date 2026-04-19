import { Plugin } from "obsidian";

import { registerPullCommands } from "./src/commands/pull";
import {
	DEFAULT_SETTINGS,
	type RecallSyncSettings,
} from "./src/settings";
import { RecallSyncSettingsTab } from "./src/ui/settings-tab";

export default class RecallSyncPlugin extends Plugin {
	settings!: RecallSyncSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new RecallSyncSettingsTab(this.app, this));
		registerPullCommands(this);
	}

	async onunload(): Promise<void> {}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as
			| Partial<RecallSyncSettings>
			| null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
