/**
 * Tests the Editor component with the REAL ProseMirror (no prosemirror mock).
 * Only editorCommands is mocked to avoid its side effects.
 * This verifies that makeEditorView is actually called and PM content is created
 * when the Editor is mounted via SolidJS's reactive lifecycle.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import { batch, createSignal, Show } from "solid-js";

vi.mock("../lib/editorCommands", () => ({
  registerView: vi.fn(),
}));

import Editor from "../components/Editor";

describe("Editor component (real ProseMirror)", () => {
  afterEach(cleanup);

  it("creates .ProseMirror inside .editor-container on mount", () => {
    render(() => (
      <Editor
        fileKey="manuscript:chapter1.md"
        content="# Hello\n\nContent."
        onChange={() => {}}
      />
    ));
    const container = document.querySelector(".editor-container");
    expect(container).toBeTruthy();
    expect(container?.querySelector(".ProseMirror")).toBeTruthy();
  });

  it("reinitializes when fileKey changes (different file)", async () => {
    const [key, setKey] = createSignal("manuscript:chapter1.md");
    const [content, setContent] = createSignal("# Chapter One");
    render(() => (
      <Editor
        fileKey={key()}
        content={content()}
        onChange={() => {}}
      />
    ));

    expect(document.querySelector(".ProseMirror")).toBeTruthy();

    // Both must change atomically (mirrors store.setOpenFile which is a single signal update)
    batch(() => {
      setKey("manuscript:chapter2.md");
      setContent("# Chapter Two");
    });

    expect(document.querySelector(".ProseMirror")).toBeTruthy();
    expect(document.querySelector(".ProseMirror")?.textContent).toContain("Chapter Two");
  });

  it("mounts correctly when shown via a reactive Show", () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <Show when={open()}>
        <Editor fileKey="ms:ch1.md" content="Hello world" onChange={() => {}} />
      </Show>
    ));

    expect(document.querySelector(".editor-container")).toBeNull();

    setOpen(true);

    expect(document.querySelector(".editor-container")).toBeTruthy();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();
  });

  it("mounts correctly when shown via nested reactive Shows", () => {
    const [outer, setOuter] = createSignal(false);
    const [inner, setInner] = createSignal(true);
    render(() => (
      <Show when={outer()}>
        <Show when={inner()}>
          <Editor fileKey="ms:ch1.md" content="Hello world" onChange={() => {}} />
        </Show>
      </Show>
    ));

    expect(document.querySelector(".editor-container")).toBeNull();

    setOuter(true);

    expect(document.querySelector(".editor-container")).toBeTruthy();
    expect(document.querySelector(".ProseMirror")).toBeTruthy();
    expect(document.querySelector(".ProseMirror")?.textContent).toContain("Hello world");
  });
});
