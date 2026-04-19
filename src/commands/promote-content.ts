/**
 * Pure helpers for the Promote command. Kept free of Obsidian imports so
 * the behaviour is unit-testable under `tsx --test`.
 */

export function newNoteScaffold(title: string, sourceBasename: string): string {
	return `# ${title}\n\nSource: [[${sourceBasename}]]\n`;
}

/**
 * Append `- <link>` to `data`, ensuring exactly one blank line above the
 * new bullet. If the link is already present anywhere in the file, return
 * `data` unchanged so repeated promotes stay idempotent.
 */
export function appendLinkLine(data: string, link: string): string {
	if (data.includes(link)) return data;
	const trimmed = data.replace(/\s+$/, "");
	if (trimmed.length === 0) return `- ${link}\n`;
	return `${trimmed}\n\n- ${link}\n`;
}
