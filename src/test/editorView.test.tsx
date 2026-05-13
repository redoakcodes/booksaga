import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks — hoisted before any real imports by Vitest
// ---------------------------------------------------------------------------

vi.mock("../lib/prosemirror", () => ({
  makeEditorView: vi.fn((container: HTMLElement) => {
    const pm = document.createElement("div");
    pm.className = "ProseMirror";
    container.appendChild(pm);
    return {
      destroy: vi.fn(() => { while (container.firstChild) container.removeChild(container.firstChild); }),
      focus: vi.fn(),
      state: {},
      updateState: vi.fn(),
    };
  }),
  editorSchema: {
    marks: { strong: {}, em: {}, code: {}, strikethrough: {} },
    nodes: { heading: {}, paragraph: {}, bullet_list: {}, ordered_list: {}, blockquote: {} },
  },
  parseMarkdown: vi.fn(() => ({})),
  serializeMarkdown: vi.fn(() => ""),
}));

vi.mock("../lib/editorCommands", () => ({
  registerView: vi.fn(),
  applyMark: vi.fn(),
  applyHeading: vi.fn(),
  applyBulletList: vi.fn(),
  applyOrderedList: vi.fn(),
  applyBlockquote: vi.fn(),
  applyInlineCode: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import App from "../App";
import { store } from "../store";
import type { ProjectModel } from "../lib/project";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeProject: ProjectModel = {
  fs: { readFile: async () => null, writeFile: async () => {} } as any,
  config: { project: { title: "Test Project", author: "" } } as any,
  toc: { rootChapters: [] } as any,
  chapters: [],
  wikiFiles: [],
  wikiDirs: [],
  diagramFiles: [],
  exerciseFiles: [],
  wikiIndex: { forward: new Map(), backward: new Map(), pages: [] },
};

const fakeFile = {
  section: "manuscript" as const,
  filename: "chapter1.md",
  content: "# Hello\n\nSome content.",
  dirty: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("editor view toggle", () => {
  afterEach(() => {
    store.setOpenFile(null);
    store.setProject(null);
    cleanup();
  });

  it("renders the rich-text editor when a file is open (pre-set store)", () => {
    store.setProject(fakeProject);
    store.setOpenFile(fakeFile);
    render(() => <App />);
    expect(document.querySelector(".editor-container")).toBeTruthy();
    expect(document.querySelector(".markdown-source")).toBeNull();
  });

  it("renders the rich-text editor when store is set reactively after render", () => {
    store.setProject(null);
    store.setOpenFile(null);
    render(() => <App />);

    expect(document.querySelector(".editor-container")).toBeNull();

    store.setProject(fakeProject);
    store.setOpenFile(fakeFile);

    expect(document.querySelector(".editor-container")).toBeTruthy();
    expect(document.querySelector(".markdown-source")).toBeNull();
  });

  it("renders the markdown textarea after toggling to markdown view", async () => {
    store.setProject(fakeProject);
    store.setOpenFile(fakeFile);
    const user = userEvent.setup();
    render(() => <App />);

    await user.click(screen.getByText("Menu"));
    await user.click(screen.getByText("View Markdown"));

    expect(document.querySelector(".markdown-source")).toBeTruthy();
    expect(document.querySelector(".editor-container")).toBeNull();
  });

  it("shows a platform-appropriate save shortcut hint in the Menu", async () => {
    store.setProject(fakeProject);
    store.setOpenFile(fakeFile);
    const user = userEvent.setup();
    render(() => <App />);

    await user.click(screen.getByText("Menu"));

    // In the test env (happy-dom, non-Mac), modKeyLabel is "Ctrl+" → hint is "Ctrl+S".
    // On macOS it would show "⌘S". Either way, the hint element must be present.
    const hint = document.querySelector(".toolbar-item-hint");
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toMatch(/^(⌘S|Ctrl\+S)$/);
  });

  it("restores the rich-text editor after toggling back from markdown view", async () => {
    store.setProject(fakeProject);
    store.setOpenFile(fakeFile);
    const user = userEvent.setup();
    render(() => <App />);

    await user.click(screen.getByText("Menu"));
    await user.click(screen.getByText("View Markdown"));
    expect(document.querySelector(".markdown-source")).toBeTruthy();

    await user.click(screen.getByText("Menu"));
    await user.click(screen.getByText("View Formatted"));

    expect(document.querySelector(".editor-container")).toBeTruthy();
    expect(document.querySelector(".markdown-source")).toBeNull();
  });
});
