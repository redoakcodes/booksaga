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
  if ((m = raw.match(new RegExp(`^${ID}\\(\\((.+?)\\)\\)$`))))
    return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\(([^)]+)\\)$`)))) return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\[([^\\]]+)\\]$`)))) return m[1].trim();
  if ((m = raw.match(new RegExp(`^${ID}\\{\\{([^}]+)\\}\\}$`))))
    return m[1].trim();
  if ((m = raw.match(/^>(.+)$/))) return m[1].trim();
  return raw.trim();
}

/** Extract all nodes from a Mermaid mindmap source (excluding %% header and "mindmap" declaration). */
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
