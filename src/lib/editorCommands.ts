import { TextSelection } from "prosemirror-state";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import type { EditorView } from "prosemirror-view";
import { editorSchema } from "./prosemirror";

let _view: EditorView | null = null;

export function registerView(view: EditorView | null) {
  _view = view;
}

function withView(fn: (view: EditorView) => void) {
  if (!_view) return;
  fn(_view);
  _view.focus();
}

// ---------------------------------------------------------------------------
// Scroll to text passage
// ---------------------------------------------------------------------------

/**
 * Locate `context` in the current editor document and scroll to it.
 * If `text` is provided, scroll to `text` within the found context span;
 * this handles cases where a shorter phrase appears multiple times but the
 * broader context is unique.
 * Returns false if the text is not found or no view is registered.
 */
// Strip common inline markdown syntax so context from raw markdown matches
// rendered doc.textContent (e.g. "**bold**" → "bold").
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

export function scrollToText(context: string, text?: string): boolean {
  if (!_view) return false;
  const { state } = _view;
  const doc = state.doc;

  const normContext = stripInlineMarkdown(context);
  const normText = text ? stripInlineMarkdown(text) : undefined;

  // doc.textContent concatenates all text nodes without separators.
  const haystack = doc.textContent.toLowerCase();
  const contextIdx = haystack.indexOf(normContext.toLowerCase());
  if (contextIdx === -1) return false;

  // Narrow to the shorter target phrase if provided and found within the context span.
  let targetIdx = contextIdx;
  let targetLen = normContext.length;
  if (normText) {
    const inner = haystack.indexOf(normText.toLowerCase(), contextIdx);
    if (inner !== -1 && inner < contextIdx + normContext.length) {
      targetIdx = inner;
      targetLen = normText.length;
    }
  }

  // Walk text nodes to convert textContent offsets to ProseMirror positions.
  const end = targetIdx + targetLen;
  let from = -1;
  let to = -1;
  let offset = 0;

  doc.descendants((node, pos) => {
    if (to !== -1) return false;
    if (!node.isText) return true;
    const len = node.text!.length;
    if (from === -1 && offset + len > targetIdx) {
      from = pos + (targetIdx - offset);
    }
    if (from !== -1 && offset + len >= end) {
      to = pos + (end - offset);
    }
    offset += len;
    return true;
  });

  if (from === -1 || to === -1) return false;

  _view.dispatch(
    state.tr.setSelection(TextSelection.create(doc, from, to)).scrollIntoView(),
  );

  flashHighlight(from, to);
  return true;
}

function flashHighlight(from: number, to: number) {
  if (!_view) return;
  try {
    const domFrom = _view.domAtPos(from);
    const domTo = _view.domAtPos(to);
    const range = document.createRange();
    range.setStart(domFrom.node, domFrom.offset);
    range.setEnd(domTo.node, domTo.offset);
    const span = document.createElement("span");
    span.className = "highlight-flash";
    range.surroundContents(span);
    setTimeout(() => span.replaceWith(...span.childNodes), 1600);
  } catch {
    // surroundContents throws if the range crosses element boundaries; ignore.
  }
}

// ---------------------------------------------------------------------------
// Find — locate all occurrences of a string in the document
// ---------------------------------------------------------------------------

export function findAllMatchPositions(
  query: string,
): { from: number; to: number }[] {
  if (!_view || !query) return [];
  const { doc } = _view.state;

  const textNodes: Array<{ pos: number; text: string }> = [];
  doc.descendants((node, pos) => {
    if (node.isText) textNodes.push({ pos, text: node.text! });
    return true;
  });
  const flat = textNodes.map((n) => n.text).join("").toLowerCase();
  const needle = query.toLowerCase();
  const results: { from: number; to: number }[] = [];

  let searchFrom = 0;
  while (true) {
    const start = flat.indexOf(needle, searchFrom);
    if (start === -1) break;
    const end = start + needle.length;

    // Mirrors scrollToText: strict > for start, >= for end
    let from = -1, to = -1, offset = 0;
    for (const n of textNodes) {
      const len = n.text.length;
      if (from === -1 && offset + len > start) from = n.pos + (start - offset);
      if (from !== -1 && offset + len >= end) { to = n.pos + (end - offset); break; }
      offset += len;
    }
    if (from !== -1 && to !== -1) results.push({ from, to });
    searchFrom = start + 1;
  }
  return results;
}

