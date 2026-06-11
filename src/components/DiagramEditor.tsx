import mermaid from "mermaid";
import { createEffect, createSignal, Show, type Component } from "solid-js";

interface Props {
  fileKey: string;
  content: string;
  lightTheme?: boolean;
  onWikiLinkClick?: (filename: string) => void;
  wikiTitleMap?: Map<string, string>;
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

/**
 * After rendering, find any node whose visible label matches a wiki page title
 * and attach a click handler to navigate to that page.
 *
 * Flowchart nodes render as <div class="nodeLabel"> inside <foreignObject>.
 * Mindmap nodes render as SVG <text> elements.
 */
function injectBacklinkHandlers(
  container: HTMLDivElement,
  wikiTitleMap: Map<string, string>,
  onClick: (file: string) => void,
) {
  const normalized = new Map(
    Array.from(wikiTitleMap).map(([title, file]) => [
      title.toLowerCase(),
      file,
    ]),
  );

  // Flowchart: labels live in foreignObject > .nodeLabel divs
  for (const el of container.querySelectorAll(".nodeLabel")) {
    const text = (el.textContent ?? "").trim();
    const file = normalized.get(text.toLowerCase());
    if (file) {
      (el as HTMLElement).style.cursor = "pointer";
      el.addEventListener("click", () => onClick(file));
    }
  }

  // Mindmap: labels live in SVG <text> elements
  for (const textEl of container.querySelectorAll("text")) {
    const text = (textEl.textContent ?? "").trim();
    const file = normalized.get(text.toLowerCase());
    if (file) {
      const target = textEl.closest(".mindmap-node") ?? textEl.parentElement;
      if (target) {
        (target as HTMLElement).style.cursor = "pointer";
        target.addEventListener("click", () => onClick(file));
      }
    }
  }
}

const DiagramEditor: Component<Props> = (props) => {
  let containerRef!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);
  const [empty, setEmpty] = createSignal(false);

  // eslint-disable-next-line solid/reactivity
  if (!initialized) initMermaid(props.lightTheme ?? false);

  createEffect(() => {
    const content = props.content;
    void props.fileKey;

    void (async () => {
      if (!containerRef) return;

      const renderSource = content
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("%%"))
        .join("\n")
        .trim();

      const bodyLines = renderSource
        .split("\n")
        .slice(1)
        .filter((l) => l.trim());
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

        if (
          props.onWikiLinkClick &&
          props.wikiTitleMap &&
          props.wikiTitleMap.size > 0
        ) {
          injectBacklinkHandlers(
            containerRef,
            props.wikiTitleMap,
            props.onWikiLinkClick,
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid diagram syntax");
      }
    })();
  });

  return (
    <div class="diagram-editor">
      <Show when={empty()}>
        <div class="diagram-empty">
          Edit the diagram source (⌘E) to add content.
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
