/**
 * Public filesystem API.
 * Detects Tauri at runtime and delegates to the appropriate backend.
 * All app code imports from here — never from fs.browser or fs.tauri directly.
 */

export type { IFileSystem, StorageMode } from "./filesystem";
export { BrowserFileSystem } from "./fs.browser";

// TS 6 DOM lib omits showDirectoryPicker — declare it as a global.
declare function showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;

export const isTauri = "__TAURI_INTERNALS__" in window;
export const hasNativePicker = !isTauri && typeof showDirectoryPicker === "function";

// ---------------------------------------------------------------------------
// OPFS helpers (browser-only)
// ---------------------------------------------------------------------------

const OPFS_PROJECTS_DIR = "booksaga-projects";

async function opfsProjectsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_PROJECTS_DIR, { create: true });
}

export async function listOpfsProjects(): Promise<string[]> {
  const dir = await opfsProjectsDir();
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") names.push(name);
  }
  return names.sort();
}

export async function importToOpfs(files: FileList): Promise<FileSystemDirectoryHandle> {
  const projectName = files[0].webkitRelativePath.split("/")[0];
  const projectsDir = await opfsProjectsDir();
  const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });

  for (const file of Array.from(files)) {
    const parts = file.webkitRelativePath.split("/").slice(1);
    let cur = projectDir;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = await cur.getDirectoryHandle(parts[i], { create: true });
    }
    const fh = await cur.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fh.createWritable();
    await writable.write(await file.text());
    await writable.close();
  }

  return projectDir;
}

export async function openOpfsProject(name: string): Promise<FileSystemDirectoryHandle> {
  return (await opfsProjectsDir()).getDirectoryHandle(name);
}

export async function createOpfsProject(name: string): Promise<FileSystemDirectoryHandle> {
  return (await opfsProjectsDir()).getDirectoryHandle(name, { create: true });
}

// ---------------------------------------------------------------------------
// Native picker (Chromium)
// ---------------------------------------------------------------------------

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  return showDirectoryPicker({ mode: "readwrite" });
}

// ---------------------------------------------------------------------------
// Download helper (OPFS fallback for getting files back to disk)
// ---------------------------------------------------------------------------

export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.split("/").pop()!;
  a.click();
  URL.revokeObjectURL(url);
}
