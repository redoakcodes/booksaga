# Booksaga

Booksaga is a manuscript editor with built in wiki and writing exercises. It uses markdown as it's primary formatting and data structure. 

## Custom Markdown

Booksaga uses standard markdown with the addition of:
- [[_path_]] - Backlinks. Used to connect wiki pages.
- ~~_striken text_~~ - strikethrough
- [^_id_] - footnote
- [^_id_]: - footnote text

## Running

Running in dev:
`npm run dev tauri`
