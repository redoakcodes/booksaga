import { createMemo, createSignal, For, Show, type Component } from "solid-js";

type TopType = "file" | "folder" | "diagram";
type DiagramSubtype = "diagram" | "mindmap" | "timeline";
type EntryType = "file" | "folder" | "diagram" | "mindmap" | "timeline";

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

export type { EntryType };

const WikiNewModal: Component<WikiNewModalProps> = (props) => {
  const [topType, setTopType] = createSignal<TopType>("file");
  const [diagramSubtype, setDiagramSubtype] = createSignal<DiagramSubtype>("diagram");
  const [name, setName] = createSignal("");
  const [selectedDir, setSelectedDir] = createSignal(props.initialDir ?? "");

  const dirTree = createMemo(() => buildDirTree(props.wikiDirs));

  const effectiveType = (): EntryType =>
    topType() === "diagram" ? diagramSubtype() : topType();

  const placeholder = () => {
    if (topType() === "file") return "Page title";
    if (topType() === "folder") return "Folder name";
    if (diagramSubtype() === "mindmap") return "Mind map name";
    if (diagramSubtype() === "timeline") return "Timeline name";
    return "Flowchart name";
  };

  function handleSubmit(e: Event) {
    e.preventDefault();
    const n = name().trim();
    if (!n) return;
    props.onConfirm(effectiveType(), n, selectedDir());
  }

  return (
    <div class="modal-overlay" onClick={props.onCancel}>
      <div class="modal-box new-wiki-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">New Wiki Entry</h2>
        <form onSubmit={handleSubmit}>

          <div class="new-modal-type-toggle">
            <button
              type="button"
              class={`new-modal-type-btn${topType() === "file" ? " active" : ""}`}
              onClick={() => setTopType("file")}
            >
              File
            </button>
            <button
              type="button"
              class={`new-modal-type-btn${topType() === "folder" ? " active" : ""}`}
              onClick={() => setTopType("folder")}
            >
              Folder
            </button>
            <button
              type="button"
              class={`new-modal-type-btn${topType() === "diagram" ? " active" : ""}`}
              onClick={() => setTopType("diagram")}
            >
              Diagram
            </button>
          </div>

          <Show when={topType() === "diagram"}>
            <div class="new-modal-type-toggle new-modal-subtype-toggle">
              <button
                type="button"
                class={`new-modal-type-btn${diagramSubtype() === "diagram" ? " active" : ""}`}
                onClick={() => setDiagramSubtype("diagram")}
              >
                Flowchart
              </button>
              <button
                type="button"
                class={`new-modal-type-btn${diagramSubtype() === "mindmap" ? " active" : ""}`}
                onClick={() => setDiagramSubtype("mindmap")}
              >
                Mind Map
              </button>
              <button
                type="button"
                class={`new-modal-type-btn${diagramSubtype() === "timeline" ? " active" : ""}`}
                onClick={() => setDiagramSubtype("timeline")}
              >
                Timeline
              </button>
            </div>
          </Show>

          <div class="new-modal-field">
            <label class="new-modal-label">Name</label>
            <input
              class="new-modal-input"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder={placeholder()}
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
