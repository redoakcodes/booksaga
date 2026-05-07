import { createSignal, For, Show, type Component } from "solid-js";

interface TreeDir {
  kind: "dir";
  name: string;
  children: TreeNode[];
}
interface TreeFile {
  kind: "file";
  name: string;
  path: string;
}
type TreeNode = TreeDir | TreeFile;

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    const parts = path.split("/");
    let nodes = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let dir = nodes.find((n): n is TreeDir => n.kind === "dir" && n.name === parts[i]);
      if (!dir) {
        dir = { kind: "dir", name: parts[i], children: [] };
        nodes.push(dir);
      }
      nodes = dir.children;
    }
    nodes.push({ kind: "file", name: parts[parts.length - 1], path });
  }
  return root;
}

function displayName(name: string): string {
  return name.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  activeFilename?: string | null;
  onSelect: (path: string) => void;
}

const TreeNodeItem: Component<TreeNodeItemProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <>
      <Show when={props.node.kind === "dir"}>
        <li
          class="file-item toc-item wiki-dir"
          style={{ "padding-left": `${12 + props.depth * 16}px` }}
          onClick={() => setExpanded((v) => !v)}
        >
          <span class="toc-expand-cell">
            <button
              class="toc-expand-btn"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              {expanded() ? "▾" : "▸"}
            </button>
          </span>
          <span class="toc-label wiki-dir-label">
            {(props.node as TreeDir).name}
          </span>
        </li>
        <Show when={expanded()}>
          <For each={(props.node as TreeDir).children}>
            {(child) => (
              <TreeNodeItem
                node={child}
                depth={props.depth + 1}
                activeFilename={props.activeFilename}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </Show>
      </Show>

      <Show when={props.node.kind === "file"}>
        <li
          class={`file-item toc-item${props.activeFilename === (props.node as TreeFile).path ? " active" : ""}`}
          style={{ "padding-left": `${12 + props.depth * 16}px` }}
          onClick={() => props.onSelect((props.node as TreeFile).path)}
        >
          <span class="toc-expand-cell" />
          <span class="toc-label">{displayName((props.node as TreeFile).name)}</span>
        </li>
      </Show>
    </>
  );
};

interface Props {
  files: string[];
  activeFilename?: string | null;
  onSelect: (path: string) => void;
}

const WikiTree: Component<Props> = (props) => {
  const tree = () => buildTree(props.files);

  return (
    <ul class="file-list">
      <Show when={props.files.length === 0}>
        <li class="file-empty">No files</li>
      </Show>
      <For each={tree()}>
        {(node) => (
          <TreeNodeItem
            node={node}
            depth={0}
            activeFilename={props.activeFilename}
            onSelect={props.onSelect}
          />
        )}
      </For>
    </ul>
  );
};

export default WikiTree;
