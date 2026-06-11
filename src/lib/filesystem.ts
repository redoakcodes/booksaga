/** Filesystem interface used by production code (TauriFileSystem) and tests (MockFileSystem). */

export interface IFileSystem {
  readFile(...pathParts: string[]): Promise<string | null>;
  writeFile(pathParts: string[], content: string): Promise<void>;
  deleteFile(pathParts: string[]): Promise<void>;
  deleteDir(pathParts: string[]): Promise<void>;
  readonly name: string;
}
