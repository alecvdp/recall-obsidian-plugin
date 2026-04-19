import { Notice, Plugin } from "obsidian";

export default class RecallSyncPlugin extends Plugin {
	async onload(): Promise<void> {
		this.addCommand({
			id: "ping",
			name: "Ping (scaffolding check)",
			callback: () => new Notice("Recall Sync: plugin loaded."),
		});
	}

	async onunload(): Promise<void> {}
}
