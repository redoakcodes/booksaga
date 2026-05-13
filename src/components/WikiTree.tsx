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

function buildTree(files: string[], dirs: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  function ensureDir(nodes: TreeNode[], parts: string[], upTo: number): TreeNode[] {
    let current = nodes;
    let currentPath = "";
    for (let i = 0; i < upTo; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      let dir = current.find((n): n is TreeDir => n.kind === "dir" && n.name === parts[i]);
      if (!dir) {
        dir = { kind: "dir", name: parts[i], path: currentPath, children: [] };
        current.push(dir);
      }
      current = dir.children;
    }
    return current;
  }

  for (const dir of [...dirs].sort()) {
    const parts = dir.split("/");
    ensureDir(root, parts, parts.length);
  }

  for (const path of files) {
    const parts = path.split("/");
    const siblings = ensureDir(root, parts, parts.length - 1);
    siblings.push({ kind: "file", name: parts[parts.length - 1], path });
  }

  return root;
}

function displayName(name: string): string {
  return name.replace(/\.md$/, "").replace(/\.mmd$/, "").replace(/[-_]/g, " ");
}

const WikiIcon = () => (
  <svg class="wiki-file-icon" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="1" width="8" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <line x1="4" y1="5" x2="8" y2="5" stroke="currentColor" stroke-width="1"/>
    <line x1="4" y1="7.5" x2="8" y2="7.5" stroke="currentColor" stroke-width="1"/>
    <line x1="4" y1="10" x2="6.5" y2="10" stroke="currentColor" stroke-width="1"/>
  </svg>
);

const DiagramIcon = () => (
  <svg class="wiki-file-icon" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="3" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="11" cy="3.5" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="11" cy="10.5" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <line x1="5" y1="6.2" x2="9" y2="4.3" stroke="currentColor" stroke-width="1"/>
    <line x1="5" y1="7.8" x2="9" y2="9.7" stroke="currentColor" stroke-width="1"/>
  </svg>
);

const FolderIcon = () => (
  <svg class="wiki-file-icon wiki-folder-icon" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1 4.5 Q1 3.5 2 3.5 L5 3.5 L6.2 4.8 L12 4.8 Q13 4.8 13 5.8 L13 11 Q13 12 12 12 L2 12 Q1 12 1 11 Z" fill="none" stroke="currentColor" stroke-width="1.2"/>
  </svg>
);

interface CtxMenu {
  x: number;
  y: number;
  newDir: string;
  targetPath: string;
  targetKind: "file" | "dir" | null;
}

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  activeFilename?: string | null;
  onSelect: (path: string) => void;
  onContextMenu: (e: MouseEvent, newDir: string, targetPath: string, targetKind: "file" | "dir") => void;
}

const TreeNodeItem: Component<TreeNodeItemProps> = (props) => {
  const [expanded, setExpanded] = createSignal(true);

  const fileParentDir = () =>
    (props.node as TreeFile).path.split("/").slice(0, -1).join("/");

  return (
    <>
      <Show when={props.node.kind === "dir"}>
        <li
          class="file-item toc-item wiki-dir"
          style={{ "padding-left": `${12 + props.depth * 16}px` }}
          onClick={() => setExpanded((v) => !v)}
          onContextMenu={(e) =>
            props.onContextMenu(e, (props.node as TreeDir).path, (props.node as TreeDir).path, "dir")
          }
        >
          <span class="toc-expand-cell">
            <button
              class="toc-expand-btn"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              {expanded() ? "▾" : "▸"}
            </button>
          </span>
          <FolderIcon />
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
          onContextMenu={(e) =>
            props.onContextMenu(e, fileParentDir(), (props.node as TreeFile).path, "file")
          }
        >
          <span class="toc-expand-cell" />
          {(props.node as TreeFile).name.endsWith(".mmd") ? <DiagramIcon /> : <WikiIcon />}
          <span class="toc-label">{displayName((props.node as TreeFile).name)}</span>
        </li>
      </Show>
    </>
  );
};

interface Props {
  files: string[];
  diagramFiles?: string[];
  dirs: string[];
  activeFilename?: string | null;
  onSelect: (path: string) => void;
  onNew?: (parentDir: string) => void;
  onDelete?: (path: string, kind: "file" | "dir") => void;
}

const WikiTree: Component<Props> = (props) => {
  const tree = () => buildTree([...props.files, ...(props.diagramFiles ?? [])], props.dirs);
  const [ctxMenu, setCtxMenu] = createSignal<CtxMenu | null>(null);

  createEffect(() => {
    if (!ctxMenu()) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close, { once: true });
    onCleanup(() => document.removeEventListener("click", close));
  });

  function handleContextMenu(
    e: MouseEvent,
    newDir: string,
    targetPath: string,
    targetKind: "file" | "dir",
  ) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, newDir, targetPath, targetKind });
  }

  function handleNew() {
    const m = ctxMenu();
    setCtxMenu(null);
    if (m) props.onNew?.(m.newDir);
  }

  function handleDelete() {
    const m = ctxMenu();
    setCtxMenu(null);
    if (m && m.targetPath) props.onDelete?.(m.targetPath, m.targetKind!);
  }

  return (
    <>
      <ul
        class="file-list"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget)
            setCtxMenu({ x: e.clientX, y: e.clientY, newDir: "", targetPath: "", targetKind: null });
        }}
      >
        <Show when={props.files.length === 0 && props.dirs.length === 0}>
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
          <button class="ctx-menu-item" onClick={handleNew}>New</button>
          <Show when={ctxMenu()!.targetPath !== ""}>
            <div class="ctx-menu-divider" />
            <button class="ctx-menu-item" onClick={handleDelete}>
              Delete
            </button>
          </Show>
        </div>
      </Show>
    </>
  );
};

export default WikiTree;
