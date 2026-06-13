const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface Frontmatter {
  meta: Record<string, string>;
  body: string;
}

/** Parse YAML-ish frontmatter from the top of a markdown string. */
export function parseFrontmatter(content: string): Frontmatter {
  const m = FENCE_RE.exec(content);
  if (!m) return { meta: {}, body: content };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const rawVal = line.slice(colon + 1).trim();
    // strip surrounding quotes
    const val = rawVal.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (key) meta[key] = val;
  }
  return { meta, body: content.slice(m[0].length) };
}

/** Serialise frontmatter meta back onto a body string. */
export function serializeFrontmatter(
  meta: Record<string, string>,
  body: string,
): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return body;
  const lines = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
