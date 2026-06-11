import { streamAnthropicRequest } from "./anthropic";

export interface PromptEntry {
  name: string;
  prompt: string;
}

export interface AiConfig {
  anthropicApiKey?: string;
  braveApiKey?: string;
}

export async function* streamExercise(
  prompt: string,
  config: AiConfig,
  context?: string,
): AsyncGenerator<string> {
  if (!config.anthropicApiKey) {
    throw new Error(
      "No Anthropic API key configured. Add your key in Menu → Settings.",
    );
  }

  const content = context
    ? `${prompt}\n\nProject context (tailor the exercise to this specific project's characters, themes, and world):\n${context}`
    : prompt;

  for await (const event of streamAnthropicRequest(
    config.anthropicApiKey,
    "claude-haiku-4-5-20251001",
    "",
    [{ role: "user", content }],
    [],
  )) {
    if (event.type === "text_delta") yield event.text;
  }
}
