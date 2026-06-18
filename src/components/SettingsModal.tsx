import { createSignal, Show, untrack, type Component } from "solid-js";
import type {
  AppSettings,
  Credentials,
  LlmSettings,
  ModelConfig,
  Provider,
  Theme,
} from "../lib/settings";

interface Props {
  settings: AppSettings;
  credentials: Credentials;
  onSave: (settings: AppSettings, credentials: Credentials) => void;
  onClose: () => void;
}

type ProviderOrEmpty = Provider | "";

function initModelFields(
  cfg: ModelConfig | undefined,
): [ProviderOrEmpty, string, string] {
  if (!cfg) return ["", "", ""];
  return [cfg.provider, cfg.model, cfg.endpoint ?? ""];
}

function buildModelConfig(
  provider: ProviderOrEmpty,
  model: string,
  endpoint: string,
): ModelConfig | undefined {
  if (!provider || !model.trim()) return undefined;
  return {
    provider,
    model: model.trim(),
    endpoint: endpoint.trim() || undefined,
  };
}

interface ModelFieldsProps {
  idPrefix: string;
  provider: ProviderOrEmpty;
  model: string;
  endpoint: string;
  onProvider: (v: ProviderOrEmpty) => void;
  onModel: (v: string) => void;
  onEndpoint: (v: string) => void;
  showEmpty?: boolean; // show a "— use base —" option
}

const ModelFields: Component<ModelFieldsProps> = (props) => (
  <>
    <div class="new-modal-field">
      <label class="new-modal-label" for={`${props.idPrefix}-provider`}>
        Provider
      </label>
      <select
        id={`${props.idPrefix}-provider`}
        class="new-modal-input"
        value={props.provider}
        onChange={(e) =>
          props.onProvider(e.currentTarget.value as ProviderOrEmpty)
        }
      >
        {props.showEmpty && <option value="">— use base setting —</option>}
        <option value="anthropic">Anthropic</option>
        <option value="ollama">Ollama (local)</option>
        <option value="lmstudio">LM Studio (local)</option>
      </select>
    </div>

    <Show when={props.provider}>
      <div class="new-modal-field">
        <label class="new-modal-label" for={`${props.idPrefix}-model`}>
          Model
        </label>
        <input
          id={`${props.idPrefix}-model`}
          class="new-modal-input"
          type="text"
          value={props.model}
          onInput={(e) => props.onModel(e.currentTarget.value)}
          placeholder={
            props.provider === "ollama"
              ? "llama3.1"
              : props.provider === "lmstudio"
                ? "llama-3.2-3b-instruct"
                : "claude-sonnet-4-6"
          }
          autocomplete="off"
        />
      </div>

      <Show when={props.provider === "ollama" || props.provider === "lmstudio"}>
        <div class="new-modal-field">
          <label class="new-modal-label" for={`${props.idPrefix}-endpoint`}>
            Endpoint
          </label>
          <input
            id={`${props.idPrefix}-endpoint`}
            class="new-modal-input"
            type="text"
            value={props.endpoint}
            onInput={(e) => props.onEndpoint(e.currentTarget.value)}
            placeholder={
              props.provider === "lmstudio"
                ? "http://localhost:1234"
                : "http://localhost:11434"
            }
            autocomplete="off"
          />
        </div>
      </Show>
    </Show>
  </>
);

