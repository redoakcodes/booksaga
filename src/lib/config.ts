/** Project config — stored as JSON at .booksaga/config.json */

import type { IFileSystem } from "./filesystem";

export const CONFIG_DIR = ".booksaga";
export const CONFIG_FILE = "config.json";

export interface ProjectConfig {
  title: string;
  author: string;
}

export interface LLMConfig {
  model: string;
  apiKey: string;
}

export interface Config {
  project: ProjectConfig;
  llm: LLMConfig;
}

export const CONFIG_DEFAULTS: Config = {
  project: { title: "Untitled Project", author: "" },
  llm: { model: "claude-opus-4-7", apiKey: "" },
};

export function parseConfig(text: string | null): Config {
  if (!text) return structuredClone(CONFIG_DEFAULTS);
  try {
    const raw = JSON.parse(text);
    return {
      project: {
        title: raw.project?.title ?? CONFIG_DEFAULTS.project.title,
        author: raw.project?.author ?? CONFIG_DEFAULTS.project.author,
      },
      llm: {
        model: raw.llm?.model ?? CONFIG_DEFAULTS.llm.model,
        apiKey: raw.llm?.apiKey ?? "",
      },
    };
  } catch {
    return structuredClone(CONFIG_DEFAULTS);
  }
}

export async function loadConfig(fs: IFileSystem): Promise<Config> {
  const text = await fs.readFile(CONFIG_DIR, CONFIG_FILE);
  return parseConfig(text);
}

export async function saveConfig(fs: IFileSystem, config: Config): Promise<void> {
  const data: Record<string, unknown> = {
    project: config.project,
    llm: { model: config.llm.model },
  };
  if (config.llm.apiKey) data.llm = { ...(data.llm as object), apiKey: config.llm.apiKey };
  await fs.writeFile([CONFIG_DIR, CONFIG_FILE], JSON.stringify(data, null, 2) + "\n");
}
