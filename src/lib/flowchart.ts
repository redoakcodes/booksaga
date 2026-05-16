export interface FlowNode {
  id: string;
  label: string;
}

const SKIP_IDS = new Set(["flowchart", "graph", "subgraph", "end", "TD", "LR", "RL", "BT", "TB"]);

/** Extract explicitly-defined nodes from a Mermaid flowchart source. */
export function parseFlowNodes(source: string): FlowNode[] {
  const nodes: FlowNode[] = [];
  const seen = new Set<string>();

  // Matches: id[label]  id(label)  id{label}  id((label))  id[(label)]
  const re =
    /^[ \t]*([A-Za-z0-9_]+)\s*(?:\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\}|\(\(([^)]*)\)\)|\[\(([^)]*)\)\])/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const id = m[1];
    if (seen.has(id) || SKIP_IDS.has(id)) continue;
    const label = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? id).trim();
    seen.add(id);
    nodes.push({ id, label });
  }

  return nodes;
}

/** Generate the next available node ID (n1, n2, …). */
export function nextNodeId(source: string): string {
  const existing = new Set(parseFlowNodes(source).map((n) => n.id));
  let i = 1;
  while (existing.has(`n${i}`)) i++;
  return `n${i}`;
}

export type NodeShape = "rectangle" | "rounded" | "diamond" | "cylinder" | "circle";
export type EdgeStyle = "solid" | "dotted" | "thick";

function formatNode(id: string, label: string, shape: NodeShape): string {
  switch (shape) {
    case "rounded":  return `${id}(${label})`;
    case "diamond":  return `${id}{${label}}`;
    case "cylinder": return `${id}[(${label})]`;
    case "circle":   return `${id}((${label}))`;
    default:         return `${id}[${label}]`;
  }
}

function formatEdge(from: string, to: string, label: string, style: EdgeStyle): string {
  const lp = label ? `|${label}| ` : " ";
  switch (style) {
    case "dotted": return `${from} -.-> ${lp}${to}`;
    case "thick":  return `${from} ==> ${lp}${to}`;
    default:       return `${from} --> ${lp}${to}`;
  }
}

/** Return the source with a new node appended. */
export function appendNode(
  source: string,
  id: string,
  label: string,
  shape: NodeShape,
): string {
  return source.trimEnd() + `\n  ${formatNode(id, label, shape)}\n`;
}

/** Parse %% link <nodeId> <wikiFile> annotations from the header comments. */
export function parseDiagramLinks(source: string): Map<string, string> {
  const links = new Map<string, string>();
  const re = /^%% link\s+([A-Za-z0-9_]+)\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    links.set(m[1], m[2]);
  }
  return links;
}

/**
 * Insert (or update) a %% link annotation in the header comment block.
 * If a link for nodeId already exists, it is replaced in-place.
 * Otherwise the new line is appended after the last leading %% line.
 */
export function appendDiagramLink(source: string, nodeId: string, wikiFile: string): string {
  const existing = new RegExp(`^%% link ${nodeId}\\s+.+$`, "m");
  if (existing.test(source)) {
    return source.replace(existing, `%% link ${nodeId} ${wikiFile}`);
  }
  const lines = source.split("\n");
  let lastComment = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("%%")) lastComment = i;
    else break;
  }
  lines.splice(lastComment + 1, 0, `%% link ${nodeId} ${wikiFile}`);
  return lines.join("\n");
}

/** Return the source with a new edge appended. */
export function appendEdge(
  source: string,
  from: string,
  to: string,
  label: string,
  style: EdgeStyle,
): string {
  return source.trimEnd() + `\n  ${formatEdge(from, to, label, style)}\n`;
}
