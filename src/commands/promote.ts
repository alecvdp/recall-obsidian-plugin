/**
 * "Promote to permanent note" command.
 *
 * From an open Recall card note:
 *  1. Pick a target: new note in a folder, existing note, or today's daily.
 *  2. Insert a link back to the source card in the target.
 *  3. Set `promoted_to: [[Target]]` in the source frontmatter so the
 *     Promoted base view picks it up.
 *
 * The command is only offered when the active file has a `recall_id` in its
 * frontmatter; we read that from metadataCache so checkCallback stays sync.
 */

import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Plugin,
	TFile,
	normalizePath,
} from "obsidian";

import { updateFrontmatter } from "../note/compose";
import { appendLinkLine, newNoteScaffold } from "./promote-content";

type TargetKind = "new" | "existing" | "daily";

interface TargetKindChoice {
	kind: TargetKind;
	label: string;
}

export function registerPromoteCommand(plugin: Plugin): void {
	plugin.addCommand({
		id: "promote-to-permanent",
		name: "Promote Recall card to permanent note",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !isRecallCard(plugin.app, file)) return false;
			if (!checking) void runPromote(plugin.app, file);
			return true;
		},
	});
}

function isRecallCard(app: App, file: TFile): boolean {
	if (file.extension !== "md") return false;
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	const id = fm?.["recall_id"];
	return typeof id === "string" && id.length > 0;
}

async function runPromote(app: App, source: TFile): Promise<void> {
	const kind = await pickTargetKind(app);
	if (!kind) return;

	let target: TFile | null = null;
	try {
		if (kind === "new") {
			target = await handleNewNote(app, source);
		} else if (kind === "existing") {
			target = await handleExisting(app, source);
		} else {
			target = await handleDaily(app, source);
		}
	} catch (err) {
		new Notice(`Promote failed: ${(err as Error).message}`);
		return;
	}
	if (!target) return;

	await app.vault.process(source, (content) =>
		updateFrontmatter(content, {
			promoted_to: `[[${target!.basename}]]`,
		}),
	);

	new Notice(`Promoted to ${target.basename}`);
	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(target);
}

function pickTargetKind(app: App): Promise<TargetKind | null> {
	return new Promise((resolve) => {
		new TargetKindModal(app, resolve).open();
	});
}

class TargetKindModal extends FuzzySuggestModal<TargetKindChoice> {
	private resolved = false;

	constructor(
		app: App,
		private readonly resolve: (k: TargetKind | null) => void,
	) {
		super(app);
		this.setPlaceholder("Promote to…");
	}

	getItems(): TargetKindChoice[] {
		return [
			{ kind: "new", label: "Create new permanent note…" },
			{ kind: "existing", label: "Append to existing note…" },
			{ kind: "daily", label: "Append to today's daily note" },
		];
	}

	getItemText(item: TargetKindChoice): string {
		return item.label;
	}

	onChooseItem(item: TargetKindChoice): void {
		this.resolved = true;
		this.resolve(item.kind);
	}

	onClose(): void {
		super.onClose();
		if (!this.resolved) this.resolve(null);
	}
}

async function handleNewNote(app: App, source: TFile): Promise<TFile | null> {
	const raw = await promptForPath(app, source);
	if (!raw) return null;

	const withExt = raw.endsWith(".md") ? raw : `${raw}.md`;
	const path = normalizePath(withExt);

	if (app.vault.getFileByPath(path)) {
		new Notice("A note at that path already exists.");
		return null;
	}

	const slashIdx = path.lastIndexOf("/");
	const parent = slashIdx > 0 ? path.slice(0, slashIdx) : "";
	if (parent && !app.vault.getFolderByPath(parent)) {
		await app.vault.createFolder(parent);
	}

	const basename = path.slice(slashIdx + 1).replace(/\.md$/, "");
	const content = newNoteScaffold(basename, source.basename);
	return app.vault.create(path, content);
}

function promptForPath(app: App, source: TFile): Promise<string | null> {
	return new Promise((resolve) => {
		new NewNotePathModal(app, source, resolve).open();
	});
}

class NewNotePathModal extends Modal {
	private value: string;
	private resolved = false;

	constructor(
		app: App,
		source: TFile,
		private readonly resolve: (p: string | null) => void,
	) {
		super(app);
		this.value = source.basename;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "New permanent note" });
		contentEl.createEl("p", {
			text: "Path relative to vault root. '.md' is optional.",
		});

		const input = contentEl.createEl("input", { type: "text" });
		input.value = this.value;
		input.style.width = "100%";
		input.addEventListener("input", () => {
			this.value = input.value;
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const submit = buttons.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		submit.addEventListener("click", () => this.submit());
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	private submit(): void {
		const val = this.value.trim();
		if (!val) return;
		this.resolved = true;
		this.resolve(val);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) this.resolve(null);
	}
}

async function handleExisting(
	app: App,
	source: TFile,
): Promise<TFile | null> {
	const target = await pickExistingFile(app, source);
	if (!target) return null;
	await appendLinkTo(app, target, source);
	return target;
}

function pickExistingFile(app: App, source: TFile): Promise<TFile | null> {
	const files = app.vault
		.getMarkdownFiles()
		.filter((f) => f.path !== source.path);
	return new Promise((resolve) => {
		new FileSuggestModal(app, files, resolve).open();
	});
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
	private resolved = false;

	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly resolve: (f: TFile | null) => void,
	) {
		super(app);
		this.setPlaceholder("Pick target note…");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(f: TFile): string {
		return f.path;
	}

	onChooseItem(f: TFile): void {
		this.resolved = true;
		this.resolve(f);
	}

	onClose(): void {
		super.onClose();
		if (!this.resolved) this.resolve(null);
	}
}

async function handleDaily(app: App, source: TFile): Promise<TFile | null> {
	const target = await ensureDailyNote(app);
	if (!target) {
		new Notice("Recall: enable the Daily notes core plugin first.");
		return null;
	}
	await appendLinkTo(app, target, source);
	return target;
}

interface DailyNotesOptions {
	format?: string;
	folder?: string;
}

interface InternalPluginsHost {
	internalPlugins?: {
		getPluginById?: (id: string) => {
			enabled?: boolean;
			instance?: { options?: DailyNotesOptions };
		} | null;
	};
}

async function ensureDailyNote(app: App): Promise<TFile | null> {
	const moment = (window as unknown as {
		moment?: (d?: unknown) => { format(fmt: string): string };
	}).moment;
	if (!moment) return null;

	const plugin = (app as unknown as InternalPluginsHost).internalPlugins
		?.getPluginById?.("daily-notes");
	if (!plugin?.enabled) return null;

	const opts = plugin.instance?.options ?? {};
	const format = opts.format && opts.format.length > 0 ? opts.format : "YYYY-MM-DD";
	const folder = opts.folder ?? "";

	const filename = `${moment().format(format)}.md`;
	const path = normalizePath(folder ? `${folder}/${filename}` : filename);

	const existing = app.vault.getFileByPath(path);
	if (existing instanceof TFile) return existing;

	const slashIdx = path.lastIndexOf("/");
	const parent = slashIdx > 0 ? path.slice(0, slashIdx) : "";
	if (parent && !app.vault.getFolderByPath(parent)) {
		await app.vault.createFolder(parent);
	}
	return app.vault.create(path, "");
}

async function appendLinkTo(
	app: App,
	target: TFile,
	source: TFile,
): Promise<void> {
	const link = `[[${source.basename}]]`;
	await app.vault.process(target, (data) => appendLinkLine(data, link));
}
