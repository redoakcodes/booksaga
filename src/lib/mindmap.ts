export interface MindmapNode {
  label: string;
  indent: number;
  depth: number;
}

// Mermaid mindmap nodes: optionally prefixed with an id (alphanum/_), then a shape:
//   id((label))  circle      id(label)  rounded     id[label]  square
//   id{{label}}  hexagon     >label     bang        plain text
function stripShapeMarkers(raw: string): string {
  const ID = "[A-Za-z0-9_]*";
  let m: RegExpMatchArray | null;
  if ((m = raw.match(new RegExp(`^${ID}\\(\\((.+?)\\)\\)$`)))) return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\(([^)]+)\\)$`)))) return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\[([^\\]]+)\\]$`)))) return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\{\\{([^}]+)\\}\\}$`)))) return m[1].trim();
  if ((m = raw.match(/^>(.+)$/))) return m[1].trim();
  return raw.trim();
}

/** Extract all nodes from a Mermaid mindmap source (excluding the %% header and "mindmap" declaration). */
export function parseMindmapNodes(source: string): MindmapNode[] {
  const lines = source
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("%%"));

  const nodes: MindmapNode[] = [];
  let baseIndent = -1;

  for (const line of lines) {
    if (!line.trim() || line.trim() === "mindmap") continue;
    const indent = line.length - line.trimStart().length;
    if (baseIndent === -1) baseIndent = indent;
    const label = stripShapeMarkers(line.trimStart());
    const depth = (indent - baseIndent) / 2;
    nodes.push({ label, indent, depth });
  }

  return nodes;
}

/**
 * Append a new child node under the node whose label matches parentLabel.
 * The child is inserted after the last line of the parent's existing subtree.
 */
export function appendMindmapNode(
  source: string,
  parentLabel: string,
  childLabel: string,
): string {
  const lines = source.split("\n");

  let parentIdx = -1;
  let parentIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("%%")) continue;
    const indent = line.length - line.trimStart().length;
    const label = stripShapeMarkers(line.trimStart());
    if (label === parentLabel) {
      parentIdx = i;
      parentIndent = indent;
      break;
    }
  }

  if (parentIdx === -1) return source;

  // Walk past the parent's existing children (lines with greater indent)
  let insertAfter = parentIdx;
  for (let i = parentIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (indent > parentIndent) {
      insertAfter = i;
    } else {
      break;
    }
  }

  const childLine = " ".repeat(parentIndent + 2) + childLabel;
  lines.splice(insertAfter + 1, 0, childLine);
  return lines.join("\n");
}
