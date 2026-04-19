# Recall Sync

One-way sync of cards from [Recall](https://recall.it) into your Obsidian vault as markdown notes, with [Bases](https://help.obsidian.md/bases) views over the synced library.

Status: early development. Not yet on community plugins.

## What it does

- Pulls cards from Recall's public API into a folder in your vault.
- Writes rich frontmatter (source type, author, duration, word count, Recall tags) so Bases can give you multiple views over the library.
- Recall-managed content sits inside a fenced section; anything you write below the fence survives re-sync.
- Ships a default `Recall.base` with Inbox / By source type / Long-form queue / By channel / Promoted views on first sync.

## What it does not do

- Write back to Recall. The public API is read-only; write support is on their roadmap.
- Duplicate Recall's MCP surface. If your editor speaks MCP, connect to Recall's MCP server directly.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # production build
```

Symlink this repo into `<your-vault>/.obsidian/plugins/recall-sync/` to test in a vault.
