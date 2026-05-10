import { createSignal, Show, type Component } from "solid-js";
import { store } from "./store";
import type { Section } from "./store";
import Welcome from "./components/Welcome";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import StatusBar from "./components/StatusBar";
import BacklinksPanel from "./components/BacklinksPanel";
import CreatePrompt from "./components/CreatePrompt";
import Toolbar from "./components/Toolbar";
import {
  readFile,
  saveFile,
  loadProject,
  createChapter,
  reorderChapters,
  promoteOutlineEntry,
  renameWikiFile,
  createWikiFile,
  createWikiFolder,
  extractH1,
  wikiFilenameForTitle,
} from "./lib/project";
import WikiNewModal from "./components/WikiNewModal";
import { updateWikiIndex, normalize } from "./lib/wikiIndex";
import "./App.css";

const App: Component = () => {
  const [pendingCreate, setPendingCreate] = createSignal<string | null>(null);
  const [viewMarkdown, setViewMarkdown] = createSignal(false);
  const [wikiNewOpen, setWikiNewOpen] = createSignal(false);
  const [wikiNewInitialDir, setWikiNewInitialDir] = createSignal("");

  async function handleFileSelect(section: Section, filename: string) {
    const project = store.project();
    if (!project) return;

    if (store.openFile()?.dirty) {
      await handleSave();
    }

    setPendingCreate(null);
    setViewMarkdown(false);
    const content = await readFile(project, section, filename);
    store.setOpenFile({ section, filename, content, dirty: false });
  }

  async function handleSave() {
    const project = store.project();
    const file = store.openFile();
    if (!project || !file || !file.dirty) return;

    store.setSaving(true);
    try {
      if (file.section === "wiki") {
        const h1 = extractH1(file.content);
        const newFilename = h1 ? wikiFilenameForTitle(h1, file.filename) : null;

        if (newFilename && newFilename !== file.filename) {
          await renameWikiFile(project, file.filename, newFilename, h1!, file.content);
          const fresh = await loadProject(project.fs);
          store.setProject(fresh);
          store.setOpenFile({ ...file, filename: newFilename, dirty: false });
        } else {
          await saveFile(project, file.section, file.filename, file.content);
          store.patchOpenFile({ dirty: false });
          store.setProject({
            ...project,
            wikiIndex: updateWikiIndex(project.wikiIndex, file.filename, file.content),
          });
        }
      } else {
        await saveFile(project, file.section, file.filename, file.content);
        store.patchOpenFile({ dirty: false });
      }
    } finally {
      store.setSaving(false);
    }
  }

  async function handleNewChapter(title: string) {
    const project = store.project();
    if (!project) return;
    const filename = await createChapter(project, title);
    store.setProject(await loadProject(project.fs));
    await handleFileSelect("manuscript", filename);
  }

  async function handleReorderChapters(from: number, to: number) {
    const project = store.project();
    if (!project) return;
    const filenames = project.toc.rootChapters
      .map((e) => e.filename)
      .filter((f): f is string => f !== null);
    const reordered = [...filenames];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    await reorderChapters(project, reordered);
    store.setProject(await loadProject(project.fs));
  }

  function handlePlaceholderClick(label: string) {
    if (store.openFile()?.dirty) handleSave();
    store.setOpenFile(null);
    setPendingCreate(label);
  }

  async function handleConfirmCreate() {
    const label = pendingCreate();
    const project = store.project();
    if (!label || !project) return;
    const filename = await promoteOutlineEntry(project, label);
    store.setProject(await loadProject(project.fs));
    await handleFileSelect("manuscript", filename);
  }

  async function handleWikiLinkClick(target: string) {
    const project = store.project();
    if (!project) return;
    const norm = normalize(target);
    const file = project.wikiFiles.find((f) => {
      const stem = f.split("/").pop()!.replace(/\.md$/, "");
      return normalize(stem) === norm;
    });
    if (file) {
      store.setActiveSection("wiki");
      await handleFileSelect("wiki", file);
    }
  }

  function handleChange(markdown: string) {
    store.patchOpenFile({ content: markdown, dirty: true });
  }

  function handleOpenWikiNew(dir = "") {
    setWikiNewInitialDir(dir);
    setWikiNewOpen(true);
  }

  async function handleCreateWikiEntry(
    type: "file" | "folder",
    name: string,
    parentDir: string,
  ) {
    const project = store.project();
    if (!project) return;
    setWikiNewOpen(false);
    if (type === "file") {
      const filename = await createWikiFile(project, parentDir, name);
      store.setProject(await loadProject(project.fs));
      await handleFileSelect("wiki", filename);
    } else {
      await createWikiFolder(project, parentDir, name);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }

  const isWikiOpen = () => store.openFile()?.section === "wiki" ?? false;

  return (
    <div class="app" onKeyDown={handleKeyDown} tabIndex={-1}>
      <Show when={store.project()} fallback={<Welcome />}>
        <div class="layout">
          <Sidebar
            onFileSelect={handleFileSelect}
            onNewChapter={handleNewChapter}
            onReorderChapters={handleReorderChapters}
            onPlaceholderClick={handlePlaceholderClick}
            pendingCreateLabel={pendingCreate()}
            onNewWikiEntry={handleOpenWikiNew}
          />
          <main class="main-panel">
            <Toolbar
              onSave={handleSave}
              viewMarkdown={viewMarkdown()}
              onToggleView={() => setViewMarkdown((v) => !v)}
              onNewWiki={() => handleOpenWikiNew()}
            />
            <Show
              when={store.openFile()}
              fallback={
                <Show
                  when={pendingCreate()}
                  fallback={<div class="no-file">Select a chapter from the sidebar</div>}
                >
                  <CreatePrompt
                    label={pendingCreate()!}
                    onConfirm={handleConfirmCreate}
                    onDismiss={() => setPendingCreate(null)}
                  />
                </Show>
              }
            >
              <Show
                when={!viewMarkdown()}
                fallback={
                  <textarea
                    class="markdown-source"
                    value={store.openFile()?.content ?? ""}
                    onInput={(e) => handleChange(e.currentTarget.value)}
                    spellcheck={false}
                  />
                }
              >
                <Editor
                  fileKey={`${store.openFile()!.section}:${store.openFile()!.filename}`}
                  content={store.openFile()!.content}
                  onChange={handleChange}
                  onWikiLinkClick={isWikiOpen() ? handleWikiLinkClick : undefined}
                />
              </Show>
            </Show>
          </main>
          <Show when={isWikiOpen()}>
            <BacklinksPanel
              filename={store.openFile()!.filename}
              wikiIndex={store.project()!.wikiIndex}
              wikiFiles={store.project()!.wikiFiles}
              onSelect={(path) => handleFileSelect("wiki", path)}
            />
          </Show>
        </div>
        <StatusBar />
        <Show when={wikiNewOpen()}>
          <WikiNewModal
            wikiFiles={store.project()?.wikiFiles ?? []}
            initialDir={wikiNewInitialDir()}
            onConfirm={handleCreateWikiEntry}
            onCancel={() => setWikiNewOpen(false)}
          />
        </Show>
      </Show>
    </div>
  );
};

export default App;
