/**
 * Integration test — uses the REAL ProseMirror (no mock).
 * If this fails, the error tells us why makeEditorView breaks in the browser.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { makeEditorView } from "../lib/prosemirror";

describe("makeEditorView (real ProseMirror)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("creates an EditorView attached to the container", () => {
    const view = makeEditorView(container, "# Hello\n\nContent.", true, undefined, undefined);
    expect(container.querySelector(".ProseMirror")).toBeTruthy();
    view.destroy();
  });

  it("populates the editor with the parsed content", () => {
    const view = makeEditorView(container, "# Hello\n\nWorld.", true, undefined, undefined);
    const pmEl = container.querySelector(".ProseMirror");
    expect(pmEl?.textContent).toContain("Hello");
    view.destroy();
  });

  it("creates an editable view when editable=true", () => {
    const view = makeEditorView(container, "text", true, undefined, undefined);
    const pmEl = container.querySelector(".ProseMirror");
    expect((pmEl as HTMLElement)?.contentEditable).toBe("true");
    view.destroy();
  });

  it("disables spellcheck outside Tauri on macOS (test env is neither)", () => {
    const view = makeEditorView(container, "text", true, undefined, undefined);
    const pmEl = container.querySelector(".ProseMirror") as HTMLElement;
    expect(pmEl?.getAttribute("spellcheck")).toBe("false");
    view.destroy();
  });

  it("calls onChange when the document changes", () => {
    let changed = "";
    const view = makeEditorView(container, "initial", true, (md) => { changed = md; }, undefined);
    const { state, dispatch } = view;
    const tr = state.tr.insertText(" more", state.doc.content.size - 1);
    dispatch(tr);
    expect(changed).toContain("more");
    view.destroy();
  });
});
