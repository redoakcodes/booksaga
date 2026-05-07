/** TOC parser/writer — mirrors booksaga's toc.py logic. */

const HEADING = "# Table of Contents";
const NESTED_LIST_RE = /^(\s*)\d+\.\s+(.+)$/;
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;
const HTML_COMMENT_RE = /<!--.*?-->/gs;

const ABBREVIATIONS: Record<string, string> = { chapter: "ch" };

export function titleToFilename(title: string): string {
  let result = title.toLowerCase();
  for (const [word, abbrev] of Object.entries(ABBREVIATIONS)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, "g"), abbrev);
  }
  result = result.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result + ".md";
}

export interface TocNode {
  label: string;
  path: string | null;
  children: TocNode[];
}

export interface TocEntry {
  label: string;
  filename: string | null;
}

function parseItem(text: string): { label: string; path: string | null } {
  text = text.trim();
  const m = LINK_RE.exec(text);
  if (m) return { label: m[1], path: m[2] };
  if (text.endsWith(".md")) return { label: text, path: text };
  return { label: text, path: null };
}

function parseLines(lines: string[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: Array<{ indent: number; children: TocNode[] }> = [{ indent: -1, children: root }];

  for (const line of lines) {
    const m = NESTED_LIST_RE.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const { label, path } = parseItem(m[2]);
    const node: TocNode = { label, path, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ indent, children: node.children });
  }
  return root;
}

function dfsFilenames(nodes: TocNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    const fname = node.path?.split("#")[0];
    if (fname) result.push(fname);
    result.push(...dfsFilenames(node.children));
  }
  return result;
}

function serializeNode(node: TocNode, indent: number): string {
  const item =
    node.path == null
      ? node.label
      : node.label === node.path
        ? node.path
        : `[${node.label}](${node.path})`;
  const lines = [" ".repeat(indent) + `1. ${item}`];
  for (const child of node.children) lines.push(serializeNode(child, indent + 3));
  return lines.join("\n");
}

export class TocParser {
  private nodes: TocNode[];

  constructor(tocText: string | null) {
    if (!tocText) {
      this.nodes = [];
      return;
    }
    const stripped = tocText.replace(HTML_COMMENT_RE, "");
    this.nodes = parseLines(stripped.split("\n"));
  }

  orderedChapters(allFiles: string[]): string[] {
    const listed = dfsFilenames(this.nodes).filter((f) => f !== "toc.md");
    const fileSet = new Set(allFiles.filter((f) => f !== "toc.md"));
    const seen = new Set<string>();
    const result: string[] = [];

    for (const fname of listed) {
      if (fileSet.has(fname) && !seen.has(fname)) {
        result.push(fname);
        seen.add(fname);
      }
    }
    for (const fname of [...fileSet].sort()) {
      if (!seen.has(fname)) result.push(fname);
    }
    return result;
  }

  /** Root-level TOC entries with their human-readable labels. */
  get rootChapters(): TocEntry[] {
    return this.nodes.map((node) => ({
      label: node.label,
      filename: node.path ? node.path.split("#")[0] : null,
    }));
  }

  /** Full TOC tree for recursive rendering. */
  get tocNodes(): readonly TocNode[] {
    return this.nodes;
  }

  serialize(): string {
    const lines = [HEADING, ""];
    for (const node of this.nodes) lines.push(serializeNode(node, 0));
    return lines.join("\n") + "\n";
  }

  addChapter(filename: string, label?: string): void {
    if (!dfsFilenames(this.nodes).includes(filename)) {
      this.nodes.push({ label: label ?? filename, path: filename, children: [] });
    }
  }

  /**
   * Find the first placeholder node (path === null) whose label matches and
   * set its path to filename, preserving its children. Returns true if found.
   */
  promoteNode(label: string, filename: string): boolean {
    function promote(nodes: TocNode[]): boolean {
      for (const node of nodes) {
        if (node.path === null && node.label === label) {
          node.path = filename;
          return true;
        }
        if (promote(node.children)) return true;
      }
      return false;
    }
    return promote(this.nodes);
  }

  /** Reorder root-level entries by filename, preserving labels and children. */
  reorder(filenames: string[]): void {
    const byFilename = new Map(
      this.nodes
        .filter((n) => n.path)
        .map((n) => [n.path!.split("#")[0], n]),
    );
    this.nodes = filenames.map(
      (f) => byFilename.get(f) ?? { label: f, path: f, children: [] },
    );
  }

  get filenames(): string[] {
    return dfsFilenames(this.nodes);
  }
}

export const TOC_TEMPLATE = `${HEADING}

<!-- Numbered list; indent sub-items 3 spaces per level. -->
<!-- Example: -->
<!-- 1. [Chapter One](chapter-one.md) -->
<!--    1. [Scene One](scene-one.md) -->
<!-- 2. [Chapter Two](chapter-two.md) -->
`;
