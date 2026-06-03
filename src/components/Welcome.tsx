import { createResource, createSignal, For, Show, type Component } from "solid-js";
import {
  isTauri,
  hasNativePicker,
  pickDirectory,
  importToOpfs,
  createOpfsProject,
  openOpfsProject,
  listOpfsProjects,
  BrowserFileSystem,
} from "../lib/fs";
import type { IFileSystem } from "../lib/filesystem";
import { loadProject, initProject } from "../lib/project";
import { store } from "../store";

async function openWith(
  getFs: () => Promise<IFileSystem>,
  setError: (e: string) => void,
  setLoading: (v: boolean) => void,
) {
  setError("");
  setLoading(true);
  try {
    const fs = await getFs();
    const model = await loadProject(fs);
    store.setProject(model);
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name !== "AbortError") setError(err?.message ?? "Failed to open project");
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Tauri panel
// ---------------------------------------------------------------------------

const TauriWelcome: Component = () => {
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  async function pickFs() {
    const { pickTauriDirectory } = await import("../lib/fs.tauri");
    const fs = await pickTauriDirectory();
    if (!fs) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    return fs;
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setLoading(true);
    try {
      await action();
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "AbortError") {
        // Tauri command failures reject with a plain string, not an Error object
        setError(typeof e === "string" ? e : (err?.message ?? "Unknown error"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div class="welcome-actions">
        <button class="btn-primary" disabled={loading()} onClick={() => run(async () => {
          const fs = await pickFs();
          await import("../lib/git").then(({ gitInit }) => gitInit(fs.rootPath)).catch(() => {});
          store.setProject(await loadProject(fs));
        })}>
          {loading() ? "Opening…" : "Open Project"}
        </button>
        <button class="btn-secondary" disabled={loading()} onClick={() => run(async () => {
          const fs = await pickFs();
          await import("../lib/git").then(({ gitInit }) => gitInit(fs.rootPath)).catch(() => {});
          await initProject(fs, "My Book", "");
          store.setProject(await loadProject(fs));
        })}>
          New Project
        </button>
        <button class="btn-secondary" disabled={loading()} onClick={() => run(async () => {
          const fs = await pickFs();
          await import("../lib/git").then(({ gitInit }) => gitInit(fs.rootPath)).catch(() => {});
          const hasConfig = await fs.readFile(".booksaga", "config.json") !== null;
          if (!hasConfig) await initProject(fs, "My Book", "");
          store.setProject(await loadProject(fs));
        })}>
          Import
        </button>
      </div>
      {error() && <p class="welcome-error">{error()}</p>}
    </>
  );
};

// ---------------------------------------------------------------------------
// Native Chromium panel
// ---------------------------------------------------------------------------

const NativeWelcome: Component = () => {
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  return (
    <>
      <div class="welcome-actions">
        <button class="btn-primary" disabled={loading()} onClick={() =>
          openWith(async () => {
            const handle = await pickDirectory();
            return new BrowserFileSystem(handle, "native");
          }, setError, setLoading)
        }>
          {loading() ? "Opening…" : "Open Project"}
        </button>
        <button class="btn-secondary" disabled={loading()} onClick={() =>
          openWith(async () => {
            const handle = await pickDirectory();
            const fs = new BrowserFileSystem(handle, "native");
            await initProject(fs, "My Book", "");
            return fs;
          }, setError, setLoading)
        }>
          New Project
        </button>
      </div>
      {error() && <p class="welcome-error">{error()}</p>}
    </>
  );
};

// ---------------------------------------------------------------------------
// OPFS (Firefox) panel
// ---------------------------------------------------------------------------

const OpfsWelcome: Component = () => {
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [projects, { refetch }] = createResource(listOpfsProjects);

  let fileInput!: HTMLInputElement;

  function handleImport(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    openWith(async () => {
      const handle = await importToOpfs(files);
      return new BrowserFileSystem(handle, "opfs");
    }, setError, setLoading);
    refetch();
  }

  async function handleNew() {
    const name = newName().trim();
    if (!name) return;
    await openWith(async () => {
      const handle = await createOpfsProject(name);
      const fs = new BrowserFileSystem(handle, "opfs");
      await initProject(fs, name, "");
      return fs;
    }, setError, setLoading);
    refetch();
  }

  return (
    <>
      <p class="welcome-note">
        Files are stored in your browser's private storage. Use Import to load
        an existing project folder from disk.
      </p>
      <div class="welcome-actions">
        <button class="btn-primary" disabled={loading()} onClick={() => fileInput.click()}>
          {loading() ? "Importing…" : "Import Project Folder"}
        </button>
        <input
          ref={fileInput}
          type="file"
          // @ts-ignore — webkitdirectory not in TS DOM types
          webkitdirectory
          style="display:none"
          onChange={handleImport}
        />
      </div>
      <div class="welcome-new-project">
        <input
          class="input-text"
          type="text"
          placeholder="New project name…"
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNew()}
        />
        <button class="btn-secondary" disabled={loading() || !newName().trim()} onClick={handleNew}>
          Create
        </button>
      </div>
      <Show when={(projects() ?? []).length > 0}>
        <div class="welcome-recent">
          <p class="welcome-recent-label">Recent projects</p>
          <ul class="welcome-recent-list">
            <For each={projects()}>
              {(name) => (
                <li class="welcome-recent-item" onClick={() =>
                  openWith(async () => {
                    const handle = await openOpfsProject(name);
                    return new BrowserFileSystem(handle, "opfs");
                  }, setError, setLoading)
                }>
                  {name}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      {error() && <p class="welcome-error">{error()}</p>}
    </>
  );
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const Welcome: Component = () => (
  <div class="welcome">
    <div class="welcome-card">
      <h1>BookSaga</h1>
      <p>A writing tool for long-form projects.</p>
      {isTauri ? <TauriWelcome /> : hasNativePicker ? <NativeWelcome /> : <OpfsWelcome />}
    </div>
  </div>
);

export default Welcome;
