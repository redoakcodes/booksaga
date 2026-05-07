import { type Component, Show } from "solid-js";
import { store } from "../store";
import { downloadFile } from "../lib/fs";

const StatusBar: Component = () => {
  const file = () => store.openFile();
  const storageMode = () => store.project()?.fs.mode;

  const wordCount = () => {
    const content = file()?.content ?? "";
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  };

  const displayName = () => {
    const f = file();
    if (!f) return "";
    const section = f.section[0].toUpperCase() + f.section.slice(1);
    const name = f.filename.split("/").pop()!.replace(/\.md$/, "");
    return `${section} / ${name}`;
  };

  return (
    <footer class="status-bar">
      <Show when={file()} fallback={<span>No file open</span>}>
        <span class="status-filename">{displayName()}</span>
        <span class="status-words">{wordCount().toLocaleString()} words</span>
        <Show when={file()!.dirty}>
          <span class="status-dirty">●</span>
        </Show>
        <Show when={store.saving()}>
          <span class="status-saving">Saving…</span>
        </Show>
        <Show when={storageMode() === "opfs"}>
          <button
            class="status-download"
            onClick={() => downloadFile(file()!.filename, file()!.content)}
            title="Download this file to disk"
          >
            ↓ Download
          </button>
        </Show>
      </Show>
    </footer>
  );
};

export default StatusBar;
