import { createSignal, For, Show, type Component } from "solid-js";
import type { PromptEntry, AiConfig } from "../lib/ai";
import { streamExercise } from "../lib/ai";
import type { ProjectModel } from "../lib/project";
import { buildExerciseContext } from "../lib/project";

interface Props {
  prompts: PromptEntry[];
  aiConfig: AiConfig;
  model: ProjectModel | null;
  onCreate: (exerciseText: string) => void;
  onCancel: () => void;
}

type GenState = "idle" | "generating" | "done";

const ExerciseNewModal: Component<Props> = (props) => {
  const [promptIdx, setPromptIdx] = createSignal(0);
  const [genState, setGenState] = createSignal<GenState>("idle");
  const [result, setResult] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  async function generate() {
    const entry = props.prompts[promptIdx()];
    if (!entry) return;
    setResult("");
    setError(null);
    setGenState("generating");
    try {
      const context = props.model ? await buildExerciseContext(props.model) : undefined;
      for await (const chunk of streamExercise(entry.prompt, props.aiConfig, context)) {
        setResult((r) => r + chunk);
      }
      setGenState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
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
            disabled={genState() === "generating"}
            onChange={(e) => setPromptIdx(+e.currentTarget.value)}
          >
            <For each={props.prompts}>
              {(p, i) => <option value={i()}>{p.name}</option>}
            </For>
          </select>
        </div>

        <div class="exercise-result" classList={{ "exercise-result--active": genState() !== "idle" || !!error() }}>
          <Show when={error()}>
            <p class="exercise-result-error">{error()}</p>
          </Show>
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
