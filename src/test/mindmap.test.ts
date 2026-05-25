import { describe, it, expect } from "vitest";
import { parseMindmapNodes } from "../lib/mindmap";

const BASE = `mindmap
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
