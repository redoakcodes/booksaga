import { createEffect, createSignal, Show, type Component } from "solid-js";
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
  createDiagramFile,
  createMindmapFile,
  createTimelineFile,
  deleteWikiEntry,
  extractH1,
  wikiFilenameForTitle,
  updateWikiCitations,
} from "./lib/project";
import CitationPickerModal from "./components/CitationPickerModal";
import { parseFrontmatter, serializeFrontmatter } from "./lib/frontmatter";
import WikiNewModal from "./components/WikiNewModal";
import type { EntryType } from "./components/WikiNewModal";
import SettingsModal from "./components/SettingsModal";
import ExerciseNewModal from "./components/ExerciseNewModal";
import DiagramEditor from "./components/DiagramEditor";
import DiagramSourceEditor from "./components/DiagramSourceEditor";
import SagaConsole from "./components/SagaConsole";
import { updateWikiIndex, normalize } from "./lib/wikiIndex";
import {
  loadSettings,
  saveSettings,
  loadCredentials,
  saveCredentials,
  resolveModel,
  applyTheme,
  type AppSettings,
  type Credentials,
} from "./lib/settings";
import { createExerciseFile } from "./lib/project";
import promptsData from "./assets/prompts.json";
import type { PromptEntry, AiConfig } from "./lib/ai";
import { insertMarkdown, insertCitation, scrollToText } from "./lib/editorCommands";
import { invoke } from "@tauri-apps/api/core";
import type { TauriFileSystem } from "./lib/fs.tauri";
import "./App.css";

function updateWikiTitleMap(
  map: Map<string, string>,
  filename: string,
  content: string,
): Map<string, string> {
  const next = new Map(map);
  for (const [title, fn] of next) {
    if (fn === filename) {
      next.delete(title);
      break;
    }
  }
  const h1 = extractH1(content);
  if (h1) next.set(h1, filename);
  return next;
}

