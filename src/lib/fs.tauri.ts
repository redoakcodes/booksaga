/** Tauri filesystem backend — native read/write via tauri-plugin-fs. */

import { readTextFile, writeTextFile, readDir, mkdir, remove } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import type { IFileSystem } from "./filesystem";

export class TauriFileSystem implements IFileSystem {
  readonly mode = "tauri" as const;
  readonly name: string;

  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.name = rootPath.split(/[/\\]/).filter(Boolean).at(-1) ?? rootPath;
  }

  async readFile(...pathParts: string[]): Promise<string | null> {
    try {
      const path = await join(this.rootPath, ...pathParts);
      return await readTextFile(path);
    } catch {
      return null;
    }
  }

  async writeFile(pathParts: string[], content: string): Promise<void> {
    const dirParts = pathParts.slice(0, -1);
    if (dirParts.length > 0) {
      const dirPath = await join(this.rootPath, ...dirParts);
      await mkdir(dirPath, { recursive: true });
    }
    const filePath = await join(this.rootPath, ...pathParts);
    await writeTextFile(filePath, content);
  }

  async deleteFile(pathParts: string[]): Promise<void> {
    const filePath = await join(this.rootPath, ...pathParts);
    await remove(filePath);
  }

  async deleteDir(pathParts: string[]): Promise<void> {
    const dirPath = await join(this.rootPath, ...pathParts);
    await remove(dirPath, { recursive: true });
  }

  async listMarkdownFiles(subdir: string): Promise<string[]> {
    const names: string[] = [];
    const subdirPath = await join(this.rootPath, subdir);
    try {
      // Only wrap the top-level readDir call — if the subdir doesn't exist,
      // return empty. Errors from deeper recursion propagate up.
      await readDir(subdirPath);
    } catch {
      return [];
    }
    await collectMarkdownFiles(subdirPath, "", names);
    return names.sort();
  }

  async listSubdirs(subdir: string): Promise<string[]> {
    const paths: string[] = [];
    const subdirPath = await join(this.rootPath, subdir);
    try {
      await readDir(subdirPath);
    } catch {
      return [];
    }
    await collectSubdirs(subdirPath, "", paths);
    return paths.sort();
  }
}

async function collectSubdirs(dirPath: string, prefix: string, out: string[]): Promise<void> {
  const entries = await readDir(dirPath);
  for (const entry of entries) {
    if (!entry.name || !entry.isDirectory) continue;
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push(relativeName);
    const childPath = await join(dirPath, entry.name);
    await collectSubdirs(childPath, relativeName, out);
  }
}

async function collectMarkdownFiles(
  dirPath: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const entries = await readDir(dirPath);
  for (const entry of entries) {
    if (!entry.name) continue;
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile && entry.name.endsWith(".md")) {
      out.push(relativeName);
    } else if (entry.isDirectory) {
      const childPath = await join(dirPath, entry.name);
      await collectMarkdownFiles(childPath, relativeName, out);
    }
  }
}

export async function pickTauriDirectory(): Promise<TauriFileSystem | null> {
  const path = await open({ directory: true, multiple: false });
  if (!path) return null;
  return new TauriFileSystem(path as string);
}
