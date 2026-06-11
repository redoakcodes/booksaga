import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiConfig } from "../lib/ai";
import type { AgentEvent, ApiMessage } from "../lib/saga";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
  },
  invoke: vi.fn(),
}));

import { streamSaga } from "../lib/saga";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

type FakeChannel = { onmessage: ((msg: unknown) => void) | null };

function simulateStream(events: unknown[]) {
  mockInvoke.mockImplementationOnce(async (_cmd, args) => {
    const ch = (args as Record<string, unknown>).onEvent as FakeChannel;
    for (const e of events) ch.onmessage?.(e);
  });
}

function finalMessage(
  text: string,
  toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [],
) {
  const content: unknown[] = [];
  if (text) content.push({ type: "text", text });
  for (const t of toolUses) content.push({ type: "tool_use", ...t });
  return {
    type: "final_message",
    json: JSON.stringify({ id: "msg_1", role: "assistant", content, stop_reason: toolUses.length ? "tool_use" : "end_turn" }),
  };
}

const config: AiConfig = { anthropicApiKey: "sk-test" };
const noConfirm = async () => false;

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("streamSaga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no API key is configured", async () => {
    const gen = streamSaga([], {}, null, null, noConfirm);
    await expect(gen.next()).rejects.toThrow("No Anthropic API key");
  });

  it("yields text events then done for a simple response", async () => {
    simulateStream([
      { type: "text_delta", text: "Hello!" },
      finalMessage("Hello!"),
    ]);

    const events = await collectEvents(
      streamSaga([{ role: "user", content: "Hi" }], config, null, null, noConfirm),
    );

    expect(events.some((e) => e.type === "text" && (e as { text: string }).text === "Hello!")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("appends assistant message to apiMessages", async () => {
    simulateStream([finalMessage("Response")]);
    const messages: ApiMessage[] = [{ role: "user", content: "Hello" }];

    for await (const _ of streamSaga(messages, config, null, null, noConfirm)) { /* drain */ }

    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
  });

  it("uses claude-sonnet as the model", async () => {
    simulateStream([finalMessage("ok")]);
    for await (const _ of streamSaga([], config, null, null, noConfirm)) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(args.model).toContain("sonnet");
  });

  it("includes no tools when model is null", async () => {
    simulateStream([finalMessage("ok")]);
    for await (const _ of streamSaga([], config, null, null, noConfirm)) { /* drain */ }

    const args = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    const tools = JSON.parse(args.toolsJson as string) as unknown[];
    expect(tools).toEqual([]);
  });

  it("yields tool_call and tool_result events, then loops for second response", async () => {
    simulateStream([
      { type: "text_delta", text: "Let me check." },
      finalMessage("Let me check.", [{ id: "t1", name: "list_wiki_pages", input: {} }]),
    ]);
    simulateStream([finalMessage("Done!")]);

    // Minimal mock model
    const fakeModel = {
      wikiFiles: [],
      exerciseFiles: [],
      chapters: [],
      fs: { readFile: async () => null, writeFile: async () => {} },
    };

    const events = await collectEvents(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      streamSaga([{ role: "user", content: "List pages" }], config, fakeModel as any, null, noConfirm),
    );

    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("does not execute write tools when confirm returns false", async () => {
    simulateStream([
      finalMessage("", [{ id: "t1", name: "create_wiki_page", input: { name: "elara", content: "# Elara" } }]),
    ]);
    simulateStream([finalMessage("Cancelled.")]);

    const written: string[] = [];
    const fakeModel = {
      wikiFiles: [],
      exerciseFiles: [],
      chapters: [],
      fs: {
        readFile: async () => null,
        writeFile: async (parts: string[]) => { written.push(parts.join("/")); },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const _ of streamSaga([], config, fakeModel as any, null, async () => false)) { /* drain */ }

    expect(written).toHaveLength(0);
  });
});
