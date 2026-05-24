import mermaid from "mermaid";
import { createEffect, createSignal, Show, type Component } from "solid-js";
import { parseDiagramLinks } from "../lib/flowchart";
import { parseMindmapLinks } from "../lib/mindmap";

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

function injectFlowchartHandlers(
  container: HTMLDivElement,
  links: Map<string, string>,
  onClick: (file: string) => void,
) {
  for (const [nodeId, wikiFile] of links) {
    // Mermaid prefixes SVG element IDs with the diagram ID, so use *=
    const el = container.querySelector(`[id*="flowchart-${nodeId}-"]`);
    if (el) {
      (el as HTMLElement).style.cursor = "pointer";
      el.addEventListener("click", () => onClick(wikiFile));
    }
  }
}

function injectMindmapHandlers(
  container: HTMLDivElement,
  links: Map<string, string>,
  onClick: (file: string) => void,
) {
  for (const [label, wikiFile] of links) {
    // Try Mermaid's .mindmap-node class first, fall back to text-content search.
    let target: Element | null = null;

    for (const group of container.querySelectorAll(".mindmap-node")) {
      if (group.querySelector("text")?.textContent?.trim() === label) {
        target = group;
        break;
      }
    }

    if (!target) {
      const textEls = Array.from(container.querySelectorAll("text"));
      const textEl = textEls.find((el) => el.textContent?.trim() === label);
      if (textEl) {
        let el: Element | null = textEl.parentElement;
        while (el && el !== container) {
          if (
            el.tagName.toLowerCase() === "g" &&
            el.querySelector("circle, rect, path, ellipse, polygon")
          ) {
            target = el;
            break;
          }
          el = el.parentElement;
        }
      }
    }

    if (target) {
      (target as HTMLElement).style.cursor = "pointer";
      target.addEventListener("click", () => onClick(wikiFile));
    }
  }
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

      if (props.onWikiLinkClick) {
        const isMindmap = content.startsWith("%% booksaga: mindmap");
        if (isMindmap) {
          injectMindmapHandlers(containerRef, parseMindmapLinks(content), props.onWikiLinkClick);
        } else {
          injectFlowchartHandlers(containerRef, parseDiagramLinks(content), props.onWikiLinkClick);
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
