import mermaid from "mermaid";
import { createEffect, createSignal, Show, type Component } from "solid-js";

interface Props {
  fileKey: string;
  content: string;
  lightTheme?: boolean;
}

let initialized = false;

function initMermaid(light: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: light ? "default" : "dark",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });
  initialized = true;
}

const DiagramEditor: Component<Props> = (props) => {
  let containerRef!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);
  const [empty, setEmpty] = createSignal(false);

  if (!initialized) initMermaid(props.lightTheme ?? false);

  createEffect(async () => {
    const content = props.content;
    props.fileKey; // track — re-render when file changes

    if (!containerRef) return;

    // Strip the booksaga comment header for rendering
    const source = content.replace(/^%%[^\n]*\n/gm, "").trim();
    if (!source || source === "flowchart TD" || source === "flowchart LR") {
      containerRef.innerHTML = "";
      setEmpty(true);
      setError(null);
      return;
    }
    setEmpty(false);

    try {
      const id = "mmd" + Math.random().toString(36).slice(2, 9);
      const { svg } = await mermaid.render(id, source);
      containerRef.innerHTML = svg;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid diagram syntax");
    }
  });

  return (
    <div class="diagram-editor">
      <Show when={empty()}>
        <div class="diagram-empty">
          Use Insert → Node to add your first node.
        </div>
      </Show>
      <div class="diagram-canvas" ref={containerRef} />
      <Show when={error()}>
        <div class="diagram-error">{error()}</div>
      </Show>
    </div>
  );
};

export default DiagramEditor;
