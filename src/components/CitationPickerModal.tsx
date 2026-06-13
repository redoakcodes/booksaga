import { createMemo, createSignal, For, Show, type Component } from "solid-js";

interface Props {
  wikiFiles: string[];
  wikiCitations: Map<string, string>;
  onInsert: (wikiPage: string) => void;
  onClose: () => void;
}

const CitationPickerModal: Component<Props> = (props) => {
  const [search, setSearch] = createSignal("");

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    const files = props.wikiFiles;
    const citations = props.wikiCitations;
    return files
      .filter((f) => !f.endsWith(".mmd"))
      .filter((f) => !q || f.toLowerCase().includes(q))
      .sort((a, b) => {
        // Pages with citation metadata sort first
        const aHas = citations.has(a.replace(/\.md$/, "")) ? 0 : 1;
        const bHas = citations.has(b.replace(/\.md$/, "")) ? 0 : 1;
        return aHas - bHas || a.localeCompare(b);
      });
  });

  function displayName(filename: string): string {
    return filename.replace(/\.md$/, "").split("/").join(" › ");
  }

  function insert(filename: string) {
    props.onInsert(filename.replace(/\.md$/, ""));
    props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={() => props.onClose()}>
      <div
        class="modal-box citation-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="modal-title">Insert Citation</h2>

        <input
          class="new-modal-input"
          type="text"
          placeholder="Search wiki pages…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          autofocus
        />

        <div class="citation-picker-list">
          <Show
            when={filtered().length > 0}
            fallback={
              <p class="citation-picker-empty">No matching wiki pages.</p>
            }
          >
            <For each={filtered()}>
              {(file) => {
                const stem = file.replace(/\.md$/, "");
                const citation = props.wikiCitations.get(stem);
                return (
                  <button
                    class="citation-picker-item"
                    onClick={() => insert(file)}
                  >
                    <span class="citation-picker-name">
                      {displayName(file)}
                    </span>
                    <Show when={citation}>
                      <span class="citation-picker-text">{citation}</span>
                    </Show>
                    <Show when={!citation}>
                      <span class="citation-picker-no-cite">
                        no citation set
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={() => props.onClose()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CitationPickerModal;
