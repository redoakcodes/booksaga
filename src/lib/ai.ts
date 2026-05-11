import Anthropic from "@anthropic-ai/sdk";

export interface PromptEntry {
  name: string;
  prompt: string;
}

/** Provider credentials. Extend here when adding Ollama or other backends. */
export interface AiConfig {
  anthropicApiKey?: string;
}

/**
 * Stream a generated writing exercise for the given prompt.
 * Uses Anthropic when an API key is present; throws a descriptive error otherwise.
 */
export async function* streamExercise(
  prompt: string,
  config: AiConfig,
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

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const text of stream.textStream) {
    yield text;
  }
}
