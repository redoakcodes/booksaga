import { Schema, type DOMOutputSpec, type MarkType } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import {
  inputRules,
  InputRule,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import {
  schema as baseSchema,
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import MarkdownIt from "markdown-it";
import { nativeSpellCheck } from "./platform";

const WIKILINK_RE = /\[\[([^\][\n]+)\]\]/g;
const STRIKETHROUGH_RE = /~~([^~\n]+)~~/g;

// ---------------------------------------------------------------------------
// Schema — base CommonMark schema + wikilink inline atom
// ---------------------------------------------------------------------------

export const editorSchema = new Schema({
  nodes: baseSchema.spec.nodes.addBefore("image", "wikilink", {
    group: "inline",
    inline: true,
    atom: true,
    attrs: { target: {} },
    toDOM(node): DOMOutputSpec {
      return [
        "span",
        { class: "wikilink", "data-wikilink": node.attrs.target as string },
        `[[${node.attrs.target}]]`,
      ];
    },
    parseDOM: [
      {
        tag: "span[data-wikilink]",
        getAttrs(dom) {
          return { target: (dom as HTMLElement).getAttribute("data-wikilink") ?? "" };
        },
      },
    ],
  }),
  marks: baseSchema.spec.marks
    .addToEnd("strikethrough", {
      toDOM(): DOMOutputSpec { return ["s", 0]; },
      parseDOM: [{ tag: "s" }, { tag: "del" }],
    })
});

// ---------------------------------------------------------------------------
// Markdown parser — CommonMark + [[wikilink]] tokens
// ---------------------------------------------------------------------------

function addWikilinkRule(md: MarkdownIt): void {
  md.core.ruler.push("wikilink", (state) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      const next: typeof block.children = [];
      for (const tok of block.children) {
        if (tok.type !== "text") { next.push(tok); continue; }
        let last = 0;
        let m: RegExpExecArray | null;
        WIKILINK_RE.lastIndex = 0;
        while ((m = WIKILINK_RE.exec(tok.content)) !== null) {
          if (m.index > last) {
            const t = new state.Token("text", "", 0);
            t.content = tok.content.slice(last, m.index);
            next.push(t);
          }
          const wl = new state.Token("wikilink", "", 0);
          wl.attrSet("target", m[1]);
          next.push(wl);
          last = m.index + m[0].length;
        }
        if (last < tok.content.length) {
          const t = new state.Token("text", "", 0);
          t.content = tok.content.slice(last);
          next.push(t);
        }
      }
      block.children = next;
    }
  });
}

function addSpanRule(md: MarkdownIt, re: RegExp, tokenName: string): void {
  md.core.ruler.push(tokenName, (state) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      const next: typeof block.children = [];
      for (const tok of block.children) {
        if (tok.type !== "text") { next.push(tok); continue; }
        let last = 0;
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(tok.content)) !== null) {
          if (m.index > last) {
            const t = new state.Token("text", "", 0);
            t.content = tok.content.slice(last, m.index);
            next.push(t);
          }
          next.push(new state.Token(`${tokenName}_open`, "", 1));
          const t = new state.Token("text", "", 0);
          t.content = m[1];
          next.push(t);
          next.push(new state.Token(`${tokenName}_close`, "", -1));
          last = m.index + m[0].length;
        }
        if (last < tok.content.length) {
          const t = new state.Token("text", "", 0);
          t.content = tok.content.slice(last);
          next.push(t);
        }
      }
      block.children = next;
    }
  });
}

const md = new MarkdownIt("commonmark", { html: false });
addWikilinkRule(md);
addSpanRule(md, STRIKETHROUGH_RE, "strikethrough");

const parser = new MarkdownParser(editorSchema, md, {
  ...defaultMarkdownParser.tokens,
  wikilink: {
    node: "wikilink",
    getAttrs: (tok) => ({ target: tok.attrGet("target") ?? "" }),
  },
  strikethrough: { mark: "strikethrough" },
});

// ---------------------------------------------------------------------------
// Markdown serializer — extends default with wikilink node
// ---------------------------------------------------------------------------

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    wikilink(state, node) {
      state.write(`[[${node.attrs.target as string}]]`);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strikethrough: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
  },
);

// ---------------------------------------------------------------------------
// Public parse / serialize helpers
// ---------------------------------------------------------------------------

export function parseMarkdown(text: string) {
  return parser.parse(text);
}

export function serializeMarkdown(doc: ReturnType<typeof parseMarkdown>): string {
  return serializer.serialize(doc);
}

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

function markInputRule(regexp: RegExp, markType: MarkType): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const content = match[1];
    if (!content) return null;
    const tr = state.tr;
    tr.replaceWith(start, end, editorSchema.text(content, [markType.create()]));
    tr.removeStoredMark(markType);
    return tr;
  });
}

const wikilinkInputRule = new InputRule(
  /\[\[([^\][\n]+)\]\]$/,
  (state, match, start, end) => {
    const node = editorSchema.nodes.wikilink.create({ target: match[1] });
    return state.tr.replaceWith(start, end, node);
  },
);

function buildInputRules() {
  const { nodes, marks } = editorSchema;
  return inputRules({
    rules: [
      // Headings: # / ## / ### + space at start of empty block
      textblockTypeInputRule(
        /^(#{1,3})\s$/,
        nodes.heading,
        ([, hashes]) => ({ level: hashes.length }),
      ),
      // Blockquote: "> "
      wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
      // Bullet list: "- " / "* " / "+ "
      wrappingInputRule(/^\s*[-*+]\s$/, nodes.bullet_list),
      // Ordered list: "1. "
      wrappingInputRule(/^\s*\d+\.\s$/, nodes.ordered_list),
      // Horizontal rule: "--- "
      new InputRule(/^---\s$/, (state, _match, start, end) => {
        const tr = state.tr.replaceWith(start, end, nodes.horizontal_rule.create());
        if (!tr.doc.resolve(start + 1).nodeAfter) {
          tr.insert(start + 1, nodes.paragraph.create());
        }
        return tr;
      }),
      // Bold: **text**
      markInputRule(/\*\*([^*]+)\*\*$/, marks.strong),
      // Italic: *text* (not preceded/followed by *)
      markInputRule(/(?<!\*)\*([^*\s][^*]*)\*(?!\*)$/, marks.em),
      // Inline code: `text`
      markInputRule(/`([^`]+)`$/, marks.code),
      // Strikethrough: ~~text~~
      markInputRule(/~~([^~]+)~~$/, marks.strikethrough),
      // Wikilinks: [[target]]
      wikilinkInputRule,
    ],
  });
}

// ---------------------------------------------------------------------------
// Editor factory
// ---------------------------------------------------------------------------

export function makeEditorView(
  container: HTMLElement,
  content: string,
  editable: boolean,
  onChange?: (markdown: string) => void,
  onWikiLinkClick?: (target: string) => void,
): EditorView {
  const doc = parseMarkdown(content);
  const state = EditorState.create({
    doc,
    plugins: [
      history(),
      keymap({ "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
      keymap(baseKeymap),
      buildInputRules(),
    ],
  });

  let view!: EditorView;
  view = new EditorView(container, {
    state,
    editable: () => editable,
    attributes: { spellcheck: nativeSpellCheck ? "true" : "false" },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged && onChange) {
        onChange(serializer.serialize(next.doc));
      }
    },
    handleClickOn(_view, _pos, node, _nodePos, _event, direct) {
      if (direct && node.type === editorSchema.nodes.wikilink && onWikiLinkClick) {
        onWikiLinkClick(node.attrs.target as string);
        return true;
      }
      return false;
    },
  });

  return view;
}