const SettingsModal: Component<Props> = (props) => {
  const [theme, setTheme] = createSignal<Theme>(
    untrack(() => props.settings.theme),
  );

  const llm = untrack(() => props.settings.llm);
  const [baseProvider, setBaseProvider] = createSignal<ProviderOrEmpty>(
    ...(initModelFields(llm.model).slice(0, 1) as [ProviderOrEmpty]),
  );
  const [baseModel, setBaseModel] = createSignal(initModelFields(llm.model)[1]);
  const [baseEndpoint, setBaseEndpoint] = createSignal(
    initModelFields(llm.model)[2],
  );

  const [sagaProvider, setSagaProvider] = createSignal<ProviderOrEmpty>(
    ...(initModelFields(llm.sagaModel).slice(0, 1) as [ProviderOrEmpty]),
  );
  const [sagaModel, setSagaModel] = createSignal(
    initModelFields(llm.sagaModel)[1],
  );
  const [sagaEndpoint, setSagaEndpoint] = createSignal(
    initModelFields(llm.sagaModel)[2],
  );

  const [exerciseProvider, setExerciseProvider] = createSignal<ProviderOrEmpty>(
    ...(initModelFields(llm.exerciseModel).slice(0, 1) as [ProviderOrEmpty]),
  );
  const [exerciseModel, setExerciseModel] = createSignal(
    initModelFields(llm.exerciseModel)[1],
  );
  const [exerciseEndpoint, setExerciseEndpoint] = createSignal(
    initModelFields(llm.exerciseModel)[2],
  );

  const [anthropicApiKey, setAnthropicApiKey] = createSignal(
    untrack(() => props.credentials.anthropicApiKey ?? ""),
  );
  const [braveApiKey, setBraveApiKey] = createSignal(
    untrack(() => props.credentials.braveApiKey ?? ""),
  );

  const [advancedOpen, setAdvancedOpen] = createSignal(
    !!(llm.sagaModel || llm.exerciseModel),
  );

  function save() {
    const newLlm: LlmSettings = {
      model: buildModelConfig(baseProvider(), baseModel(), baseEndpoint()),
      sagaModel: buildModelConfig(sagaProvider(), sagaModel(), sagaEndpoint()),
      exerciseModel: buildModelConfig(
        exerciseProvider(),
        exerciseModel(),
        exerciseEndpoint(),
      ),
    };
    props.onSave(
      { theme: theme(), llm: newLlm },
      {
        anthropicApiKey: anthropicApiKey().trim() || undefined,
        braveApiKey: braveApiKey().trim() || undefined,
      },
    );
  }

  return (
    <div class="modal-overlay" onClick={() => props.onClose()}>
      <div
        class="modal-box settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="modal-title">Booksaga Settings</h2>

        {/* ── General ── */}
        <h3 class="settings-section-header">General</h3>
        <div class="new-modal-field">
          <label class="new-modal-label" for="settings-theme">
            Theme
          </label>
          <select
            id="settings-theme"
            class="new-modal-input"
            value={theme()}
            onChange={(e) => setTheme(e.currentTarget.value as Theme)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="scifi">Sci-Fi</option>
            <option value="noire">Noire</option>
            <option value="fantasy">Fantasy</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="romance">Romance</option>
            <option value="horror">Horror</option>
          </select>
        </div>

        {/* ── AI ── */}
        <hr class="settings-divider" />
        <h3 class="settings-section-header">AI</h3>

        <ModelFields
          idPrefix="base"
          provider={baseProvider()}
          model={baseModel()}
          endpoint={baseEndpoint()}
          onProvider={setBaseProvider}
          onModel={setBaseModel}
          onEndpoint={setBaseEndpoint}
        />

        <Show when={baseProvider() === "anthropic" || !baseProvider()}>
          <div class="new-modal-field">
            <label class="new-modal-label" for="settings-api-key">
              Anthropic API Key
            </label>
            <input
              id="settings-api-key"
              type="password"
              class="new-modal-input"
              placeholder="sk-ant-…"
              value={anthropicApiKey()}
              onInput={(e) => setAnthropicApiKey(e.currentTarget.value)}
              autocomplete="off"
            />
          </div>
        </Show>

        <div class="new-modal-field">
          <label class="new-modal-label" for="settings-brave-key">
            Brave Search API Key
          </label>
          <input
            id="settings-brave-key"
            type="password"
            class="new-modal-input"
            placeholder="BSA…"
            value={braveApiKey()}
            onInput={(e) => setBraveApiKey(e.currentTarget.value)}
            autocomplete="off"
          />
        </div>

        {/* ── Advanced ── */}
        <hr class="settings-divider" />
        <button
          class="settings-advanced-toggle"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen() ? "▾" : "▸"} Advanced: per-task models
        </button>

        <Show when={advancedOpen()}>
          <div class="settings-advanced">
            <p class="settings-advanced-note">
              Override the AI model for specific tasks. Leave provider blank to
              use the base setting above.
              <br />
              <em>
                Ollama tool use (wiki access) requires a compatible model:
                llama3.1, qwen2.5, etc.
              </em>
            </p>

            <h4 class="settings-subsection-header">Saga Chat</h4>
            <ModelFields
              idPrefix="saga"
              provider={sagaProvider()}
              model={sagaModel()}
              endpoint={sagaEndpoint()}
              onProvider={setSagaProvider}
              onModel={setSagaModel}
              onEndpoint={setSagaEndpoint}
              showEmpty
            />

            <h4 class="settings-subsection-header">Writing Exercises</h4>
            <ModelFields
              idPrefix="exercise"
              provider={exerciseProvider()}
              model={exerciseModel()}
              endpoint={exerciseEndpoint()}
              onProvider={setExerciseProvider}
              onModel={setExerciseModel}
              onEndpoint={setExerciseEndpoint}
              showEmpty
            />
          </div>
        </Show>

        <div class="modal-actions">
          <button class="btn-secondary" onClick={() => props.onClose()}>
            Close
          </button>
          <button class="btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
