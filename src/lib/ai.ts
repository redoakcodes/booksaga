import { streamLlmRequest } from "./anthropic";
import type { ModelConfig } from "./settings";

export interface PromptEntry {
  name: string;
  prompt: string;
}

export interface AiConfig {
  sagaModelConfig: ModelConfig;
  exerciseModelConfig: ModelConfig;
  apiKey?: string;
  braveApiKey?: string;
}

export async function* streamExercise(
  prompt: string,
  modelConfig: ModelConfig,
  apiKey: string | undefined,
  context?: string,
): AsyncGenerator<string> {
  const content = context
    ? `${prompt}\n\nProject context (tailor the exercise to this specific project's characters, themes, and world):\n${context}`
    : prompt;

  for await (const event of streamLlmRequest(
    modelConfig,
    apiKey,
    "",
    [{ role: "user", content }],
    [],
  )) {
    if (event.type === "text_delta") yield event.text;
  }
}
