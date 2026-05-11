import { createSignal, For, Show, type Component } from "solid-js";
import type { PromptEntry } from "../lib/ai";
import { streamExercise } from "../lib/ai";

interface Props {
  prompts: PromptEntry[];
  onCreate: (exerciseText: string) => void;
  onCancel: () => void;
}

type GenState = "idle" | "generating" | "done";

const ExerciseNewModal: Component<Props> = (props) => {
  const [promptIdx, setPromptIdx] = createSignal(0);
  const [genState, setGenState] = createSignal<GenState>("idle");
  const [result, setResult] = createSignal("");

  async function generate() {
    const entry = props.prompts[promptIdx()];
    if (!entry) return;
    setResult("");
    setGenState("generating");
    try {
      for await (const chunk of streamExercise(entry.prompt)) {
        setResult((r) => r + chunk);
      }
      setGenState("done");
    } catch {
      setGenState("idle");
    }
  }

  return (
    <div class="modal-overlay" onClick={props.onCancel}>
      <div class="modal-box exercise-modal" onClick={(e) => e.stopPropagation()}>
        <h2 class="modal-title">New Exercise</h2>

        <div class="new-modal-field">
          <label class="new-modal-label" for="exercise-prompt">Prompt</label>
          <select
            id="exercise-prompt"
            class="new-modal-input"
            disabled={genState() !== "idle"}
            onChange={(e) => setPromptIdx(+e.currentTarget.value)}
          >
            <For each={props.prompts}>
              {(p, i) => <option value={i()}>{p.name}</option>}
            </For>
          </select>
        </div>

        <div class="exercise-result" classList={{ "exercise-result--active": genState() !== "idle" }}>
          <Show when={genState() === "generating" && !result()}>
            <div class="exercise-loading">
              <span class="loading-dot" />
              <span class="loading-dot" />
              <span class="loading-dot" />
            </div>
          </Show>
          <Show when={result()}>
            <p class="exercise-result-text">{result()}</p>
          </Show>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={props.onCancel}>Cancel</button>
          <Show when={genState() === "done"}>
            <button class="btn-secondary" onClick={generate}>Regenerate</button>
            <button class="btn-primary" onClick={() => props.onCreate(result())}>Create</button>
          </Show>
          <Show when={genState() !== "done"}>
            <button
              class="btn-primary"
              disabled={genState() === "generating"}
              onClick={generate}
            >
              Generate
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ExerciseNewModal;
