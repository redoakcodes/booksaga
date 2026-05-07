/** Shared filesystem interface — implemented by both browser and Tauri backends. */

export type StorageMode = "native" | "opfs" | "tauri";

export interface IFileSystem {
  /** Read a file by path parts relative to the project root. Returns null if not found. */
  readFile(...pathParts: string[]): Promise<string | null>;
  /** Write a file, creating parent directories as needed. */
  writeFile(pathParts: string[], content: string): Promise<void>;
  /** List all .md filenames (relative to subdir) recursively. */
  listMarkdownFiles(subdir: string): Promise<string[]>;
  /** Delete a file by path parts relative to the project root. */
  deleteFile(pathParts: string[]): Promise<void>;
  /** How this FS is backed — drives UI decisions like the download button. */
  readonly mode: StorageMode;
  /** Display name of the project root directory. */
  readonly name: string;
}
