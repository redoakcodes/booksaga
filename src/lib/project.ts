import type { IFileSystem } from "./filesystem";
import { loadConfig, type Config } from "./config";
import { TocParser, TOC_TEMPLATE, titleToFilename } from "./toc";
import { buildWikiIndex, replaceWikiLinks, type WikiIndex } from "./wikiIndex";

export const MANUSCRIPT_DIR = "manuscript";
export const WIKI_DIR = "wiki";
export const EXERCISES_DIR = "exercises";

export interface ProjectModel {
  fs: IFileSystem;
  config: Config;
  toc: TocParser;
  chapters: string[];
  wikiFiles: string[];
  wikiDirs: string[];
  diagramFiles: string[];
  exerciseFiles: string[];
  wikiIndex: WikiIndex;
  wikiTitleMap: Map<string, string>; // original H1 title → wiki filename
}

export async function loadProject(fs: IFileSystem): Promise<ProjectModel> {
  const config = await loadConfig(fs);

  const tocText = await fs.readFile(MANUSCRIPT_DIR, "toc.md") ?? TOC_TEMPLATE;
  const toc = new TocParser(tocText);

  const allManuscriptFiles = await fs.listMarkdownFiles(MANUSCRIPT_DIR);
  const chapters = toc.orderedChapters(allManuscriptFiles);

  const wikiFiles = await fs.listMarkdownFiles(WIKI_DIR);
  const wikiDirs = await fs.listSubdirs(WIKI_DIR);
  const diagramFiles = await fs.listDiagramFiles(WIKI_DIR);
  const exerciseFiles = await fs.listMarkdownFiles(EXERCISES_DIR);

  const wikiContents = new Map<string, string>();
  for (const f of wikiFiles) {
    const text = await fs.readFile(WIKI_DIR, f);
    if (text != null) wikiContents.set(f, text);
  }
  const wikiIndex = buildWikiIndex(wikiContents);

  const wikiTitleMap = new Map<string, string>();
  for (const [filename, content] of wikiContents) {
    const h1 = extractH1(content);
    if (h1) wikiTitleMap.set(h1, filename);
  }

  return { fs, config, toc, chapters, wikiFiles, wikiDirs, diagramFiles, exerciseFiles, wikiIndex, wikiTitleMap };
}

export async function readFile(
  model: ProjectModel,
  section: "manuscript" | "wiki" | "exercises",
  filename: string,
): Promise<string> {
  const dir = sectionDir(section);
  const parts = filename.split("/");
  return (await model.fs.readFile(dir, ...parts)) ?? "";
}

export async function saveFile(
  model: ProjectModel,
  section: "manuscript" | "wiki" | "exercises",
  filename: string,
  content: string,
): Promise<void> {
  const dir = sectionDir(section);
  const parts = filename.split("/");
  await model.fs.writeFile([dir, ...parts], content);
}

export async function initProject(
  fs: IFileSystem,
  title: string,
  author: string,
): Promise<ProjectModel> {
  await fs.writeFile(
    [".booksaga", "config.json"],
    JSON.stringify({ project: { title, author }, llm: { model: "claude-opus-4-7" } }, null, 2) + "\n",
  );
  if (await fs.readFile(MANUSCRIPT_DIR, "toc.md") === null) {
    await fs.writeFile([MANUSCRIPT_DIR, "toc.md"], TOC_TEMPLATE);
  }
  return loadProject(fs);
}

/** Create a new chapter file and add it to the TOC. Returns the new filename. */
export async function createChapter(model: ProjectModel, title: string): Promise<string> {
  const filename = titleToFilename(title);
  await model.fs.writeFile([MANUSCRIPT_DIR, filename], `# ${title}\n\n`);
  model.toc.addChapter(filename, title);
  await model.fs.writeFile([MANUSCRIPT_DIR, "toc.md"], model.toc.serialize());
  return filename;
}

/**
 * Convert a TOC placeholder (path-less outline entry) into a real file.
 * The existing node's label and children are preserved; only path is filled in.
 * Returns the new filename.
 */
export async function promoteOutlineEntry(model: ProjectModel, label: string): Promise<string> {
  const filename = titleToFilename(label);
  await model.fs.writeFile([MANUSCRIPT_DIR, filename], `# ${label}\n\n`);
  if (!model.toc.promoteNode(label, filename)) {
    model.toc.addChapter(filename, label);
  }
  await model.fs.writeFile([MANUSCRIPT_DIR, "toc.md"], model.toc.serialize());
  return filename;
}

/** Reorder root-level TOC entries and save toc.md. */
export async function reorderChapters(model: ProjectModel, filenames: string[]): Promise<void> {
  model.toc.reorder(filenames);
  await model.fs.writeFile([MANUSCRIPT_DIR, "toc.md"], model.toc.serialize());
}

/** Extract the first H1 heading from markdown, or null if absent. */
export function extractH1(markdown: string): string | null {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return m ? m[1].trim() : null;
}

/**
 * Derive the wiki filename for a given H1 title, keeping the directory prefix
 * of the current filename. e.g. ("Elara the Wise", "characters/elara.md") →
 * "characters/elara-the-wise.md".
 */
