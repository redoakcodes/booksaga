import { describe, it, expect, beforeEach } from "vitest";
import type { IFileSystem, StorageMode } from "../lib/filesystem";
import {
  loadProject, readFile, saveFile, initProject,
  renameWikiFile, extractH1, wikiFilenameForTitle,
  promoteOutlineEntry, createExerciseFile,
  createMindmapFile, createTimelineFile,
  MANUSCRIPT_DIR, WIKI_DIR, EXERCISES_DIR,
} from "../lib/project";
import { TOC_TEMPLATE } from "../lib/toc";

// ---------------------------------------------------------------------------
// Mock filesystem
// ---------------------------------------------------------------------------

class MockFileSystem implements IFileSystem {
  files = new Map<string, string>();
  readonly mode: StorageMode = "opfs";
  readonly name = "test-project";

  async readFile(...pathParts: string[]): Promise<string | null> {
    return this.files.get(pathParts.join("/")) ?? null;
  }

  async writeFile(pathParts: string[], content: string): Promise<void> {
    this.files.set(pathParts.join("/"), content);
  }

  async deleteFile(pathParts: string[]): Promise<void> {
    this.files.delete(pathParts.join("/"));
  }

  async deleteDir(pathParts: string[]): Promise<void> {
    const prefix = pathParts.join("/") + "/";
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
  }

  async listMarkdownFiles(subdir: string): Promise<string[]> {
    const prefix = subdir + "/";
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix) && k.endsWith(".md"))
      .map((k) => k.slice(prefix.length))
      .sort();
  }

  async listDiagramFiles(subdir: string): Promise<string[]> {
    const prefix = subdir + "/";
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix) && k.endsWith(".mmd"))
      .map((k) => k.slice(prefix.length))
      .sort();
  }

  async listSubdirs(subdir: string): Promise<string[]> {
    const prefix = subdir + "/";
    const dirs = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const parts = key.slice(prefix.length).split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
    return Array.from(dirs).sort();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadProject", () => {
  let fs: MockFileSystem;

  beforeEach(() => {
    fs = new MockFileSystem();
  });

  it("loads with defaults when project is empty", async () => {
    const model = await loadProject(fs);
    expect(model.config.project.title).toBe("Untitled Project");
    expect(model.chapters).toEqual([]);
    expect(model.wikiFiles).toEqual([]);
    expect(model.exerciseFiles).toEqual([]);
  });

  it("reads project config", async () => {
    fs.files.set(".booksaga/config.json", JSON.stringify({ project: { title: "My Novel", author: "Brent" } }));
    const model = await loadProject(fs);
    expect(model.config.project.title).toBe("My Novel");
    expect(model.config.project.author).toBe("Brent");
  });

  it("returns chapters in toc order", async () => {
    fs.files.set(`${MANUSCRIPT_DIR}/toc.md`, "# Table of Contents\n1. b.md\n1. a.md\n");
    fs.files.set(`${MANUSCRIPT_DIR}/a.md`, "");
    fs.files.set(`${MANUSCRIPT_DIR}/b.md`, "");
    const model = await loadProject(fs);
    expect(model.chapters).toEqual(["b.md", "a.md"]);
  });

  it("lists wiki files", async () => {
    fs.files.set(`${WIKI_DIR}/characters/elara.md`, "");
    fs.files.set(`${WIKI_DIR}/locations/city.md`, "");
    const model = await loadProject(fs);
    expect(model.wikiFiles).toEqual(["characters/elara.md", "locations/city.md"]);
  });

  it("lists exercise files", async () => {
    fs.files.set(`${EXERCISES_DIR}/exercise-one.md`, "");
    const model = await loadProject(fs);
    expect(model.exerciseFiles).toEqual(["exercise-one.md"]);
  });

  it("builds wiki index from wiki file contents", async () => {
    fs.files.set(`${WIKI_DIR}/elara.md`, "Knows [[City]]."),
    fs.files.set(`${WIKI_DIR}/city.md`, "");
    const model = await loadProject(fs);
    expect(model.wikiIndex.backward.get("city")).toContain("elara");
  });

  it("stores the fs reference on the model", async () => {
    const model = await loadProject(fs);
    expect(model.fs).toBe(fs);
  });
});

describe("readFile / saveFile", () => {
  let fs: MockFileSystem;

  beforeEach(() => {
    fs = new MockFileSystem();
  });

  it("reads a manuscript file", async () => {
    fs.files.set(`${MANUSCRIPT_DIR}/chapter-one.md`, "# Chapter One\n\nContent here.");
    const model = await loadProject(fs);
    const content = await readFile(model, "manuscript", "chapter-one.md");
    expect(content).toBe("# Chapter One\n\nContent here.");
  });

  it("returns empty string for missing file", async () => {
    const model = await loadProject(fs);
    const content = await readFile(model, "manuscript", "missing.md");
    expect(content).toBe("");
  });

  it("saves a manuscript file", async () => {
    const model = await loadProject(fs);
    await saveFile(model, "manuscript", "chapter-one.md", "New content");
    expect(fs.files.get(`${MANUSCRIPT_DIR}/chapter-one.md`)).toBe("New content");
  });

  it("saves a wiki file", async () => {
    const model = await loadProject(fs);
    await saveFile(model, "wiki", "characters/elara.md", "Elara is...");
    expect(fs.files.get(`${WIKI_DIR}/characters/elara.md`)).toBe("Elara is...");
  });
});

