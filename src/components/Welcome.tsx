import { createSignal, type Component } from "solid-js";
import { loadProject, initProject } from "../lib/project";
import { store } from "../store";
import { pickTauriDirectory } from "../lib/fs.tauri";
import { gitInit } from "../lib/git";

const Welcome: Component = () => {
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  async function run(action: () => Promise<void>) {
    setError("");
    setLoading(true);
    try {
      await action();
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "AbortError") {
        setError(typeof e === "string" ? e : (err?.message ?? "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function pickFs() {
    const fs = await pickTauriDirectory();
    if (!fs) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    return fs;
  }

  return (
    <div class="welcome">
      <div class="welcome-card">
        <h1>BookSaga</h1>
        <p>A writing tool for long-form projects.</p>
        <div class="welcome-actions">
          <button class="btn-primary" disabled={loading()} onClick={() => run(async () => {
            const fs = await pickFs();
            await gitInit(fs.rootPath).catch(() => {});
            store.setProject(await loadProject(fs));
          })}>
            {loading() ? "Opening…" : "Open Project"}
          </button>
          <button class="btn-secondary" disabled={loading()} onClick={() => run(async () => {
            const fs = await pickFs();
            await gitInit(fs.rootPath).catch(() => {});
            await initProject(fs, "My Book", "");
            store.setProject(await loadProject(fs));
          })}>
            New Project
          </button>
          <button class="btn-secondary" disabled={loading()} onClick={() => run(async () => {
            const fs = await pickFs();
            await gitInit(fs.rootPath).catch(() => {});
            const hasConfig = await fs.readFile(".booksaga", "config.json") !== null;
            if (!hasConfig) await initProject(fs, "My Book", "");
            store.setProject(await loadProject(fs));
          })}>
            Import
          </button>
        </div>
        {error() && <p class="welcome-error">{error()}</p>}
      </div>
    </div>
  );
};

export default Welcome;
