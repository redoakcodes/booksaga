import { createSignal, For, Show, type Component } from "solid-js";
import { appendMindmapLink, appendMindmapNode, parseMindmapLinks, parseMindmapNodes } from "../lib/mindmap";

type Mode = "node" | "backlink";

interface Props {
  initialMode: Mode;
  source: string;
  wikiFiles: string[];
  onInsert: (newSource: string) => void;
  onCancel: () => void;
}

const MindmapInsertModal: Component<Props> = (props) => {
  const [mode, setMode] = createSignal<Mode>(props.initialMode);
  const nodes = () => parseMindmapNodes(props.source);
  const existingLinks = () => parseMindmapLinks(props.source);

  // Node form
  const [parentLabel, setParentLabel] = createSignal("");
  const [childLabel, setChildLabel] = createSignal("");

  // Backlink form
  const [linkNodeLabel, setLinkNodeLabel] = createSignal("");
  const [linkWikiFile, setLinkWikiFile] = createSignal("");

  function handleInsertNode(e: Event) {
    e.preventDefault();
    const parent = parentLabel();
    const child = childLabel().trim();
    if (!parent || !child) return;
    props.onInsert(appendMindmapNode(props.source, parent, child));
  }

  function handleInsertBacklink(e: Event) {
    e.preventDefault();
    const nLabel = linkNodeLabel();
    const wf = linkWikiFile();
    if (!nLabel || !wf) return;
    props.onInsert(appendMindmapLink(props.source, nLabel, wf));
  }

  function nodeDisplayLabel(label: string, depth: number): string {
    return "  ".repeat(depth) + label;
  }

  function wikiDisplayName(path: string): string {
    return path.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\//g, " / ");
  }

  return (
    <div class="modal-overlay" onClick={props.onCancel}>
      <div class="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">Insert</h2>

        <div class="new-modal-type-toggle">
          <button
            type="button"
            class={`new-modal-type-btn${mode() === "node" ? " active" : ""}`}
            onClick={() => setMode("node")}
          >
            Node
          </button>
          <button
            type="button"
            class={`new-modal-type-btn${mode() === "backlink" ? " active" : ""}`}
            onClick={() => setMode("backlink")}
          >
            Backlink
          </button>
        </div>

        {/* ── Node form ── */}
        <Show when={mode() === "node"}>
          <Show
            when={nodes().length > 0}
            fallback={<p class="diagram-insert-hint">No nodes found in this mind map.</p>}
          >
            <form onSubmit={handleInsertNode}>
              <div class="new-modal-field">
                <label class="new-modal-label" for="mm-parent">Parent</label>
                <select
                  id="mm-parent"
                  class="new-modal-input"
                  value={parentLabel()}
                  onChange={(e) => setParentLabel(e.currentTarget.value)}
                >
                  <option value="">— select —</option>
                  <For each={nodes()}>
                    {(n) => (
                      <option value={n.label}>{nodeDisplayLabel(n.label, n.depth)}</option>
                    )}
                  </For>
                </select>
              </div>
              <div class="new-modal-field">
                <label class="new-modal-label" for="mm-label">Label</label>
                <input
                  id="mm-label"
                  class="new-modal-input"
                  type="text"
                  value={childLabel()}
                  onInput={(e) => setChildLabel(e.currentTarget.value)}
                  placeholder="Node label"
                  autofocus
                />
              </div>
              <div class="modal-actions">
                <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
                <button type="submit" class="btn-primary" disabled={!parentLabel() || !childLabel().trim()}>
                  Insert
                </button>
              </div>
            </form>
          </Show>
          <Show when={nodes().length === 0}>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
            </div>
          </Show>
        </Show>

        {/* ── Backlink form ── */}
        <Show when={mode() === "backlink"}>
          <Show
            when={nodes().length >= 1}
            fallback={<p class="diagram-insert-hint">Add at least one node before linking.</p>}
          >
            <Show
              when={props.wikiFiles.length >= 1}
              fallback={<p class="diagram-insert-hint">No wiki pages found.</p>}
            >
              <form onSubmit={handleInsertBacklink}>
                <div class="new-modal-field">
                  <label class="new-modal-label" for="mm-link-node">Node</label>
                  <select
                    id="mm-link-node"
                    class="new-modal-input"
                    value={linkNodeLabel()}
                    onChange={(e) => setLinkNodeLabel(e.currentTarget.value)}
                  >
                    <option value="">— select —</option>
                    <For each={nodes()}>
                      {(n) => (
                        <option value={n.label}>
                          {nodeDisplayLabel(n.label, n.depth)}
                          {existingLinks().has(n.label) ? " (linked)" : ""}
                        </option>
                      )}
                    </For>
                  </select>
                </div>
                <div class="new-modal-field">
                  <label class="new-modal-label" for="mm-link-wiki">Wiki page</label>
                  <select
                    id="mm-link-wiki"
                    class="new-modal-input"
                    value={linkWikiFile()}
                    onChange={(e) => setLinkWikiFile(e.currentTarget.value)}
                  >
                    <option value="">— select —</option>
                    <For each={props.wikiFiles}>
                      {(f) => <option value={f}>{wikiDisplayName(f)}</option>}
                    </For>
                  </select>
                </div>
                <div class="modal-actions">
                  <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
                  <button type="submit" class="btn-primary" disabled={!linkNodeLabel() || !linkWikiFile()}>
                    {existingLinks().has(linkNodeLabel()) ? "Update" : "Link"}
                  </button>
                </div>
              </form>
            </Show>
          </Show>
          <Show when={nodes().length < 1 || props.wikiFiles.length < 1}>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default MindmapInsertModal;
