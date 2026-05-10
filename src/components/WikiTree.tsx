import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from "solid-js";

interface TreeDir {
  kind: "dir";
  name: string;
  path: string;
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
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      let dir = nodes.find((n): n is TreeDir => n.kind === "dir" && n.name === parts[i]);
      if (!dir) {
        dir = { kind: "dir", name: parts[i], path: currentPath, children: [] };
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
  onContextMenu: (e: MouseEvent, parentDir: string) => void;
}

const TreeNodeItem: Component<TreeNodeItemProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  const parentDir = () =>
    props.node.kind === "dir"
      ? (props.node as TreeDir).path
      : (props.node as TreeFile).path.split("/").slice(0, -1).join("/");

  return (
    <>
      <Show when={props.node.kind === "dir"}>
        <li
          class="file-item toc-item wiki-dir"
          style={{ "padding-left": `${12 + props.depth * 16}px` }}
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) => props.onContextMenu(e, (props.node as TreeDir).path)}
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
                onContextMenu={props.onContextMenu}
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
          onContextMenu={(e) => props.onContextMenu(e, parentDir())}
        >
          <span class="toc-expand-cell" />
          <span class="toc-label">{displayName((props.node as TreeFile).name)}</span>
        </li>
      </Show>
    </>
  );
};

interface CtxMenu {
  x: number;
  y: number;
  dir: string;
}

interface Props {
  files: string[];
  activeFilename?: string | null;
  onSelect: (path: string) => void;
  onNew?: (parentDir: string) => void;
}

const WikiTree: Component<Props> = (props) => {
  const tree = () => buildTree(props.files);
  const [ctxMenu, setCtxMenu] = createSignal<CtxMenu | null>(null);

  createEffect(() => {
    if (!ctxMenu()) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close, { once: true });
    onCleanup(() => document.removeEventListener("click", close));
  });

  function handleContextMenu(e: MouseEvent, dir: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, dir });
  }

  function handleNew() {
    const m = ctxMenu();
    setCtxMenu(null);
    if (m) props.onNew?.(m.dir);
  }

  return (
    <>
      <ul
        class="file-list"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) handleContextMenu(e, "");
        }}
      >
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
              onContextMenu={handleContextMenu}
            />
          )}
        </For>
      </ul>

      <Show when={ctxMenu()}>
        <div
          class="ctx-menu"
          style={{ left: `${ctxMenu()!.x}px`, top: `${ctxMenu()!.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button class="ctx-menu-item" onClick={handleNew}>
            New here
          </button>
        </div>
      </Show>
    </>
  );
};

export default WikiTree;