export function selectMatch(from: number, to: number): void {
  if (!_view) return;
  const { state } = _view;
  _view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView(),
  );
  _view.focus();
}

// ---------------------------------------------------------------------------
// Inline marks — applies to selection, or current word if nothing selected
// ---------------------------------------------------------------------------

export function applyMark(markName: "strong" | "em" | "strikethrough") {
  withView((view) => {
    const markType = editorSchema.marks[markName];
    const { state, dispatch } = view;
    const { selection, doc } = state;

    if (!selection.empty) {
      toggleMark(markType)(state, dispatch);
      return;
    }

    // Expand to word boundaries at cursor
    const { $from } = selection;
    const text = $from.parent.textContent;
    const offset = $from.parentOffset;
    let lo = offset,
      hi = offset;
    while (lo > 0 && /\w/.test(text[lo - 1])) lo--;
    while (hi < text.length && /\w/.test(text[hi])) hi++;

    if (lo === hi) {
      // No word — toggle stored mark so next typed chars use it
      toggleMark(markType)(state, dispatch);
      return;
    }

    const base = $from.start();
    const from = base + lo,
      to = base + hi;
    const tr = state.tr;
    if (doc.rangeHasMark(from, to, markType)) {
      tr.removeMark(from, to, markType);
    } else {
      tr.addMark(from, to, markType.create());
    }
    dispatch(tr);
  });
}

// ---------------------------------------------------------------------------
// Block type — headings (toggles back to paragraph if already that level)
// ---------------------------------------------------------------------------

export function applyHeading(level: 1 | 2 | 3) {
  withView(({ state, dispatch }) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (
      node.type === editorSchema.nodes.heading &&
      node.attrs.level === level
    ) {
      setBlockType(editorSchema.nodes.paragraph)(state, dispatch);
    } else {
      setBlockType(editorSchema.nodes.heading, { level })(state, dispatch);
    }
  });
}

// ---------------------------------------------------------------------------
// Lists and blockquote
// ---------------------------------------------------------------------------

export function applyBulletList() {
  withView(({ state, dispatch }) => {
    wrapIn(editorSchema.nodes.bullet_list)(state, dispatch);
  });
}

export function applyOrderedList() {
  withView(({ state, dispatch }) => {
    wrapIn(editorSchema.nodes.ordered_list)(state, dispatch);
  });
}

export function applyBlockquote() {
  withView(({ state, dispatch }) => {
    wrapIn(editorSchema.nodes.blockquote)(state, dispatch);
  });
}

// ---------------------------------------------------------------------------
// Insert a citation node at the current cursor position
// ---------------------------------------------------------------------------

export function insertCitation(wikiPage: string) {
  withView((view) => {
    const node = editorSchema.nodes.citation.create({ wikiPage });
    const { state, dispatch } = view;
    dispatch(state.tr.replaceSelectionWith(node));
  });
}

// ---------------------------------------------------------------------------
// Insert arbitrary markdown text at the current cursor position
// ---------------------------------------------------------------------------

export function insertMarkdown(text: string) {
  withView((view) => {
    const { state, dispatch } = view;
    dispatch(state.tr.insertText(text));
  });
}

// ---------------------------------------------------------------------------
// Inline code — wraps selection, or inserts `` with cursor between
// ---------------------------------------------------------------------------

export function applyInlineCode() {
  withView((view) => {
    const { state, dispatch } = view;
    if (!state.selection.empty) {
      toggleMark(editorSchema.marks.code)(state, dispatch);
      return;
    }
    const tr = state.tr.insertText("``");
    dispatch(
      tr.setSelection(TextSelection.create(tr.doc, tr.selection.from - 1)),
    );
  });
}