const App: Component = () => {
  const [pendingCreate, setPendingCreate] = createSignal<string | null>(null);
  const [viewMarkdown, setViewMarkdown] = createSignal(false);
  const [wikiNewOpen, setWikiNewOpen] = createSignal(false);
  const [wikiNewInitialDir, setWikiNewInitialDir] = createSignal("");
  const [pendingDelete, setPendingDelete] = createSignal<{
    path: string;
    kind: "file" | "dir";
    fileCount: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [appSettings, setAppSettings] = createSignal<AppSettings>({
    theme: "dark",
    llm: {},
  });
  const [credentials, setCredentials] = createSignal<Credentials>({});
  const [exerciseNewOpen, setExerciseNewOpen] = createSignal(false);
  const [sagaOpen, setSagaOpen] = createSignal(false);
  const [citationPickerOpen, setCitationPickerOpen] = createSignal(false);
  const isDiagram = () => store.openFile()?.filename.endsWith(".mmd") ?? false;
  const prompts: PromptEntry[] = promptsData;

  const wikiTitleMap = () =>
    store.project()?.wikiTitleMap ?? new Map<string, string>();
  const wikiTitles = () => Array.from(wikiTitleMap().keys());

  // Load settings and credentials at startup (not project-dependent)
  loadSettings().then((s) => {
    setAppSettings(s);
    applyTheme(s.theme);
  });
  loadCredentials().then(setCredentials);

  createEffect(() => {
    const project = store.project();
    if (!project) return;
    invoke("set_project_root", {
      root: (project.fs as TauriFileSystem).rootPath,
    }).catch(() => {});
  });

  let imageInputRef!: HTMLInputElement;

  async function handleImageFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const project = store.project();
    if (!project) return;
    const rootPath = (project.fs as TauriFileSystem).rootPath;
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    try {
      const savedName = await invoke<string>("save_image", {
        rootPath,
        filename: file.name,
        bytes,
      });
      insertMarkdown(`![](booksaga://localhost/manuscript/art/${savedName})`);
    } catch (err) {
      console.error("Failed to save image:", err);
    }
  }

  async function handleFileSelect(section: Section, filename: string) {
    const project = store.project();
    if (!project) return;

    if (store.openFile()?.dirty) {
      await handleSave();
    }

    setPendingCreate(null);
    setViewMarkdown(false);
    const raw = await readFile(project, section, filename);
    if (section === "wiki" && !filename.endsWith(".mmd")) {
      const { meta, body } = parseFrontmatter(raw);
      store.setOpenFile({
        section,
        filename,
        content: body,
        dirty: false,
        frontmatter: meta,
      });
    } else {
      store.setOpenFile({ section, filename, content: raw, dirty: false });
    }
  }

  async function handleSave() {
    const project = store.project();
    const file = store.openFile();
    if (!project || !file || !file.dirty) return;

    store.setSaving(true);
    try {
      if (file.section === "wiki" && !file.filename.endsWith(".mmd")) {
        const fullContent = serializeFrontmatter(
          file.frontmatter ?? {},
          file.content,
        );
        const h1 = extractH1(file.content);
        const newFilename = h1 ? wikiFilenameForTitle(h1, file.filename) : null;

        if (newFilename && newFilename !== file.filename) {
          await renameWikiFile(
            project,
            file.filename,
            newFilename,
            h1!,
            fullContent,
          );
          const fresh = await loadProject(project.fs);
          store.setProject(fresh);
          store.setOpenFile({ ...file, filename: newFilename, dirty: false });
        } else {
          await saveFile(project, file.section, file.filename, fullContent);
          store.patchOpenFile({ dirty: false });
          store.setProject({
            ...project,
            wikiIndex: updateWikiIndex(
              project.wikiIndex,
              file.filename,
              file.content,
            ),
            wikiTitleMap: updateWikiTitleMap(
              project.wikiTitleMap,
              file.filename,
              file.content,
            ),
            wikiCitations: updateWikiCitations(
              project.wikiCitations,
              file.filename,
              fullContent,
            ),
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

  // Navigate to a wiki page by filename (used by diagram auto-backlinks and citations)
  async function handleWikiFileClick(filename: string) {
    store.setActiveSection("wiki");
    await handleFileSelect("wiki", filename);
  }

  async function handleCitationClick(wikiPage: string) {
    const project = store.project();
    if (!project) return;
    const filename = wikiPage + ".md";
    if (project.wikiFiles.includes(filename)) {
      store.setActiveSection("wiki");
      await handleFileSelect("wiki", filename);
    }
  }

  function handleChange(markdown: string) {
    store.patchOpenFile({ content: markdown, dirty: true });
  }

  function handleWikiDelete(path: string, kind: "file" | "dir") {
    const project = store.project();
    if (!project) return;
    const fileCount =
      kind === "dir"
        ? project.wikiFiles.filter((f) => f.startsWith(path + "/")).length
        : 0;
    setPendingDelete({ path, kind, fileCount });
  }

  async function handleConfirmDelete() {
    const t = pendingDelete();
    if (!t) return;
    const project = store.project();
    if (!project) return;
    setPendingDelete(null);

    await deleteWikiEntry(project, t.path, t.kind);

    const open = store.openFile();
    if (open?.section === "wiki") {
      const affected =
        t.kind === "file"
          ? open.filename === t.path
          : open.filename === t.path || open.filename.startsWith(t.path + "/");
      if (affected) store.setOpenFile(null);
    }

    const prefix = t.path + "/";
    store.setProject({
      ...project,
      wikiFiles: project.wikiFiles.filter(
        (f) => f !== t.path && !f.startsWith(prefix),
      ),
      wikiDirs: project.wikiDirs.filter(
        (d) => d !== t.path && !d.startsWith(prefix),
      ),
    });
  }

  function handleNew() {
    const section = store.activeSection();
    if (section === "wiki") handleOpenWikiNew();
    else if (section === "exercises") setExerciseNewOpen(true);
  }

  async function handleCreateExercise(exerciseText: string) {
    const project = store.project();
    if (!project) return;
    setExerciseNewOpen(false);
    const filename = await createExerciseFile(project, exerciseText);
    store.setProject(await loadProject(project.fs));
    store.setActiveSection("exercises");
    await handleFileSelect("exercises", filename);
  }

  function handleOpenWikiNew(dir = "") {
    setWikiNewInitialDir(dir);
    setWikiNewOpen(true);
  }

  async function handleCreateWikiEntry(
    type: EntryType,
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
    } else if (type === "diagram") {
      const filename = await createDiagramFile(project, parentDir, name);
      store.setProject(await loadProject(project.fs));
      await handleFileSelect("wiki", filename);
    } else if (type === "mindmap") {
      const filename = await createMindmapFile(project, parentDir, name);
      store.setProject(await loadProject(project.fs));
      await handleFileSelect("wiki", filename);
    } else if (type === "timeline") {
      const filename = await createTimelineFile(project, parentDir, name);
      store.setProject(await loadProject(project.fs));
      await handleFileSelect("wiki", filename);
    } else {
      const folderPath = await createWikiFolder(project, parentDir, name);
      const newDirs = [...project.wikiDirs, folderPath].sort();
      store.setProject({ ...project, wikiDirs: newDirs });
    }
  }

  async function handleSaveSettings(settings: AppSettings, creds: Credentials) {
    await saveSettings(settings);
    await saveCredentials(creds);
    setAppSettings(settings);
    setCredentials(creds);
    applyTheme(settings.theme);
    setSettingsOpen(false);
  }

  const aiConfig = (): AiConfig => ({
    sagaModelConfig: resolveModel(appSettings().llm, "saga"),
    exerciseModelConfig: resolveModel(appSettings().llm, "exercise"),
    apiKey: credentials().anthropicApiKey,
    braveApiKey: credentials().braveApiKey,
  });

  function handleToggleSaga() {
    const wasOpen = sagaOpen();
    setSagaOpen((v) => !v);
    if (wasOpen) {
      const pm = document.querySelector(".ProseMirror") as HTMLElement | null;
      pm?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      setViewMarkdown((v) => !v);
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      handleToggleSaga();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      handleNew();
    }
  }

  const isWikiOpen = () =>
    store.openFile()?.section === "wiki" &&
    !store.openFile()?.filename.endsWith(".mmd");

  async function navigateToPassage(chapter: string, context?: string, text?: string) {
    const project = store.project();
    if (!project) return;
    const match = project.chapters.find(
      (c) => c === chapter || c.toLowerCase() === chapter.toLowerCase(),
    );
    if (!match) return;
    store.setActiveSection("manuscript");
    const already =
      store.openFile()?.section === "manuscript" &&
      store.openFile()?.filename === match;
    if (!already) {
      await handleFileSelect("manuscript", match);
    }
    if (context) scrollToText(context, text);
  }

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
            onDeleteWikiEntry={handleWikiDelete}
          />
          <main class="main-panel">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageFileChange}
            />
            <Toolbar
              onSave={handleSave}
              viewMarkdown={viewMarkdown()}
              onToggleView={() => setViewMarkdown((v) => !v)}
              onNew={handleNew}
              onSettings={() => setSettingsOpen(true)}
              onInsertImage={() => imageInputRef.click()}
              onInsertCitation={
                store.openFile()?.section === "manuscript"
                  ? () => setCitationPickerOpen(true)
                  : undefined
              }
              isDiagram={isDiagram()}
            />
            <Show
              when={store.openFile()}
              fallback={
                <Show
                  when={pendingCreate()}
                  fallback={
                    <div class="no-file">Select a chapter from the sidebar</div>
                  }
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
                  isDiagram() ? (
                    <DiagramSourceEditor
                      content={store.openFile()!.content}
                      onChange={handleChange}
                      wikiTitles={wikiTitles()}
                    />
                  ) : (
                    <textarea
                      class="markdown-source"
                      value={store.openFile()?.content ?? ""}
                      onInput={(e) => handleChange(e.currentTarget.value)}
                      spellcheck={false}
                    />
                  )
                }
              >
                <Show
                  when={isDiagram()}
                  fallback={
                    <Editor
                      fileKey={`${store.openFile()!.section}:${store.openFile()!.filename}`}
                      content={store.openFile()!.content}
                      onChange={handleChange}
                      onWikiLinkClick={
                        isWikiOpen() ? handleWikiLinkClick : undefined
                      }
                      onCitationClick={handleCitationClick}
                    />
                  }
                >
                  <DiagramEditor
                    fileKey={`${store.openFile()!.section}:${store.openFile()!.filename}`}
                    content={store.openFile()!.content}
                    lightTheme={["light", "scifi", "romance"].includes(
                      appSettings().theme,
                    )}
                    onWikiLinkClick={handleWikiFileClick}
                    wikiTitleMap={wikiTitleMap()}
                  />
                </Show>
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
        <SagaConsole
          open={sagaOpen()}
          onToggle={handleToggleSaga}
          aiConfig={aiConfig()}
          currentFile={(() => {
            const f = store.openFile();
            if (!f) return null;
            const dir =
              f.section === "manuscript"
                ? "manuscript"
                : f.section === "wiki"
                  ? "wiki"
                  : "exercises";
            return `${dir}/${f.filename}`;
          })()}
          onNavigate={(chapter, context, text) => {
            navigateToPassage(chapter, context, text);
          }}
        />
        <StatusBar />
        <Show when={wikiNewOpen()}>
          <WikiNewModal
            wikiDirs={store.project()?.wikiDirs ?? []}
            initialDir={wikiNewInitialDir()}
            onConfirm={handleCreateWikiEntry}
            onCancel={() => setWikiNewOpen(false)}
          />
        </Show>
        <Show when={citationPickerOpen()}>
          <CitationPickerModal
            wikiFiles={store.project()?.wikiFiles ?? []}
            wikiCitations={store.project()?.wikiCitations ?? new Map()}
            onInsert={(wikiPage) => {
              insertCitation(wikiPage);
              setCitationPickerOpen(false);
            }}
            onClose={() => setCitationPickerOpen(false)}
          />
        </Show>
        <Show when={exerciseNewOpen()}>
          <ExerciseNewModal
            prompts={prompts}
            aiConfig={aiConfig()}
            model={store.project() ?? null}
            onCreate={handleCreateExercise}
            onCancel={() => setExerciseNewOpen(false)}
          />
        </Show>
        <Show when={settingsOpen()}>
          <SettingsModal
            settings={appSettings()}
            credentials={credentials()}
            onSave={handleSaveSettings}
            onClose={() => setSettingsOpen(false)}
          />
        </Show>
        <Show when={pendingDelete()}>
          {(() => {
            const pd = pendingDelete()!;
            const rawName = pd.path.split("/").pop() ?? pd.path;
            const displayName =
              pd.kind === "file"
                ? rawName.replace(/\.md$/, "").replace(/[-_]/g, " ")
                : rawName;
            const hasContents = pd.fileCount > 0;
            const title = pd.kind === "file" ? "Delete File" : "Delete Folder";
            const btnLabel = hasContents ? "Delete All" : "Delete";
            const extra = hasContents
              ? `${pd.fileCount} additional file${pd.fileCount === 1 ? "" : "s"} will be deleted along with this folder.`
              : null;
            return (
              <div class="modal-overlay" onClick={() => setPendingDelete(null)}>
                <div class="modal-box" onClick={(e) => e.stopPropagation()}>
                  <h2 class="modal-title">{title}</h2>
                  <p class="modal-body">
                    Are you sure you want to delete{" "}
                    <strong>{displayName}</strong>?
                  </p>
                  <Show when={extra}>
                    <p class="modal-body modal-body-sub">{extra}</p>
                  </Show>
                  <div class="modal-actions">
                    <button
                      class="btn-secondary"
                      onClick={() => setPendingDelete(null)}
                    >
                      Cancel
                    </button>
                    <button
                      class="btn-primary"
                      onClick={() => handleConfirmDelete()}
                    >
                      {btnLabel}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </Show>
      </Show>
    </div>
  );
};

export default App;
