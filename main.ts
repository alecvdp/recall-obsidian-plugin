import { Plugin } from "obsidian";

import { registerPullCommands } from "./src/commands/pull";
import {
	DEFAULT_SETTINGS,
	type RecallSyncSettings,
} from "./src/settings";
import { BackgroundSync, type SyncStatus } from "./src/sync/background-sync";
import { describeStatus } from "./src/ui/sync-status";
import { RecallSyncSettingsTab } from "./src/ui/settings-tab";

const STATUS_REFRESH_INTERVAL_MS = 60 * 1000;

export default class RecallSyncPlugin extends Plugin {
	settings!: RecallSyncSettings;
	bgSync!: BackgroundSync;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("recall-sync-status");

		this.bgSync = new BackgroundSync(this, (s) => this.renderStatus(s));

		this.addSettingTab(new RecallSyncSettingsTab(this.app, this));
		registerPullCommands(this);

		this.addCommand({
			id: "sync-now",
			name: "Sync new cards from Recall now",
			callback: () => void this.bgSync.syncNow(),
		});

		this.bgSync.start();

		// Status bar shows relative times ("5m ago"); refresh so it stays fresh.
		this.registerInterval(
			window.setInterval(
				() => this.renderStatus(this.bgSync.getStatus()),
				STATUS_REFRESH_INTERVAL_MS,
			),
		);
	}

	async onunload(): Promise<void> {
		this.bgSync?.stop();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as
			| Partial<RecallSyncSettings>
			| null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	restartBackgroundSync(): void {
		this.bgSync?.restart();
	}

	private renderStatus(status: SyncStatus): void {
		if (!this.statusBarEl) return;
		const { text, tooltip } = describeStatus(status);
		this.statusBarEl.setText(text);
		this.statusBarEl.setAttr("aria-label", tooltip);
		this.statusBarEl.title = tooltip;
	}
}
