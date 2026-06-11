/** Wiki link index — mirrors booksaga's wiki_index.py logic. */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Replace all [[wikilinks]] pointing at oldStem with [[newLabel]]. */
export function replaceWikiLinks(
  content: string,
  oldStem: string,
  newLabel: string,
): string {
  const oldNorm = normalize(oldStem);
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, inner) =>
    normalize(inner) === oldNorm ? `[[${newLabel}]]` : match,
  );
}

export interface WikiIndex {
  forward: Map<string, string[]>;
  backward: Map<string, string[]>;
  pages: string[];
}

export function buildWikiIndex(files: Map<string, string>): WikiIndex {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  const pages: string[] = [];

  for (const [path, content] of files) {
    const stem = path.split("/").pop()!.replace(/\.md$/, "");
    const pageName = normalize(stem);
    if (!pages.includes(pageName)) pages.push(pageName);

    const targets: string[] = [];
    const seen = new Set<string>();
    for (const m of content.matchAll(WIKILINK_RE)) {
      const norm = normalize(m[1]);
      if (!seen.has(norm)) {
        targets.push(norm);
        seen.add(norm);
      }
    }
    forward.set(pageName, targets);

    for (const target of targets) {
      const bl = backward.get(target) ?? [];
      if (!bl.includes(pageName)) bl.push(pageName);
      backward.set(target, bl);
    }
  }

  return { forward, backward, pages };
}

export function backlinks(index: WikiIndex, pageName: string): string[] {
  return index.backward.get(normalize(pageName)) ?? [];
}

export function forwardLinks(index: WikiIndex, pageName: string): string[] {
  return index.forward.get(normalize(pageName)) ?? [];
}

/** Incrementally update the index when one wiki file is saved. Returns a new WikiIndex. */
export function updateWikiIndex(
  index: WikiIndex,
  path: string,
  content: string,
): WikiIndex {
  const stem = path.split("/").pop()!.replace(/\.md$/, "");
  const pageName = normalize(stem);

  const forward = new Map(index.forward);
  const backward = new Map(index.backward);
  const pages = index.pages.includes(pageName)
    ? index.pages
    : [...index.pages, pageName];

  // Remove stale backward links contributed by this page
  for (const target of forward.get(pageName) ?? []) {
    const bl = backward.get(target);
    if (bl) {
      const filtered = bl.filter((p) => p !== pageName);
      if (filtered.length) {
        backward.set(target, filtered);
      } else {
        backward.delete(target);
      }
    }
  }

  // Parse current forward links
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(new RegExp(WIKILINK_RE.source, "g"))) {
    const norm = normalize(m[1]);
    if (!seen.has(norm)) {
      targets.push(norm);
      seen.add(norm);
    }
  }
  forward.set(pageName, targets);

  for (const target of targets) {
    const bl = backward.get(target) ?? [];
    if (!bl.includes(pageName)) backward.set(target, [...bl, pageName]);
  }

  return { forward, backward, pages };
}
