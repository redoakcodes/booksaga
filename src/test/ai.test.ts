import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiConfig } from "../lib/ai";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
  },
  invoke: vi.fn(),
}));

import { streamExercise } from "../lib/ai";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

type FakeChannel = { onmessage: ((msg: unknown) => void) | null };

function simulateStream(events: unknown[]) {
  mockInvoke.mockImplementation(async (_cmd, args) => {
    const ch = (args as Record<string, unknown>).onEvent as FakeChannel;
    for (const e of events) ch.onmessage?.(e);
  });
}

const finalMessage = (text: string) => ({
  type: "final_message",
  json: JSON.stringify({
    id: "msg_1",
    role: "assistant",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  }),
});

describe("streamExercise", () => {
  const config: AiConfig = { anthropicApiKey: "sk-test" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no API key is configured", async () => {
    const gen = streamExercise("Write something", {});
    await expect(gen.next()).rejects.toThrow("No Anthropic API key");
  });

  it("yields text_delta chunks from the stream", async () => {
    simulateStream([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " World" },
      finalMessage("Hello World"),
    ]);

    const chunks: string[] = [];
    for await (const chunk of streamExercise("Write", config)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["Hello", " World"]);
  });

  it("ignores final_message events (yields only text)", async () => {
    simulateStream([finalMessage("No text deltas here")]);

    const chunks: string[] = [];
    for await (const chunk of streamExercise("Write", config)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([]);
  });

  it("calls anthropic_stream with the correct command", async () => {
    simulateStream([finalMessage("")]);
    for await (const _ of streamExercise("prompt", config)) { /* drain */ }
    expect(mockInvoke).toHaveBeenCalledWith("anthropic_stream", expect.any(Object));
  });

  it("passes the prompt in the user message", async () => {
    simulateStream([finalMessage("")]);
    for await (const _ of streamExercise("My writing prompt", config)) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    const messages = JSON.parse(args.messagesJson as string) as { role: string; content: string }[];
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("My writing prompt");
  });

  it("appends context to the message when provided", async () => {
    simulateStream([finalMessage("")]);
    for await (const _ of streamExercise("Prompt", config, "context data")) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    const messages = JSON.parse(args.messagesJson as string) as { role: string; content: string }[];
    expect(messages[0].content).toContain("context data");
    expect(messages[0].content).toContain("Prompt");
  });

  it("uses claude-haiku as the model", async () => {
    simulateStream([finalMessage("")]);
    for await (const _ of streamExercise("prompt", config)) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(args.model).toContain("haiku");
  });

  it("passes an empty tools array", async () => {
    simulateStream([finalMessage("")]);
    for await (const _ of streamExercise("prompt", config)) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.parse(args.toolsJson as string)).toEqual([]);
  });
});
