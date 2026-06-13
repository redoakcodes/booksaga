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
`npm run tauri dev`

## Testing

JavaScript tests (unit):
```
npm test
```

Rust tests (unit + integration):
```
cargo test --manifest-path src-tauri/Cargo.toml
```

The Rust suite includes unit tests for the git history layer (`src-tauri/src/git.rs`) and integration tests covering the import flow scenarios (`src-tauri/tests/import_flow.rs`). Cargo discovers and runs both automatically.

# Roadmap Bag
1. References tracking
2. Editing workflow
3. Typesetting?
