import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeEditorView } from "../lib/prosemirror";
import {
  registerView,
  findAllMatchPositions,
  selectMatch,
} from "../lib/editorCommands";
import type { EditorView } from "prosemirror-view";

describe("findAllMatchPositions", () => {
  let container: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    view = makeEditorView(
      container,
      "Hello world.\n\nHello again.",
      true,
      undefined,
      undefined,
    );
    registerView(view);
  });

  afterEach(() => {
    registerView(null);
    view.destroy();
    document.body.removeChild(container);
  });

  it("returns empty array when query is empty", () => {
    expect(findAllMatchPositions("")).toEqual([]);
  });

  it("returns empty array when query is not found", () => {
    expect(findAllMatchPositions("xyz")).toEqual([]);
  });

  it("finds all case-insensitive matches", () => {
    const results = findAllMatchPositions("hello");
    expect(results).toHaveLength(2);
    for (const { from, to } of results) {
      expect(to - from).toBe(5);
    }
  });

  it("finds a single match", () => {
    const results = findAllMatchPositions("world");
    expect(results).toHaveLength(1);
    expect(results[0].to - results[0].from).toBe(5);
  });

  it("is case-insensitive", () => {
    expect(findAllMatchPositions("HELLO")).toHaveLength(2);
    expect(findAllMatchPositions("Hello")).toHaveLength(2);
  });
});

describe("selectMatch", () => {
  let container: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    view = makeEditorView(container, "Find me here.", true, undefined, undefined);
    registerView(view);
  });

  afterEach(() => {
    registerView(null);
    view.destroy();
    document.body.removeChild(container);
  });

  it("sets the editor selection to the given range", () => {
    const results = findAllMatchPositions("find");
    expect(results).toHaveLength(1);
    const { from, to } = results[0];
    selectMatch(from, to);
    expect(view.state.selection.from).toBe(from);
    expect(view.state.selection.to).toBe(to);
  });
});
