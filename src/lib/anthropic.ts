import { Channel, invoke } from "@tauri-apps/api/core";
import type { ModelConfig } from "./settings";

export type LlmStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "final_message"; json: string }
  | { type: "tools_not_supported" };

/** @deprecated use LlmStreamEvent */
export type AnthropicStreamEvent = LlmStreamEvent;

export interface ContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface AnthropicMessage {
  id: string;
  role: "assistant";
  content: ContentBlock[];
  stop_reason: string | null;
}

/** Bridges a Tauri Channel to an async generator. */
export async function* drainChannel<T>(
  startFn: (ch: Channel<T>) => Promise<void>,
): AsyncGenerator<T> {
  const queue: T[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  let error: unknown = null;

  const channel = new Channel<T>();
  channel.onmessage = (msg) => {
    queue.push(msg);
    resolve?.();
    resolve = null;
  };

  startFn(channel)
    .then(() => {
      done = true;
      resolve?.();
      resolve = null;
    })
    .catch((e) => {
      error = e;
      done = true;
      resolve?.();
      resolve = null;
    });

  while (true) {
    while (queue.length > 0) yield queue.shift()!;
    if (done) {
      while (queue.length > 0) yield queue.shift()!;
      break;
    }
    await new Promise<void>((r) => {
      resolve = r;
    });
  }

  if (error !== null)
    throw error instanceof Error ? error : new Error(String(error));
}

/** Stream a single Anthropic API request. */
export async function* streamAnthropicRequest(
  apiKey: string,
  model: string,
  system: string,
  messages: unknown[],
  tools: unknown[],
): AsyncGenerator<LlmStreamEvent> {
  yield* drainChannel<LlmStreamEvent>((ch) =>
    invoke("anthropic_stream", {
      apiKey,
      model,
      system,
      messagesJson: JSON.stringify(messages),
      toolsJson: JSON.stringify(tools),
      onEvent: ch,
    }),
  );
}

/** Stream a request routed by provider. */
export async function* streamLlmRequest(
  modelConfig: ModelConfig,
  apiKey: string | undefined,
  system: string,
  messages: unknown[],
  tools: unknown[],
): AsyncGenerator<LlmStreamEvent> {
  if (modelConfig.provider === "anthropic") {
    if (!apiKey) {
      throw new Error(
        "No Anthropic API key configured. Add your key in Menu → Settings.",
      );
    }
    yield* streamAnthropicRequest(
      apiKey,
      modelConfig.model,
      system,
      messages,
      tools,
    );
  } else {
    const endpoint = modelConfig.endpoint ?? "http://localhost:11434";
    yield* drainChannel<LlmStreamEvent>((ch) =>
      invoke("ollama_stream", {
        endpoint,
        model: modelConfig.model,
        system,
        messagesJson: JSON.stringify(messages),
        toolsJson: JSON.stringify(tools),
        onEvent: ch,
      }),
    );
  }
}
