# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Change lifecycle

### Testing
All changes should be backed by tests and those, and the existing tests should pass.

### Git
After verification and validation, code changes should be committed to git.

## Commands

```bash
# Dev (Tauri desktop app)
npm run tauri dev

# JS unit tests
npm test                  # run once
npm run test:watch        # watch mode
npm run test:ui           # Vitest UI

# Run a single test file
npx vitest run src/test/project.test.ts

# Rust tests
cargo test --manifest-path src-tauri/Cargo.toml

# Build
npm run build
```

## Architecture

Booksaga is a Tauri desktop app (SolidJS frontend + Rust backend). It is also runnable in the browser via the Web platform adapter.

### Project structure on disk
A Booksaga project is a folder with this layout:
```
.booksaga/config.json   — project config (title, author, LLM model/API key)
manuscript/toc.md       — chapter order (custom markdown format)
manuscript/*.md         — chapter files
manuscript/art/         — images saved by the editor
wiki/                   — wiki pages (.md) and diagrams (.mmd), may be nested
exercises/              — timestamped writing exercise files
```

### Key abstractions

**`IFileSystem` (`src/lib/filesystem.ts`)** — interface with `readFile`, `writeFile`, `listMarkdownFiles`, `listDiagramFiles`, `deleteFile`, `deleteDir`. Two implementations: `BrowserFileSystem` (OPFS or native File System Access API) and a Tauri implementation. All app code uses `src/lib/fs.ts` as the single import point — never import the concrete backends directly.

**`ProjectModel` (`src/lib/project.ts`)** — loaded from an open directory. Holds `fs`, `config`, `toc`, `chapters` (ordered by toc.md), `wikiFiles`, `wikiDirs`, `diagramFiles`, `exerciseFiles`, `wikiIndex`, and `wikiTitleMap`. `loadProject()` is the entry point.

**Global store (`src/store.ts`)** — SolidJS signals: `project` (ProjectModel), `openFile`, `saving`, `activeSection`. Shared across all components.

**Editor (`src/components/Editor.tsx`)** — ProseMirror-based editor using a custom schema (`src/lib/prosemirror.ts`) that extends CommonMark with `[[wikilink]]` inline atoms, strikethrough, and footnote support. Markdown is the canonical storage format; ProseMirror state is derived from it on open and serialized back on save.

**Saga AI assistant (`src/lib/saga.ts`)** — Agentic loop using the Anthropic SDK (`streamSaga`). Tools: `list_wiki_pages`, `read_wiki_page`, `list_exercise_files`, `read_exercise_file`, `read_manuscript_excerpt`, `create_wiki_page`, `edit_wiki_page`, `web_search` (via Brave API, Tauri-invoked). Write tools (`create_wiki_page`, `edit_wiki_page`) require writer confirmation before execution. The stream yields typed `AgentEvent` values consumed by `SagaConsole`.

**Writing exercises (`src/lib/ai.ts`)** — `streamExercise()` streams a one-shot exercise prompt using `claude-haiku-4-5-20251001`. Prompts are stored in `src/assets/prompts.json`.

**Rust backend (`src-tauri/src/`)** — Tauri commands for: git operations (`git_init`, `git_commit_file` via `src-tauri/src/git.rs`), `save_image` (writes to `manuscript/art/` and auto-commits), `brave_search` (HTTP call to Brave Search API), and a `booksaga://` custom protocol that serves files from the open project root. The project root is shared via the `ProjectRoot` mutex state.

### Platform detection
`src/lib/fs.ts` exports `isTauri` (runtime check for `__TAURI_INTERNALS__`). Platform-specific features (native spell check, modifier key label) live in `src/lib/platform.ts`.

### Tests
Tests live in `src/test/`. They run in `happy-dom` via Vitest. Filesystem-dependent tests use mock implementations of `IFileSystem`.
