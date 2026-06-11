import { createSignal, For, Show, type Component } from "solid-js";
import { backlinks } from "../lib/wikiIndex";
import type { WikiIndex } from "../lib/wikiIndex";

interface Props {
  filename: string | null;
  wikiIndex: WikiIndex;
  wikiFiles: string[];
  onSelect: (path: string) => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

const BacklinksPanel: Component<Props> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false);

  const stem = () => {
    const f = props.filename;
    return f ? f.split("/").pop()!.replace(/\.md$/, "") : null;
  };

  const links = () => {
    const s = stem();
    return s ? backlinks(props.wikiIndex, s) : [];
  };

  function findFile(pageName: string): string | null {
    return (
      props.wikiFiles.find((f) => {
        const s = f.split("/").pop()!.replace(/\.md$/, "");
        return normalize(s) === pageName;
      }) ?? null
    );
  }

  return (
    <aside class="backlinks-panel" classList={{ collapsed: collapsed() }}>
      <div class="backlinks-inner">
        <div class="backlinks-header">Backlinks</div>
        <Show
          when={links().length > 0}
          fallback={<div class="backlinks-empty">No backlinks</div>}
        >
          <ul class="backlinks-list">
            <For each={links()}>
              {(pageName) => {
                const file = findFile(pageName);
                return (
                  <li
                    class={`backlinks-item${file ? "" : " backlinks-missing"}`}
                    onClick={() => {
                      if (file) props.onSelect(file);
                    }}
                  >
                    {pageName.replace(/-/g, " ")}
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>
      <button
        class="backlinks-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed() ? "Expand backlinks" : "Collapse backlinks"}
      >
        {collapsed() ? "‹" : "›"}
      </button>
    </aside>
  );
};

export default BacklinksPanel;
