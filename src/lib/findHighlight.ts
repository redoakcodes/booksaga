import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export { Decoration, DecorationSet };

export const findHighlightKey = new PluginKey<DecorationSet>("findHighlight");

export const findHighlightPlugin = new Plugin<DecorationSet>({
  key: findHighlightKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, deco) {
      deco = deco.map(tr.mapping, tr.doc);
      const meta = tr.getMeta(findHighlightKey);
      if (meta === "clear") return DecorationSet.empty;
      if (meta) return meta as DecorationSet;
      return deco;
    },
  },
  props: {
    decorations(state) {
      return findHighlightKey.getState(state);
    },
  },
});
