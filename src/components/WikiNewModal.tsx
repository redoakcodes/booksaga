import { createMemo, createSignal, For, Show, type Component } from "solid-js";

type EntryType = "file" | "folder";

interface DirNode {
  name: string;
  path: string;
  children: DirNode[];
}

function buildDirTree(dirs: string[]): DirNode[] {
  const root: DirNode[] = [];
  for (const path of [...dirs].sort()) {
    const parts = path.split("/");
    let nodes = root;
    for (let i = 0; i < parts.length; i++) {
      const partPath = parts.slice(0, i + 1).join("/");
      let node = nodes.find((n) => n.path === partPath);
      if (!node) {
        node = { name: parts[i], path: partPath, children: [] };
        nodes.push(node);
      }
      nodes = node.children;
    }
  }
  return root;
}

const DirItem: Component<{
  node: DirNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  return (
    <>
      <div
        class={`new-modal-dir-item${props.selected === props.node.path ? " selected" : ""}`}
        style={{ "padding-left": `${4 + props.depth * 16}px` }}
        onClick={() => props.onSelect(props.node.path)}
      >
        <Show
          when={props.node.children.length > 0}
          fallback={<span class="new-modal-dir-expand-placeholder" />}
        >
          <button
            class="new-modal-dir-expand"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            {expanded() ? "▾" : "▸"}
          </button>
        </Show>
        <span>{props.node.name}</span>
      </div>
      <Show when={expanded()}>
        <For each={props.node.children}>
          {(child) => (
            <DirItem
              node={child}
              depth={props.depth + 1}
              selected={props.selected}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </Show>
    </>
  );
};

export interface WikiNewModalProps {
  wikiDirs: string[];
  initialDir?: string;
  onConfirm: (type: EntryType, name: string, parentDir: string) => void;
  onCancel: () => void;
}

const WikiNewModal: Component<WikiNewModalProps> = (props) => {
  const [entryType, setEntryType] = createSignal<EntryType>("file");
  const [name, setName] = createSignal("");
  const [selectedDir, setSelectedDir] = createSignal(props.initialDir ?? "");

  const dirTree = createMemo(() => buildDirTree(props.wikiDirs));

  function handleSubmit(e: Event) {
    e.preventDefault();
    const n = name().trim();
    if (!n) return;
    props.onConfirm(entryType(), n, selectedDir());
  }

  return (
    <div class="modal-overlay" onClick={props.onCancel}>
      <div class="modal-box new-wiki-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">New Wiki Entry</h2>
        <form onSubmit={handleSubmit}>

          <div class="new-modal-type-toggle">
            <button
              type="button"
              class={`new-modal-type-btn${entryType() === "file" ? " active" : ""}`}
              onClick={() => setEntryType("file")}
            >
              File
            </button>
            <button
              type="button"
              class={`new-modal-type-btn${entryType() === "folder" ? " active" : ""}`}
              onClick={() => setEntryType("folder")}
            >
              Folder
            </button>
          </div>

          <div class="new-modal-field">
            <label class="new-modal-label">Name</label>
            <input
              class="new-modal-input"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder={entryType() === "file" ? "Page title" : "Folder name"}
              autofocus
            />
          </div>

          <div class="new-modal-field">
            <label class="new-modal-label">Location</label>
            <div class="new-modal-dir-tree">
              <div
                class={`new-modal-dir-item${selectedDir() === "" ? " selected" : ""}`}
                style={{ "padding-left": "4px" }}
                onClick={() => setSelectedDir("")}
              >
                <span class="new-modal-dir-expand-placeholder" />
                <span>(root)</span>
              </div>
              <For each={dirTree()}>
                {(node) => (
                  <DirItem
                    node={node}
                    depth={1}
                    selected={selectedDir()}
                    onSelect={setSelectedDir}
                  />
                )}
              </For>
            </div>
          </div>

          <Show when={entryType() === "folder"}>
            <p class="new-modal-note">
              The folder will appear in the sidebar once it contains files.
            </p>
          </Show>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" onClick={props.onCancel}>
              Cancel
            </button>
            <button type="submit" class="btn-primary" disabled={!name().trim()}>
              Create
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default WikiNewModal;
