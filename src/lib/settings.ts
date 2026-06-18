import { invoke } from "@tauri-apps/api/core";

export type Theme =
  | "dark"
  | "light"
  | "scifi"
  | "noire"
  | "fantasy"
  | "cyberpunk"
  | "romance"
  | "horror";

export type Provider = "anthropic" | "ollama" | "lmstudio";

export interface ModelConfig {
  provider: Provider;
  model: string;
  endpoint?: string; // Ollama only; defaults to http://localhost:11434
}

export interface LlmSettings {
  model?: ModelConfig; // base fallback for both tasks
  sagaModel?: ModelConfig; // overrides model for Saga chat
  exerciseModel?: ModelConfig; // overrides model for writing exercises
}

export interface AppSettings {
  theme: Theme;
  llm: LlmSettings;
}

/** API keys — stored in OS keychain, never written to disk. */
export interface Credentials {
  anthropicApiKey?: string;
  braveApiKey?: string;
}

const VALID_THEMES = new Set<string>([
  "dark",
  "light",
  "scifi",
  "noire",
  "fantasy",
  "cyberpunk",
  "romance",
  "horror",
]);

const DEFAULTS: AppSettings = { theme: "dark", llm: {} };

function parseModelConfig(raw: unknown): ModelConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const provider: Provider =
    r.provider === "ollama"
      ? "ollama"
      : r.provider === "lmstudio"
        ? "lmstudio"
        : "anthropic";
  const model = typeof r.model === "string" ? r.model.trim() : "";
  if (!model) return undefined;
  const endpoint =
    typeof r.endpoint === "string" ? r.endpoint.trim() || undefined : undefined;
  return { provider, model, endpoint };
}

function parseLlmSettings(raw: unknown): LlmSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    model: parseModelConfig(r.model),
    sagaModel: parseModelConfig(r.sagaModel),
    exerciseModel: parseModelConfig(r.exerciseModel),
  };
}

function parseSettings(json: string): AppSettings {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      theme: VALID_THEMES.has(raw.theme as string)
        ? (raw.theme as Theme)
        : "dark",
      llm: parseLlmSettings(raw.llm),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const json = await invoke<string>("load_app_settings");
    return parseSettings(json);
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_app_settings", {
    json: JSON.stringify(settings, null, 2),
  });
}

export async function loadCredentials(): Promise<Credentials> {
  try {
    const [anthropicApiKey, braveApiKey] = await Promise.all([
      invoke<string | null>("get_credential", { key: "anthropicApiKey" }),
      invoke<string | null>("get_credential", { key: "braveApiKey" }),
    ]);
    return {
      anthropicApiKey: anthropicApiKey ?? undefined,
      braveApiKey: braveApiKey ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  await Promise.all([
    invoke("set_credential", {
      key: "anthropicApiKey",
      value: creds.anthropicApiKey ?? "",
    }),
    invoke("set_credential", {
      key: "braveApiKey",
      value: creds.braveApiKey ?? "",
    }),
  ]);
}

/** Pick the model config for a given task, falling back through saga/exercise
 *  overrides → base model → hardcoded defaults. */
export function resolveModel(
  llm: LlmSettings | undefined,
  task: "saga" | "exercise",
): ModelConfig {
  const override = task === "saga" ? llm?.sagaModel : llm?.exerciseModel;
  if (override) return override;
  if (llm?.model) return llm.model;
  return {
    provider: "anthropic",
    model: task === "saga" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
  };
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
