import { describe, it, expect } from "vitest";
import { parseMindmapNodes, appendMindmapNode, parseMindmapLinks, appendMindmapLink } from "../lib/mindmap";

const BASE = `%% booksaga: mindmap
mindmap
  root((Story))
    Characters
      Hero
      Villain
    Settings
`;

describe("parseMindmapNodes", () => {
  it("returns all nodes with depth 0 for root", () => {
    const nodes = parseMindmapNodes(BASE);
    expect(nodes[0].label).toBe("Story");
    expect(nodes[0].depth).toBe(0);
  });

  it("strips shape markers from root", () => {
    const nodes = parseMindmapNodes(BASE);
    expect(nodes[0].label).toBe("Story");
  });

  it("returns depth 1 for direct children of root", () => {
    const nodes = parseMindmapNodes(BASE);
    const chars = nodes.find((n) => n.label === "Characters");
    expect(chars?.depth).toBe(1);
  });

  it("returns depth 2 for grandchildren", () => {
    const nodes = parseMindmapNodes(BASE);
    const hero = nodes.find((n) => n.label === "Hero");
    expect(hero?.depth).toBe(2);
  });

  it("excludes %% comment lines", () => {
    const nodes = parseMindmapNodes(BASE);
    expect(nodes.every((n) => !n.label.startsWith("%%"))).toBe(true);
  });

  it("excludes the mindmap declaration line", () => {
    const nodes = parseMindmapNodes(BASE);
    expect(nodes.every((n) => n.label !== "mindmap")).toBe(true);
  });

  it("strips ((label)) markers", () => {
    const source = "mindmap\n  root((Central))\n";
    const nodes = parseMindmapNodes(source);
    expect(nodes[0].label).toBe("Central");
  });

  it("strips (label) rounded markers", () => {
    const source = "mindmap\n  root((Topic))\n    Branch(node)\n";
    const nodes = parseMindmapNodes(source);
    expect(nodes[1].label).toBe("node");
  });

  it("returns plain text nodes unchanged", () => {
    const source = "mindmap\n  root((Topic))\n    PlainBranch\n";
    const nodes = parseMindmapNodes(source);
    expect(nodes[1].label).toBe("PlainBranch");
  });
});

describe("parseMindmapLinks", () => {
  it("parses a single link annotation", () => {
    const source = `%% booksaga: mindmap\n%% link "Characters" characters.md\nmindmap\n  root((Story))\n`;
    const links = parseMindmapLinks(source);
    expect(links.get("Characters")).toBe("characters.md");
  });

  it("parses multiple link annotations", () => {
    const source = `%% booksaga: mindmap\n%% link "Characters" characters.md\n%% link "Settings" settings/main.md\nmindmap\n  root((Story))\n`;
    const links = parseMindmapLinks(source);
    expect(links.get("Characters")).toBe("characters.md");
    expect(links.get("Settings")).toBe("settings/main.md");
  });

  it("supports multi-word labels", () => {
    const source = `%% booksaga: mindmap\n%% link "Main Character" hero.md\nmindmap\n  root((Story))\n`;
    const links = parseMindmapLinks(source);
    expect(links.get("Main Character")).toBe("hero.md");
  });

  it("returns empty map when no links", () => {
    const source = `%% booksaga: mindmap\nmindmap\n  root((Story))\n`;
    expect(parseMindmapLinks(source).size).toBe(0);
  });

  it("ignores unquoted flowchart-style links", () => {
    const source = `%% booksaga: mindmap\n%% link n1 wiki.md\nmindmap\n  root((Story))\n`;
    expect(parseMindmapLinks(source).size).toBe(0);
  });
});

describe("appendMindmapLink", () => {
  it("inserts a new link annotation after the last %% header line", () => {
    const source = `%% booksaga: mindmap\nmindmap\n  root((Story))\n`;
    const result = appendMindmapLink(source, "Characters", "characters.md");
    expect(result).toContain(`%% link "Characters" characters.md`);
    const lines = result.split("\n");
    const linkIdx = lines.findIndex((l) => l.includes(`%% link "Characters"`));
    const mindmapIdx = lines.findIndex((l) => l.trim() === "mindmap");
    expect(linkIdx).toBeLessThan(mindmapIdx);
  });

  it("updates an existing link annotation in-place", () => {
    const source = `%% booksaga: mindmap\n%% link "Characters" old.md\nmindmap\n  root((Story))\n`;
    const result = appendMindmapLink(source, "Characters", "new.md");
    expect(result).toContain(`%% link "Characters" new.md`);
    expect(result).not.toContain("old.md");
  });

  it("preserves other link annotations when updating one", () => {
    const source = `%% booksaga: mindmap\n%% link "Characters" characters.md\n%% link "Settings" settings.md\nmindmap\n  root((Story))\n`;
    const result = appendMindmapLink(source, "Characters", "new.md");
    expect(result).toContain(`%% link "Settings" settings.md`);
  });
});

describe("appendMindmapNode", () => {
  it("appends a child at the correct indentation under the root", () => {
    const result = appendMindmapNode(BASE, "Story", "Themes");
    const lines = result.split("\n");
    const idx = lines.findIndex((l) => l.trim() === "Themes");
    expect(idx).toBeGreaterThan(0);
    const indent = lines[idx].length - lines[idx].trimStart().length;
    expect(indent).toBe(4); // root is at 2, child at 4
  });

  it("appends a child after the last child of the parent's subtree", () => {
    const result = appendMindmapNode(BASE, "Characters", "Mentor");
    const lines = result.split("\n");
    // "Settings" comes after "Characters" subtree; "Mentor" should be before "Settings"
    const mentorIdx = lines.findIndex((l) => l.trim() === "Mentor");
    const settingsIdx = lines.findIndex((l) => l.trim() === "Settings");
    expect(mentorIdx).toBeLessThan(settingsIdx);
  });

  it("indents grandchildren correctly", () => {
    const result = appendMindmapNode(BASE, "Hero", "Backstory");
    const lines = result.split("\n");
    const idx = lines.findIndex((l) => l.trim() === "Backstory");
    const indent = lines[idx].length - lines[idx].trimStart().length;
    expect(indent).toBe(8); // Hero is at 6, its child at 8
  });

  it("returns source unchanged when parent not found", () => {
    const result = appendMindmapNode(BASE, "Nonexistent", "Child");
    expect(result).toBe(BASE);
  });

  it("preserves existing content", () => {
    const result = appendMindmapNode(BASE, "Story", "Themes");
    expect(result).toContain("Characters");
    expect(result).toContain("Hero");
    expect(result).toContain("Settings");
  });
});
