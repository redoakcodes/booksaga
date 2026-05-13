import { createSignal, For, Show, type Component } from "solid-js";
import {
  appendEdge,
  appendNode,
  nextNodeId,
  parseFlowNodes,
  type EdgeStyle,
  type NodeShape,
} from "../lib/flowchart";

type Mode = "node" | "edge";

interface Props {
  initialMode: Mode;
  source: string;
  onInsert: (newSource: string) => void;
  onCancel: () => void;
}

const NODE_SHAPES: { value: NodeShape; label: string }[] = [
  { value: "rectangle", label: "Rectangle" },
  { value: "rounded",   label: "Rounded" },
  { value: "diamond",   label: "Diamond" },
  { value: "cylinder",  label: "Cylinder" },
  { value: "circle",    label: "Circle" },
];

const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: "solid",  label: "Solid" },
  { value: "dotted", label: "Dotted" },
  { value: "thick",  label: "Thick" },
];

const FlowchartInsertModal: Component<Props> = (props) => {
  const [mode, setMode] = createSignal<Mode>(props.initialMode);

  // Node form
  const [nodeLabel, setNodeLabel] = createSignal("");
  const [nodeShape, setNodeShape] = createSignal<NodeShape>("rectangle");

  // Edge form
  const nodes = () => parseFlowNodes(props.source);
  const [fromId, setFromId] = createSignal("");
  const [toId, setToId] = createSignal("");
  const [edgeLabel, setEdgeLabel] = createSignal("");
  const [edgeStyle, setEdgeStyle] = createSignal<EdgeStyle>("solid");

  function handleInsertNode(e: Event) {
    e.preventDefault();
    const label = nodeLabel().trim();
    if (!label) return;
    const id = nextNodeId(props.source);
    props.onInsert(appendNode(props.source, id, label, nodeShape()));
  }

  function handleInsertEdge(e: Event) {
    e.preventDefault();
    const from = fromId();
    const to = toId();
    if (!from || !to) return;
    props.onInsert(appendEdge(props.source, from, to, edgeLabel().trim(), edgeStyle()));
  }

  const canInsertEdge = () => {
    const ns = nodes();
    return ns.length >= 2 && fromId() && toId() && fromId() !== toId();
  };

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
            class={`new-modal-type-btn${mode() === "edge" ? " active" : ""}`}
            onClick={() => setMode("edge")}
          >
            Edge
          </button>
        </div>

        <Show when={mode() === "node"}>
          <form onSubmit={handleInsertNode}>
            <div class="new-modal-field">
              <label class="new-modal-label" for="node-label">Label</label>
              <input
                id="node-label"
                class="new-modal-input"
                type="text"
                value={nodeLabel()}
                onInput={(e) => setNodeLabel(e.currentTarget.value)}
                placeholder="Node label"
                autofocus
              />
            </div>
            <div class="new-modal-field">
              <label class="new-modal-label" for="node-shape">Shape</label>
              <select
                id="node-shape"
                class="new-modal-input"
                value={nodeShape()}
                onChange={(e) => setNodeShape(e.currentTarget.value as NodeShape)}
              >
                <For each={NODE_SHAPES}>
                  {(s) => <option value={s.value}>{s.label}</option>}
                </For>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
              <button type="submit" class="btn-primary" disabled={!nodeLabel().trim()}>Insert</button>
            </div>
          </form>
        </Show>

        <Show when={mode() === "edge"}>
          <Show
            when={nodes().length >= 2}
            fallback={
              <p class="diagram-insert-hint">Add at least two nodes before connecting them.</p>
            }
          >
            <form onSubmit={handleInsertEdge}>
              <div class="new-modal-field">
                <label class="new-modal-label" for="edge-from">From</label>
                <select
                  id="edge-from"
                  class="new-modal-input"
                  value={fromId()}
                  onChange={(e) => setFromId(e.currentTarget.value)}
                >
                  <option value="">— select —</option>
                  <For each={nodes()}>
                    {(n) => <option value={n.id}>{n.label}</option>}
                  </For>
                </select>
              </div>
              <div class="new-modal-field">
                <label class="new-modal-label" for="edge-to">To</label>
                <select
                  id="edge-to"
                  class="new-modal-input"
                  value={toId()}
                  onChange={(e) => setToId(e.currentTarget.value)}
                >
                  <option value="">— select —</option>
                  <For each={nodes()}>
                    {(n) => <option value={n.id}>{n.label}</option>}
                  </For>
                </select>
              </div>
              <div class="new-modal-field">
                <label class="new-modal-label" for="edge-label">Label</label>
                <input
                  id="edge-label"
                  class="new-modal-input"
                  type="text"
                  value={edgeLabel()}
                  onInput={(e) => setEdgeLabel(e.currentTarget.value)}
                  placeholder="Optional"
                />
              </div>
              <div class="new-modal-field">
                <label class="new-modal-label" for="edge-style">Style</label>
                <select
                  id="edge-style"
                  class="new-modal-input"
                  value={edgeStyle()}
                  onChange={(e) => setEdgeStyle(e.currentTarget.value as EdgeStyle)}
                >
                  <For each={EDGE_STYLES}>
                    {(s) => <option value={s.value}>{s.label}</option>}
                  </For>
                </select>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
                <button type="submit" class="btn-primary" disabled={!canInsertEdge()}>Insert</button>
              </div>
            </form>
          </Show>
          <Show when={nodes().length < 2}>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" onClick={props.onCancel}>Cancel</button>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FlowchartInsertModal;
