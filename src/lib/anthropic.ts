import { Channel, invoke } from "@tauri-apps/api/core";

export type AnthropicStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "final_message"; json: string };

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

  if (error !== null) throw error instanceof Error ? error : new Error(String(error));
}

/** Stream a single Anthropic API request, yielding events as they arrive. */
export async function* streamAnthropicRequest(
  apiKey: string,
  model: string,
  system: string,
  messages: unknown[],
  tools: unknown[],
): AsyncGenerator<AnthropicStreamEvent> {
  yield* drainChannel<AnthropicStreamEvent>((ch) =>
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
