import Anthropic from "@anthropic-ai/sdk";

export interface PromptEntry {
  name: string;
  prompt: string;
}

/** Provider credentials. Extend here when adding Ollama or other backends. */
export interface AiConfig {
  anthropicApiKey?: string;
  braveApiKey?: string;
}

/**
 * Stream a generated writing exercise for the given prompt.
 * Uses Anthropic when an API key is present; throws a descriptive error otherwise.
 */
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

  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
    dangerouslyAllowBrowser: true,
  });

  const content = context
    ? `${prompt}\n\nProject context (tailor the exercise to this specific project's characters, themes, and world):\n${context}`
    : prompt;

  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
