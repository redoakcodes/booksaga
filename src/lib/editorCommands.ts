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
    let lo = offset, hi = offset;
    while (lo > 0 && /\w/.test(text[lo - 1])) lo--;
    while (hi < text.length && /\w/.test(text[hi])) hi++;

    if (lo === hi) {
      // No word — toggle stored mark so next typed chars use it
      toggleMark(markType)(state, dispatch);
      return;
    }

    const base = $from.start();
    const from = base + lo, to = base + hi;
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
    if (node.type === editorSchema.nodes.heading && node.attrs.level === level) {
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
    dispatch(tr.setSelection(TextSelection.create(tr.doc, tr.selection.from - 1)));
  });
}
