/** Browser filesystem backend — File System Access API (native) or OPFS. */

import type { IFileSystem, StorageMode } from "./filesystem";

export class BrowserFileSystem implements IFileSystem {
  readonly mode: StorageMode;
  readonly name: string;

  private readonly handle: FileSystemDirectoryHandle;

  constructor(handle: FileSystemDirectoryHandle, mode: "native" | "opfs") {
    this.handle = handle;
    this.mode = mode;
    this.name = handle.name;
  }

  async readFile(...pathParts: string[]): Promise<string | null> {
    try {
      let current = this.handle;
      for (let i = 0; i < pathParts.length - 1; i++) {
        current = await current.getDirectoryHandle(pathParts[i]);
      }
      const fh = await current.getFileHandle(pathParts[pathParts.length - 1]);
      return (await fh.getFile()).text();
    } catch {
      return null;
    }
  }

  async writeFile(pathParts: string[], content: string): Promise<void> {
    let current = this.handle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = await current.getDirectoryHandle(pathParts[i], { create: true });
    }
    const fh = await current.getFileHandle(pathParts[pathParts.length - 1], { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async deleteFile(pathParts: string[]): Promise<void> {
    let current = this.handle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = await current.getDirectoryHandle(pathParts[i]);
    }
    await current.removeEntry(pathParts[pathParts.length - 1]);
  }

  async listMarkdownFiles(subdir: string): Promise<string[]> {
    const names: string[] = [];
    let sub: FileSystemDirectoryHandle;
    try {
      sub = await this.handle.getDirectoryHandle(subdir);
    } catch {
      return []; // subdir doesn't exist — not an error
    }
    await collectMarkdownFiles(sub, "", names); // errors here propagate up
    return names.sort();
  }

  async listSubdirs(subdir: string): Promise<string[]> {
    const paths: string[] = [];
    let sub: FileSystemDirectoryHandle;
    try {
      sub = await this.handle.getDirectoryHandle(subdir);
    } catch {
      return [];
    }
    await collectSubdirs(sub, "", paths);
    return paths.sort();
  }
}

async function collectSubdirs(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[],
): Promise<void> {
  const iter = dir.entries();
  for (;;) {
    const { done, value } = await iter.next();
    if (done) break;
    const [name, handle] = value;
    if (handle.kind === "directory") {
      const relativeName = prefix ? `${prefix}/${name}` : name;
      out.push(relativeName);
      await collectSubdirs(handle as FileSystemDirectoryHandle, relativeName, out);
    }
  }
}

async function collectMarkdownFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[],
): Promise<void> {
  // Use explicit iterator protocol instead of `for await...of` to work around
  // a Firefox OPFS bug where entries() returns an AsyncIterator without
  // implementing Symbol.asyncIterator, causing for-await to throw.
  const iter = dir.entries();
  for (;;) {
    const { done, value } = await iter.next();
    if (done) break;
    const [name, handle] = value;
    if (handle.kind === "file" && name.endsWith(".md")) {
      out.push(prefix ? `${prefix}/${name}` : name);
    } else if (handle.kind === "directory") {
      await collectMarkdownFiles(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
        out,
      );
    }
  }
}