export function wikiFilenameForTitle(h1: string, currentFilename: string): string {
  const slug =
    h1.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
  const lastSlash = currentFilename.lastIndexOf("/");
  return lastSlash >= 0 ? currentFilename.slice(0, lastSlash + 1) + slug : slug;
}

/**
 * Rename a wiki file: write content to the new path, delete the old path, and
 * update all [[wikilinks]] in other wiki files to use the new label.
 */
export async function renameWikiFile(
  model: ProjectModel,
  oldFilename: string,
  newFilename: string,
  newLabel: string,
  content: string,
): Promise<void> {
  await model.fs.writeFile([WIKI_DIR, ...newFilename.split("/")], content);
  if (oldFilename !== newFilename) {
    await model.fs.deleteFile([WIKI_DIR, ...oldFilename.split("/")]);
    const oldStem = oldFilename.split("/").pop()!.replace(/\.md$/, "");
    for (const wikiFile of model.wikiFiles) {
      if (wikiFile === oldFilename) continue;
      const text = await model.fs.readFile(WIKI_DIR, ...wikiFile.split("/"));
      if (!text) continue;
      const updated = replaceWikiLinks(text, oldStem, newLabel);
      if (updated !== text) {
        await model.fs.writeFile([WIKI_DIR, ...wikiFile.split("/")], updated);
      }
    }
  }
}

/** Delete a wiki file or directory. */
export async function deleteWikiEntry(
  model: ProjectModel,
  path: string,
  kind: "file" | "dir",
): Promise<void> {
  const parts = [WIKI_DIR, ...path.split("/")];
  if (kind === "file") {
    await model.fs.deleteFile(parts);
  } else {
    await model.fs.deleteDir(parts);
  }
}

/** Create a new wiki file and return its relative path under wiki/. */
export async function createWikiFile(
  model: ProjectModel,
  parentDir: string,
  title: string,
): Promise<string> {
  const slug =
    title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
  const filename = parentDir ? `${parentDir}/${slug}` : slug;
  await model.fs.writeFile([WIKI_DIR, ...filename.split("/")], `# ${title.trim()}\n\n`);
  return filename;
}

/**
 * Create a wiki folder and return its path relative to wiki/.
 * Writes a hidden .gitkeep so the directory exists on disk.
 */
export async function createWikiFolder(
  model: ProjectModel,
  parentDir: string,
  name: string,
): Promise<string> {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const folderPath = parentDir ? `${parentDir}/${slug}` : slug;
  await model.fs.writeFile([WIKI_DIR, ...folderPath.split("/"), ".gitkeep"], "");
  return folderPath;
}

/** Create a new exercise file and return its filename. */
export async function createExerciseFile(
  model: ProjectModel,
  exerciseText: string,
): Promise<string> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.md`;
  const content = `# ${exerciseText.trim()}\n\n# \n`;
  await model.fs.writeFile([EXERCISES_DIR, filename], content);
  return filename;
}

/** Create a new flowchart diagram file and return its relative path under wiki/. */
export async function createDiagramFile(
  model: ProjectModel,
  parentDir: string,
  name: string,
): Promise<string> {
  const slug =
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".mmd";
  const filename = parentDir ? `${parentDir}/${slug}` : slug;
  const content = `flowchart TD\n`;
  await model.fs.writeFile([WIKI_DIR, ...filename.split("/")], content);
  return filename;
}

/** Create a new timeline file and return its relative path under wiki/. */
export async function createTimelineFile(
  model: ProjectModel,
  parentDir: string,
  name: string,
): Promise<string> {
  const slug =
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".mmd";
  const filename = parentDir ? `${parentDir}/${slug}` : slug;
  const content = `timeline\n  title ${name.trim()}\n`;
  await model.fs.writeFile([WIKI_DIR, ...filename.split("/")], content);
  return filename;
}

/** Create a new mind map file and return its relative path under wiki/. */
export async function createMindmapFile(
  model: ProjectModel,
  parentDir: string,
  name: string,
): Promise<string> {
  const slug =
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".mmd";
  const filename = parentDir ? `${parentDir}/${slug}` : slug;
  const rootLabel = name.trim();
  const content = `mindmap\n  root((${rootLabel}))\n`;
  await model.fs.writeFile([WIKI_DIR, ...filename.split("/")], content);
  return filename;
}

/** Build a context string for AI prompts from the current project state. */
export async function buildExerciseContext(model: ProjectModel, maxChars = 1500): Promise<string> {
  const lines: string[] = [`Project: ${model.config.project.title}`];
  if (model.config.project.author) {
    lines.push(`Author: ${model.config.project.author}`);
  }
  if (model.chapters.length > 0) {
    const pick = model.chapters[Math.floor(Math.random() * model.chapters.length)];
    const text = await model.fs.readFile(MANUSCRIPT_DIR, pick);
    if (text) lines.push(`\nExcerpt from ${pick}:\n${text.slice(0, maxChars)}`);
  }
  if (model.wikiFiles.length > 0) {
    const names = model.wikiFiles.slice(0, 15).map((f) => f.replace(/\.md$/, "").replace(/\//g, " › "));
    lines.push(`\nWiki pages: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

function sectionDir(section: "manuscript" | "wiki" | "exercises"): string {
  if (section === "manuscript") return MANUSCRIPT_DIR;
  if (section === "wiki") return WIKI_DIR;
  return EXERCISES_DIR;
}