describe("extractH1", () => {
  it("extracts the first h1", () => {
    expect(extractH1("# Hello World\n\nSome text.")).toBe("Hello World");
  });

  it("returns null when no h1", () => {
    expect(extractH1("## Not h1\n\nSome text.")).toBeNull();
  });

  it("trims whitespace from the heading", () => {
    expect(extractH1("#  Padded  ")).toBe("Padded");
  });
});

describe("wikiFilenameForTitle", () => {
  it("slugifies the title", () => {
    expect(wikiFilenameForTitle("Elara the Wise", "elara.md")).toBe("elara-the-wise.md");
  });

  it("preserves the directory prefix", () => {
    expect(wikiFilenameForTitle("Elara the Wise", "characters/elara.md")).toBe(
      "characters/elara-the-wise.md",
    );
  });

  it("strips special characters", () => {
    expect(wikiFilenameForTitle("The City: A History", "city.md")).toBe(
      "the-city-a-history.md",
    );
  });
});

describe("renameWikiFile", () => {
  let fs: MockFileSystem;

  beforeEach(() => {
    fs = new MockFileSystem();
  });

  it("writes content to the new path and deletes the old", async () => {
    fs.files.set(`${WIKI_DIR}/elara.md`, "# Elara\n\nHero.");
    const model = await loadProject(fs);
    await renameWikiFile(model, "elara.md", "elara-the-wise.md", "Elara the Wise", "# Elara the Wise\n\nHero.");
    expect(fs.files.has(`${WIKI_DIR}/elara-the-wise.md`)).toBe(true);
    expect(fs.files.has(`${WIKI_DIR}/elara.md`)).toBe(false);
  });

  it("updates [[wikilinks]] in other files", async () => {
    fs.files.set(`${WIKI_DIR}/elara.md`, "# Elara\n\n");
    fs.files.set(`${WIKI_DIR}/city.md`, "Home of [[Elara]].");
    const model = await loadProject(fs);
    await renameWikiFile(model, "elara.md", "elara-the-wise.md", "Elara the Wise", "# Elara the Wise\n\n");
    expect(fs.files.get(`${WIKI_DIR}/city.md`)).toBe("Home of [[Elara the Wise]].");
  });

  it("does not touch files with no matching links", async () => {
    fs.files.set(`${WIKI_DIR}/elara.md`, "# Elara\n\n");
    fs.files.set(`${WIKI_DIR}/city.md`, "No links here.");
    const model = await loadProject(fs);
    await renameWikiFile(model, "elara.md", "elara-the-wise.md", "Elara the Wise", "# Elara the Wise\n\n");
    expect(fs.files.get(`${WIKI_DIR}/city.md`)).toBe("No links here.");
  });

  it("handles case-variant links during rename", async () => {
    fs.files.set(`${WIKI_DIR}/elara.md`, "# Elara\n\n");
    fs.files.set(`${WIKI_DIR}/city.md`, "See [[ELARA]] and [[elara]].");
    const model = await loadProject(fs);
    await renameWikiFile(model, "elara.md", "elara-the-wise.md", "Elara the Wise", "# Elara the Wise\n\n");
    expect(fs.files.get(`${WIKI_DIR}/city.md`)).toBe(
      "See [[Elara the Wise]] and [[Elara the Wise]].",
    );
  });
});

