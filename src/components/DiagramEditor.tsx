import mermaid from "mermaid";
import { createEffect, createSignal, Show, type Component } from "solid-js";
import { parseDiagramLinks } from "../lib/flowchart";

interface Props {
  fileKey: string;
  content: string;
  lightTheme?: boolean;
  onWikiLinkClick?: (filename: string) => void;
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

    // Strip all %% comment lines before handing to Mermaid
    const renderSource = content
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("%%"))
      .join("\n")
      .trim();

    const bodyLines = renderSource.split("\n").slice(1).filter((l) => l.trim());
    if (!renderSource || bodyLines.length === 0) {
      containerRef.innerHTML = "";
      setEmpty(true);
      setError(null);
      return;
    }
    setEmpty(false);

    try {
      const id = "mmd" + Math.random().toString(36).slice(2, 9);
      const { svg } = await mermaid.render(id, renderSource);
      containerRef.innerHTML = svg;
      setError(null);

      // Inject click handlers for nodes that have %% link annotations
      const links = parseDiagramLinks(content);
      for (const [nodeId, wikiFile] of links) {
        const el = containerRef.querySelector(`[id^="flowchart-${nodeId}-"]`);
        if (el) {
          (el as HTMLElement).style.cursor = "pointer";
          el.addEventListener("click", () => props.onWikiLinkClick?.(wikiFile));
        }
      }
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
