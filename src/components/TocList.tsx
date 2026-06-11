import { createSignal, For, Show, type Component } from "solid-js";
import type { TocNode } from "../lib/toc";

interface Props {
  nodes: readonly TocNode[];
  activeFilename?: string | null;
  pendingCreateLabel?: string | null;
  onSelect: (filename: string) => void;
  onPlaceholderClick: (label: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onNewChapter: (title: string) => void;
}

interface NodeItemProps {
  node: TocNode;
  index: number;
  total: number;
  depth: number;
  activeFilename?: string | null;
  pendingCreateLabel?: string | null;
  onSelect: (filename: string) => void;
  onPlaceholderClick: (label: string) => void;
  onRootReorder?: (from: number, to: number) => void;
}

const NodeItem: Component<NodeItemProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const hasChildren = () => props.node.children.length > 0;
  const filename = () => props.node.path?.split("#")[0] ?? null;
  const isPlaceholder = () => !filename();
  const isActive = () =>
    (!!filename() && props.activeFilename === filename()) ||
    (isPlaceholder() && props.pendingCreateLabel === props.node.label);

  function displayLabel(): string {
    const { label, path } = props.node;
    if (label === path) return label.replace(/\.md$/, "").replace(/[-_]/g, " ");
    return label;
  }

  function handleClick() {
    const f = filename();
    if (f) props.onSelect(f);
    else props.onPlaceholderClick(props.node.label);
  }

  return (
    <>
      <li
        class={`file-item toc-item${isActive() ? " active" : ""}${isPlaceholder() ? " toc-placeholder" : ""}`}
        style={{ "padding-left": `${12 + props.depth * 16}px` }}
        onClick={handleClick}
      >
        <span class="toc-expand-cell">
          <Show when={hasChildren()}>
            <button
              class="toc-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded() ? "▾" : "▸"}
            </button>
          </Show>
        </span>
        <span class="toc-label">{displayLabel()}</span>
        <Show when={props.depth === 0 && props.onRootReorder}>
          <span class="toc-controls" onClick={(e) => e.stopPropagation()}>
            <button
              class="toc-move-btn"
              disabled={props.index === 0}
              title="Move up"
              onClick={() => props.onRootReorder!(props.index, props.index - 1)}
            >
              ▲
            </button>
            <button
              class="toc-move-btn"
              disabled={props.index === props.total - 1}
              title="Move down"
              onClick={() => props.onRootReorder!(props.index, props.index + 1)}
            >
              ▼
            </button>
          </span>
        </Show>
      </li>
      <Show when={hasChildren() && expanded()}>
        <For each={props.node.children}>
          {(child, i) => (
            <NodeItem
              node={child}
              index={i()}
              total={props.node.children.length}
              depth={props.depth + 1}
              activeFilename={props.activeFilename}
              pendingCreateLabel={props.pendingCreateLabel}
              onSelect={props.onSelect}
              onPlaceholderClick={props.onPlaceholderClick}
            />
          )}
        </For>
      </Show>
    </>
  );
};

const TocList: Component<Props> = (props) => {
  const [adding, setAdding] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal("");

  const rootNodes = () => props.nodes;

  function startAdding() {
    setNewTitle("");
    setAdding(true);
  }
  function cancelAdding() {
    setAdding(false);
    setNewTitle("");
  }
  function commitNew() {
    const title = newTitle().trim();
    if (!title) {
      cancelAdding();
      return;
    }
    props.onNewChapter(title);
    cancelAdding();
  }

  return (
    <div class="toc-list">
      <div class="toc-toolbar">
        <button class="toc-add-btn" onClick={startAdding}>
          + Chapter
        </button>
      </div>

      <Show when={adding()}>
        <div class="toc-new-row">
          <input
            class="input-text toc-new-input"
            type="text"
            placeholder="Chapter title…"
            value={newTitle()}
            autofocus
            onInput={(e) => setNewTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNew();
              if (e.key === "Escape") cancelAdding();
            }}
          />
        </div>
      </Show>

      <ul class="file-list">
        <Show when={rootNodes().length === 0}>
          <li class="file-empty">No chapters — add one above</li>
        </Show>
        <For each={rootNodes()}>
          {(node, i) => (
            <NodeItem
              node={node}
              index={i()}
              total={rootNodes().length}
              depth={0}
              activeFilename={props.activeFilename}
              pendingCreateLabel={props.pendingCreateLabel}
              onSelect={props.onSelect}
              onPlaceholderClick={props.onPlaceholderClick}
              onRootReorder={props.onReorder}
            />
          )}
        </For>
      </ul>
    </div>
  );
};

export default TocList;