describe("promoteOutlineEntry", () => {
  it("creates the file and updates the TOC path", async () => {
    const fs = new MockFileSystem();
    fs.files.set(`${MANUSCRIPT_DIR}/toc.md`, "# Table of Contents\n1. Part One\n");
    const model = await loadProject(fs);
    const filename = await promoteOutlineEntry(model, "Part One");
    expect(filename).toBe("part-one.md");
    expect(fs.files.has(`${MANUSCRIPT_DIR}/part-one.md`)).toBe(true);
  });

  it("writes an H1 matching the label", async () => {
    const fs = new MockFileSystem();
    fs.files.set(`${MANUSCRIPT_DIR}/toc.md`, "# Table of Contents\n1. Part One\n");
    const model = await loadProject(fs);
    await promoteOutlineEntry(model, "Part One");
    expect(fs.files.get(`${MANUSCRIPT_DIR}/part-one.md`)).toMatch(/^# Part One/);
  });

  it("links the TOC entry to the new file in toc.md", async () => {
    const fs = new MockFileSystem();
    fs.files.set(`${MANUSCRIPT_DIR}/toc.md`, "# Table of Contents\n1. Part One\n");
    const model = await loadProject(fs);
    await promoteOutlineEntry(model, "Part One");
    const saved = fs.files.get(`${MANUSCRIPT_DIR}/toc.md`)!;
    expect(saved).toContain("part-one.md");
  });

  it("preserves children of the promoted node in toc.md", async () => {
    const fs = new MockFileSystem();
    fs.files.set(
      `${MANUSCRIPT_DIR}/toc.md`,
      "# Table of Contents\n1. Part One\n   1. chapter-one.md\n",
    );
    fs.files.set(`${MANUSCRIPT_DIR}/chapter-one.md`, "");
    const model = await loadProject(fs);
    await promoteOutlineEntry(model, "Part One");
    const fresh = await loadProject(fs);
    expect(fresh.chapters).toContain("chapter-one.md");
  });
});

describe("createExerciseFile", () => {
  it("writes a timestamped markdown file to the exercises dir", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createExerciseFile(model, "Write a scene about longing.");
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/);
    expect(fs.files.has(`${EXERCISES_DIR}/${filename}`)).toBe(true);
  });

  it("writes an H1 with the exercise text", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createExerciseFile(model, "Write about loss.");
    const content = fs.files.get(`${EXERCISES_DIR}/${filename}`)!;
    expect(content).toMatch(/^# Write about loss\./m);
  });

  it("appends an empty H1 after the exercise", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createExerciseFile(model, "Write about loss.");
    const content = fs.files.get(`${EXERCISES_DIR}/${filename}`)!;
    expect(content).toMatch(/^# $/m);
  });
});

describe("createMindmapFile", () => {
  it("creates a .mmd file with mindmap boilerplate", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createMindmapFile(model, "", "Story Structure");
    expect(filename).toMatch(/\.mmd$/);
    expect(fs.files.has(`${WIKI_DIR}/${filename}`)).toBe(true);
  });

  it("uses the name as the root node label", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createMindmapFile(model, "", "Story Structure");
    const content = fs.files.get(`${WIKI_DIR}/${filename}`)!;
    expect(content).toContain("root((Story Structure))");
  });

  it("starts with the mindmap declaration", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createMindmapFile(model, "", "Themes");
    const content = fs.files.get(`${WIKI_DIR}/${filename}`)!;
    expect(content.startsWith("mindmap")).toBe(true);
  });

  it("slugifies the filename", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createMindmapFile(model, "", "Character Arc");
    expect(filename).toBe("character-arc.mmd");
  });

  it("places the file in the parent directory", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createMindmapFile(model, "structure", "Outline");
    expect(filename).toBe("structure/outline.mmd");
  });
});

describe("createTimelineFile", () => {
  it("creates a .mmd file with timeline boilerplate", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createTimelineFile(model, "", "Story Arc");
    expect(filename).toMatch(/\.mmd$/);
    expect(fs.files.has(`${WIKI_DIR}/${filename}`)).toBe(true);
  });

  it("starts with the timeline declaration", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createTimelineFile(model, "", "Story Arc");
    const content = fs.files.get(`${WIKI_DIR}/${filename}`)!;
    expect(content.startsWith("timeline")).toBe(true);
  });

  it("uses the name as the timeline title", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createTimelineFile(model, "", "Story Arc");
    const content = fs.files.get(`${WIKI_DIR}/${filename}`)!;
    expect(content).toContain("title Story Arc");
  });

  it("slugifies the filename", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createTimelineFile(model, "", "Character Arc");
    expect(filename).toBe("character-arc.mmd");
  });

  it("places the file in the parent directory", async () => {
    const fs = new MockFileSystem();
    const model = await loadProject(fs);
    const filename = await createTimelineFile(model, "structure", "Outline");
    expect(filename).toBe("structure/outline.mmd");
  });
});

describe("initProject", () => {
  it("writes config and toc", async () => {
    const fs = new MockFileSystem();
    await initProject(fs, "The Great Novel", "Brent");
    expect(fs.files.has(".booksaga/config.json")).toBe(true);
    expect(fs.files.has(`${MANUSCRIPT_DIR}/toc.md`)).toBe(true);
  });

  it("sets project title and author in config", async () => {
    const fs = new MockFileSystem();
    const model = await initProject(fs, "Test Title", "Test Author");
    expect(model.config.project.title).toBe("Test Title");
    expect(model.config.project.author).toBe("Test Author");
  });

  it("writes valid toc template", async () => {
    const fs = new MockFileSystem();
    await initProject(fs, "Test", "");
    const toc = fs.files.get(`${MANUSCRIPT_DIR}/toc.md`);
    expect(toc).toBe(TOC_TEMPLATE);
  });

  it("does not overwrite an existing toc.md", async () => {
    const fs = new MockFileSystem();
    const existingToc = "# Table of Contents\n1. chapter-one.md\n";
    fs.files.set(`${MANUSCRIPT_DIR}/toc.md`, existingToc);
    await initProject(fs, "My Book", "");
    expect(fs.files.get(`${MANUSCRIPT_DIR}/toc.md`)).toBe(existingToc);
  });
});
