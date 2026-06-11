/** Tauri filesystem backend — native read/write via tauri-plugin-fs. */

import { readTextFile, writeTextFile, mkdir, remove } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import type { IFileSystem } from "./filesystem";
import { gitCommitFile } from "./git";

export class TauriFileSystem implements IFileSystem {
  readonly name: string;
  readonly rootPath: string;

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

    const relPath = pathParts.join("/");
    const label = (pathParts.at(-1) ?? "").replace(/\.(md|mmd)$/, "").replace(/[-_]/g, " ");
    await gitCommitFile(this.rootPath, relPath, `save: ${label}`).catch(() => {});
  }

  async deleteFile(pathParts: string[]): Promise<void> {
    const filePath = await join(this.rootPath, ...pathParts);
    await remove(filePath);
  }

  async deleteDir(pathParts: string[]): Promise<void> {
    const dirPath = await join(this.rootPath, ...pathParts);
    await remove(dirPath, { recursive: true });
  }
}

export async function pickTauriDirectory(): Promise<TauriFileSystem | null> {
  const path = await open({ directory: true, multiple: false });
  if (!path) return null;
  return new TauriFileSystem(path as string);
}
