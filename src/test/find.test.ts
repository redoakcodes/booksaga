import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeEditorView } from "../lib/prosemirror";
import {
  registerView,
  findAllMatchPositions,
  scrollAndHighlight,
  replaceMatch,
  replaceAllMatches,
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

describe("replaceMatch", () => {
  let container: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    view = makeEditorView(container, "Hello world.", true, undefined, undefined);
    registerView(view);
  });

  afterEach(() => {
    registerView(null);
    view.destroy();
    document.body.removeChild(container);
  });

  it("replaces matched text with the replacement string", () => {
    const results = findAllMatchPositions("world");
    expect(results).toHaveLength(1);
    replaceMatch(results[0].from, results[0].to, "earth");
    expect(view.state.doc.textContent).toContain("earth");
    expect(view.state.doc.textContent).not.toContain("world");
  });

  it("deletes matched text when replacement is empty", () => {
    const results = findAllMatchPositions("world");
    replaceMatch(results[0].from, results[0].to, "");
    expect(view.state.doc.textContent).not.toContain("world");
  });
});

describe("replaceAllMatches", () => {
  let container: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    view = makeEditorView(
      container,
      "cat and cat and cat.",
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

  it("replaces all occurrences in a single transaction", () => {
    const results = findAllMatchPositions("cat");
    expect(results).toHaveLength(3);
    replaceAllMatches(results, "dog");
    const text = view.state.doc.textContent;
    expect(text).not.toContain("cat");
    expect(text.match(/dog/g)).toHaveLength(3);
  });

  it("deletes all occurrences when replacement is empty", () => {
    const results = findAllMatchPositions("cat");
    replaceAllMatches(results, "");
    expect(view.state.doc.textContent).not.toContain("cat");
  });
});

describe("scrollAndHighlight", () => {
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

  it("does not change the editor selection", () => {
    const before = view.state.selection.from;
    const results = findAllMatchPositions("find");
    expect(results).toHaveLength(1);
    scrollAndHighlight(results[0].from, results[0].to);
    expect(view.state.selection.from).toBe(before);
  });

  it("does not throw for valid positions", () => {
    const results = findAllMatchPositions("me");
    expect(results).toHaveLength(1);
    expect(() => scrollAndHighlight(results[0].from, results[0].to)).not.toThrow();
  });
});
