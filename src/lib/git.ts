import { invoke } from "@tauri-apps/api/core";

export async function gitInit(rootPath: string): Promise<void> {
    await invoke("git_init", { rootPath });
}

export async function gitCommitFile(
    rootPath: string,
    relPath: string,
    message: string,
): Promise<void> {
    await invoke("git_commit_file", { rootPath, relPath, message });
}
