import { describe, it, expect } from "vitest";
import { buildWikiIndex, backlinks, forwardLinks, updateWikiIndex } from "../lib/wikiIndex";

describe("buildWikiIndex", () => {
  it("returns empty index for empty input", () => {
    const idx = buildWikiIndex(new Map());
    expect(idx.pages).toEqual([]);
    expect(backlinks(idx, "anything")).toEqual([]);
    expect(forwardLinks(idx, "anything")).toEqual([]);
  });

  it("registers pages from file names", () => {
    const files = new Map([["characters/elara.md", "No links here."]]);
    const idx = buildWikiIndex(files);
    expect(idx.pages).toContain("elara");
  });

  it("extracts forward links from [[wikilinks]]", () => {
    const files = new Map([
      ["wiki/page-a.md", "See [[Page B]] and [[Page C]]."],
      ["wiki/page-b.md", ""],
      ["wiki/page-c.md", ""],
    ]);
    const idx = buildWikiIndex(files);
    expect(forwardLinks(idx, "page-a")).toEqual(["page-b", "page-c"]);
  });

  it("builds backlinks correctly", () => {
    const files = new Map([
      ["wiki/page-a.md", "Links to [[page-b]]."],
      ["wiki/page-c.md", "Also links to [[page-b]]."],
      ["wiki/page-b.md", ""],
    ]);
    const idx = buildWikiIndex(files);
    expect(backlinks(idx, "page-b").sort()).toEqual(["page-a", "page-c"]);
  });

  it("normalizes page names (lowercase, spaces to hyphens)", () => {
    const files = new Map([["wiki/my page.md", "See [[Another Page]]."]]);
    const idx = buildWikiIndex(files);
    expect(idx.pages).toContain("my-page"); // normalize() applies to filename stems too
    expect(forwardLinks(idx, "my-page")).toContain("another-page");
  });

  it("deduplicates multiple links to the same target", () => {
    const files = new Map([["wiki/a.md", "[[b]] and [[b]] again."]]);
    const idx = buildWikiIndex(files);
    expect(forwardLinks(idx, "a")).toEqual(["b"]);
  });

  it("does not add self to backlinks", () => {
    const files = new Map([["wiki/a.md", "[[a]] (self link)"]]);
    const idx = buildWikiIndex(files);
    expect(backlinks(idx, "a")).toEqual(["a"]);
  });

  it("returns empty array for unknown page", () => {
    const idx = buildWikiIndex(new Map([["wiki/a.md", ""]]));
    expect(backlinks(idx, "nonexistent")).toEqual([]);
    expect(forwardLinks(idx, "nonexistent")).toEqual([]);
  });
});

describe("updateWikiIndex", () => {
  it("adds new forward links when a page is saved", () => {
    const idx = buildWikiIndex(new Map([["wiki/a.md", ""], ["wiki/b.md", ""]]));
    const updated = updateWikiIndex(idx, "a.md", "Now links to [[b]].");
    expect(forwardLinks(updated, "a")).toEqual(["b"]);
    expect(backlinks(updated, "b")).toContain("a");
  });

  it("removes stale backlinks when links are edited out", () => {
    const idx = buildWikiIndex(new Map([["wiki/a.md", "[[b]]"], ["wiki/b.md", ""]]));
    const updated = updateWikiIndex(idx, "a.md", "No more links.");
    expect(forwardLinks(updated, "a")).toEqual([]);
    expect(backlinks(updated, "b")).not.toContain("a");
  });

  it("does not mutate the original index", () => {
    const idx = buildWikiIndex(new Map([["wiki/a.md", "[[b]]"]]));
    updateWikiIndex(idx, "a.md", "No links.");
    expect(forwardLinks(idx, "a")).toEqual(["b"]);
  });

  it("returns a new object reference", () => {
    const idx = buildWikiIndex(new Map([["wiki/a.md", ""]]));
    const updated = updateWikiIndex(idx, "a.md", "[[b]]");
    expect(updated).not.toBe(idx);
  });
});
