import { createSignal, For, Show, type Component } from "solid-js";
import { store } from "../store";
import type { Section } from "../store";
import TocList from "./TocList";
import WikiTree from "./WikiTree";

interface Props {
  onFileSelect: (section: Section, filename: string) => void;
  onNewChapter: (title: string) => void;
  onReorderChapters: (from: number, to: number) => void;
  onPlaceholderClick: (label: string) => void;
  pendingCreateLabel?: string | null;
  onNewWikiEntry?: (parentDir: string) => void;
  onDeleteWikiEntry?: (path: string, kind: "file" | "dir") => void;
}

const TABS: { id: Section; label: string }[] = [
  { id: "manuscript", label: "Manuscript" },
  { id: "wiki", label: "Wiki" },
  { id: "exercises", label: "Exercises" },
];

const Sidebar: Component<Props> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false);
  const project = () => store.project();

  const displayName = (filename: string) =>
    filename.split("/").pop()!.replace(/\.md$/, "").replace(/[-_]/g, " ");

  const isActive = (filename: string) =>
    store.openFile()?.section === store.activeSection() &&
    store.openFile()?.filename === filename;

  return (
    <aside class="sidebar" classList={{ collapsed: collapsed() }}>
      <div class="sidebar-inner">
        <div class="sidebar-header">
          <Show when={project()}>
            <span class="project-title">{project()!.config.project.title}</span>
          </Show>
        </div>

        <div class="sidebar-tabs">
          <For each={TABS}>
            {(tab) => (
              <button
                class={`tab-btn ${store.activeSection() === tab.id ? "active" : ""}`}
                onClick={() => store.setActiveSection(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>

        <Show when={store.activeSection() === "manuscript"}>
          <TocList
            nodes={project()?.toc.tocNodes ?? []}
            activeFilename={store.openFile()?.section === "manuscript" ? store.openFile()?.filename : null}
            pendingCreateLabel={props.pendingCreateLabel}
            onSelect={(filename) => props.onFileSelect("manuscript", filename)}
            onPlaceholderClick={props.onPlaceholderClick}
            onReorder={props.onReorderChapters}
            onNewChapter={props.onNewChapter}
          />
        </Show>

        <Show when={store.activeSection() === "wiki"}>
          <WikiTree
            files={project()?.wikiFiles ?? []}
            diagramFiles={project()?.diagramFiles ?? []}
            dirs={project()?.wikiDirs ?? []}
            activeFilename={store.openFile()?.section === "wiki" ? store.openFile()?.filename : null}
            onSelect={(path) => props.onFileSelect("wiki", path)}
            onNew={props.onNewWikiEntry}
            onDelete={props.onDeleteWikiEntry}
          />
        </Show>

        <Show when={store.activeSection() === "exercises"}>
          <ul class="file-list">
            <For each={project()?.exerciseFiles ?? []} fallback={<li class="file-empty">No files</li>}>
              {(filename) => (
                <li
                  class={`file-item ${isActive(filename) ? "active" : ""}`}
                  onClick={() => props.onFileSelect("exercises", filename)}
                >
                  {displayName(filename)}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <button
        class="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed() ? "›" : "‹"}
      </button>
    </aside>
  );
};

export default Sidebar;
