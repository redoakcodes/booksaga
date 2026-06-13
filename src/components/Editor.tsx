import {
  createEffect,
  createMemo,
  on,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import { type EditorView } from "prosemirror-view";
import { makeEditorView } from "../lib/prosemirror";
import { registerView } from "../lib/editorCommands";
import "prosemirror-view/style/prosemirror.css";

interface Props {
  fileKey: string;
  content: string;
  readonly?: boolean;
  onChange?: (markdown: string) => void;
  onWikiLinkClick?: (target: string) => void;
  onCitationClick?: (wikiPage: string) => void;
}

const Editor: Component<Props> = (props) => {
  let container!: HTMLDivElement;
  let view: EditorView | null = null;

  function create() {
    view = makeEditorView(
      container,
      props.content,
      !(props.readonly ?? false),
      props.onChange,
      props.onWikiLinkClick,
      props.onCitationClick,
    );
    registerView(view);
  }

  onMount(create);

  // createMemo absorbs same-string updates so the effect only fires when the
  // file identity actually changes, not on every content/dirty signal update.
  const stableKey = createMemo(() => props.fileKey || "");
  createEffect(
    on(
      stableKey,
      () => {
        view?.destroy();
        view = null;
        create();
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    view?.destroy();
    view = null;
    registerView(null);
  });

  return (
    <div
      ref={container}
      class="editor-container"
      onClick={() => view?.focus()}
    />
  );
};

export default Editor;
