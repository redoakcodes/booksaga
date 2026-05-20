import { describe, it, expect } from "vitest";
import { parseMindmapNodes, appendMindmapNode } from "../lib/mindmap";

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
