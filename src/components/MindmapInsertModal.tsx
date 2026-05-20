import { createSignal, For, Show, type Component } from "solid-js";
import { appendMindmapNode, parseMindmapNodes } from "../lib/mindmap";

interface Props {
  source: string;
  onInsert: (newSource: string) => void;
  onCancel: () => void;
}

const MindmapInsertModal: Component<Props> = (props) => {
  const nodes = () => parseMindmapNodes(props.source);
  const [parentLabel, setParentLabel] = createSignal("");
  const [childLabel, setChildLabel] = createSignal("");

  function handleInsert(e: Event) {
    e.preventDefault();
    const parent = parentLabel();
    const child = childLabel().trim();
    if (!parent || !child) return;
    props.onInsert(appendMindmapNode(props.source, parent, child));
  }

  function nodeDisplayLabel(label: string, depth: number): string {
    return "  ".repeat(depth) + label;
  }

  return (
    <div class="modal-overlay" onClick={props.onCancel}>
      <div class="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">Insert Node</h2>

        <Show
          when={nodes().length > 0}
          fallback={<p class="diagram-insert-hint">No nodes found in this mind map.</p>}
        >
          <form onSubmit={handleInsert}>
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
      </div>
    </div>
  );
};

export default MindmapInsertModal;
