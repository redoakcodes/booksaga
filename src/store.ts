import { createSignal, createRoot } from "solid-js";
import type { ProjectModel } from "./lib/project";

export type Section = "manuscript" | "wiki" | "exercises";

export interface OpenFile {
  section: Section;
  filename: string;
  content: string; // body only — frontmatter stripped for wiki files
  dirty: boolean;
  frontmatter?: Record<string, string>; // preserved for wiki files
}

function createAppStore() {
  const [project, setProject] = createSignal<ProjectModel | null>(null);
  const [openFile, setOpenFile] = createSignal<OpenFile | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [activeSection, setActiveSection] = createSignal<Section>("manuscript");

  function patchOpenFile(patch: Partial<OpenFile>) {
    const f = openFile();
    if (!f) return;
    setOpenFile({ ...f, ...patch });
  }

  return {
    project,
    setProject,
    openFile,
    setOpenFile,
    patchOpenFile,
    saving,
    setSaving,
    activeSection,
    setActiveSection,
  };
}

export const store = createRoot(createAppStore);
