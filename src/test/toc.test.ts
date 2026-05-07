import { describe, it, expect } from "vitest";
import { TocParser, TOC_TEMPLATE, titleToFilename } from "../lib/toc";

describe("TocParser", () => {
  describe("orderedChapters", () => {
    it("returns empty list when toc is empty", () => {
      const p = new TocParser(null);
      expect(p.orderedChapters([])).toEqual([]);
    });

    it("returns files in toc order", () => {
      const toc = `# Table of Contents\n1. chapter-two.md\n1. chapter-one.md\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["chapter-one.md", "chapter-two.md"])).toEqual([
        "chapter-two.md",
        "chapter-one.md",
      ]);
    });

    it("appends unlisted files alphabetically after toc entries", () => {
      const toc = `# Table of Contents\n1. chapter-one.md\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["chapter-one.md", "chapter-two.md", "appendix.md"])).toEqual([
        "chapter-one.md",
        "appendix.md",
        "chapter-two.md",
      ]);
    });

    it("skips toc entries whose files don't exist on disk", () => {
      const toc = `# Table of Contents\n1. missing.md\n1. chapter-one.md\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["chapter-one.md"])).toEqual(["chapter-one.md"]);
    });

    it("excludes toc.md itself", () => {
      const toc = `# Table of Contents\n1. chapter-one.md\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["toc.md", "chapter-one.md"])).toEqual(["chapter-one.md"]);
    });

    it("handles markdown link syntax [Label](path.md)", () => {
      const toc = `# Table of Contents\n1. [Chapter One](chapter-one.md)\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["chapter-one.md"])).toEqual(["chapter-one.md"]);
    });

    it("handles nested chapters in depth-first order", () => {
      const toc = [
        "# Table of Contents",
        "1. part-one.md",
        "   1. chapter-one.md",
        "   1. chapter-two.md",
        "1. part-two.md",
      ].join("\n");
      const p = new TocParser(toc);
      const all = ["part-one.md", "chapter-one.md", "chapter-two.md", "part-two.md"];
      expect(p.orderedChapters(all)).toEqual(all);
    });

    it("strips HTML comments before parsing", () => {
      const toc = `# Table of Contents\n<!-- ignore me -->\n1. chapter-one.md\n`;
      const p = new TocParser(toc);
      expect(p.orderedChapters(["chapter-one.md"])).toEqual(["chapter-one.md"]);
    });
  });

  describe("filenames", () => {
    it("returns all filenames in depth-first order", () => {
      const toc = `# Table of Contents\n1. a.md\n   1. b.md\n1. c.md\n`;
      const p = new TocParser(toc);
      expect(p.filenames).toEqual(["a.md", "b.md", "c.md"]);
    });
  });

  describe("addChapter", () => {
    it("appends a new filename", () => {
      const p = new TocParser("# Table of Contents\n1. existing.md\n");
      p.addChapter("new.md");
      expect(p.filenames).toContain("new.md");
    });

    it("does not add a duplicate", () => {
      const p = new TocParser("# Table of Contents\n1. existing.md\n");
      p.addChapter("existing.md");
      expect(p.filenames.filter((f) => f === "existing.md")).toHaveLength(1);
    });
  });

  describe("reorder", () => {
    it("replaces the file list", () => {
      const p = new TocParser("# Table of Contents\n1. a.md\n1. b.md\n");
      p.reorder(["b.md", "a.md"]);
      expect(p.filenames).toEqual(["b.md", "a.md"]);
    });
  });

  describe("serialize", () => {
    it("round-trips a simple list", () => {
      const toc = "# Table of Contents\n\n1. chapter-one.md\n1. chapter-two.md\n";
      const p = new TocParser(toc);
      const p2 = new TocParser(p.serialize());
      expect(p2.filenames).toEqual(["chapter-one.md", "chapter-two.md"]);
    });

    it("round-trips nested structure", () => {
      const toc = "# Table of Contents\n\n1. part.md\n   1. chapter.md\n";
      const p = new TocParser(toc);
      const p2 = new TocParser(p.serialize());
      expect(p2.filenames).toEqual(["part.md", "chapter.md"]);
    });
  });

  describe("rootChapters", () => {
    it("returns label and filename for each root entry", () => {
      const toc = "# Table of Contents\n1. [Chapter One](chapter-one.md)\n1. chapter-two.md\n";
      const p = new TocParser(toc);
      expect(p.rootChapters).toEqual([
        { label: "Chapter One", filename: "chapter-one.md" },
        { label: "chapter-two.md", filename: "chapter-two.md" },
      ]);
    });

    it("returns null filename for placeholder entries", () => {
      const toc = "# Table of Contents\n1. Part One\n";
      const p = new TocParser(toc);
      expect(p.rootChapters[0]).toEqual({ label: "Part One", filename: null });
    });
  });

  describe("addChapter with label", () => {
    it("uses the provided label", () => {
      const p = new TocParser("# Table of Contents\n");
      p.addChapter("ch-one.md", "Chapter One");
      expect(p.rootChapters[0].label).toBe("Chapter One");
      expect(p.rootChapters[0].filename).toBe("ch-one.md");
    });

    it("falls back to filename when no label provided", () => {
      const p = new TocParser("# Table of Contents\n");
      p.addChapter("ch-one.md");
      expect(p.rootChapters[0].label).toBe("ch-one.md");
    });
  });

  describe("reorder preserves labels", () => {
    it("keeps labels when reordering", () => {
      const toc = "# Table of Contents\n1. [Chapter One](a.md)\n1. [Chapter Two](b.md)\n";
      const p = new TocParser(toc);
      p.reorder(["b.md", "a.md"]);
      expect(p.rootChapters[0].label).toBe("Chapter Two");
      expect(p.rootChapters[1].label).toBe("Chapter One");
    });

    it("keeps children when reordering", () => {
      const toc = "# Table of Contents\n1. part-a.md\n   1. ch-a1.md\n1. part-b.md\n";
      const p = new TocParser(toc);
      p.reorder(["part-b.md", "part-a.md"]);
      expect(p.filenames).toEqual(["part-b.md", "part-a.md", "ch-a1.md"]);
    });
  });

  describe("titleToFilename", () => {
    it("lowercases and hyphenates", () => {
      expect(titleToFilename("The Storm")).toBe("the-storm.md");
    });

    it("abbreviates 'chapter'", () => {
      expect(titleToFilename("Chapter One")).toBe("ch-one.md");
    });

    it("strips special characters", () => {
      expect(titleToFilename("Part One: The Beginning")).toBe("part-one-the-beginning.md");
    });
  });

  describe("promoteNode", () => {
    it("sets path on a placeholder node", () => {
      const toc = "# Table of Contents\n1. Part One\n";
      const p = new TocParser(toc);
      p.promoteNode("Part One", "part-one.md");
      expect(p.filenames).toContain("part-one.md");
    });

    it("preserves children of the promoted node", () => {
      const toc = "# Table of Contents\n1. Part One\n   1. chapter-one.md\n";
      const p = new TocParser(toc);
      p.promoteNode("Part One", "part-one.md");
      expect(p.filenames).toEqual(["part-one.md", "chapter-one.md"]);
    });

    it("returns false when label not found", () => {
      const toc = "# Table of Contents\n1. [Part One](part-one.md)\n";
      const p = new TocParser(toc);
      expect(p.promoteNode("Nonexistent", "x.md")).toBe(false);
    });

    it("only promotes placeholder nodes, not file-linked nodes", () => {
      const toc = "# Table of Contents\n1. [Part One](part-one.md)\n";
      const p = new TocParser(toc);
      p.promoteNode("Part One", "new-part-one.md");
      // Should NOT change the path of an already-linked node
      expect(p.filenames).toContain("part-one.md");
      expect(p.filenames).not.toContain("new-part-one.md");
    });
  });

  describe("TOC_TEMPLATE", () => {
    it("parses without errors and produces an empty chapter list", () => {
      const p = new TocParser(TOC_TEMPLATE);
      expect(p.orderedChapters([])).toEqual([]);
    });
  });
});
