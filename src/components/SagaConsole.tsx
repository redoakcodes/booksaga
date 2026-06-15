import {
  createEffect,
  createSignal,
  For,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import type { AiConfig } from "../lib/ai";
import { SAGA_GREETING } from "../lib/saga";
import { drainChannel } from "../lib/anthropic";

const md = new MarkdownIt({ breaks: true, linkify: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SagaEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string; is_error: boolean }
  | { type: "confirm_needed"; tool: string; args: Record<string, unknown> }
  | { type: "notice"; text: string }
  | { type: "navigate"; chapter: string; text?: string }
  | { type: "error"; message: string }
  | { type: "done" };

type DisplayMessage =
  | { kind: "user"; content: string }
  | { kind: "saga"; content: string; streaming?: boolean }
  | { kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; name: string; result: string; isError: boolean }
  | { kind: "notice"; content: string };

interface Props {
  open: boolean;
  onToggle: () => void;
  aiConfig: AiConfig;
  currentFile: string | null;
  onNavigate?: (chapter: string, text?: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summariseArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
    .filter(([k]) => k !== "content")
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  const joined = entries.join(", ");
  return joined.length > 60 ? joined.slice(0, 57) + "…" : joined;
}

function firstLine(text: string, max = 80): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SagaConsole: Component<Props> = (props) => {
  const [messages, setMessages] = createSignal<DisplayMessage[]>([
    { kind: "saga", content: SAGA_GREETING },
  ]);
  const [input, setInput] = createSignal("");
  const [generating, setGenerating] = createSignal(false);
  const [pendingConfirm, setPendingConfirm] = createSignal<{
    tool: string;
    args: Record<string, unknown>;
  } | null>(null);
  const [sessionId, setSessionId] = createSignal<number | null>(null);

  let inputRef!: HTMLTextAreaElement;
  let historyRef!: HTMLDivElement;

  // -- Session ---------------------------------------------------------------

  async function startNewSession() {
    try {
      const id = await invoke<number>("new_saga_session");
      setSessionId(id);
      setMessages([{ kind: "saga", content: SAGA_GREETING }]);
    } catch {
      // Not running in Tauri — session stays null, Saga input stays disabled
    }
  }

  onMount(() => {
    startNewSession();
  });

  // -- Confirmation ----------------------------------------------------------

  async function resolveConfirm(yes: boolean) {
    setPendingConfirm(null);
    await invoke("resolve_saga_confirm", { confirmed: yes });
  }

  // -- Scroll ----------------------------------------------------------------

  function scrollToBottom() {
    if (historyRef) historyRef.scrollTop = historyRef.scrollHeight;
  }

  // -- Streaming helpers -----------------------------------------------------

  function ensureStreamingPlaceholder() {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last?.kind === "saga" && last.streaming) return m;
      return [...m, { kind: "saga", content: "", streaming: true }];
    });
  }

  function finalizeStreaming() {
    setMessages((m) => {
      const updated = [...m];
      const last = updated[updated.length - 1];
      if (last?.kind === "saga" && last.streaming) {
        if (last.content === "") {
          updated.pop();
        } else {
          updated[updated.length - 1] = { ...last, streaming: false };
        }
      }
      return updated;
    });
  }

  // -- Focus -----------------------------------------------------------------

  createEffect(() => {
    if (props.open) setTimeout(() => inputRef?.focus(), 50);
  });

  createEffect(() => {
    messages();
    scrollToBottom();
  });

  // -- Submit ----------------------------------------------------------------

  async function handleSubmit() {
    const text = input().trim();
    const sid = sessionId();
    if (!text || generating() || sid === null) return;
    setInput("");

    setMessages((m) => [...m, { kind: "user", content: text }]);
    ensureStreamingPlaceholder();
    setGenerating(true);

    const cfg = props.aiConfig.sagaModelConfig;

    try {
      for await (const event of drainChannel<SagaEvent>((ch) =>
        invoke("saga_turn", {
          sessionId: sid,
          userMessage: text,
          currentFile: props.currentFile ?? null,
          provider: cfg.provider,
          model: cfg.model,
          endpoint: cfg.endpoint ?? null,
          apiKey: props.aiConfig.apiKey ?? null,
          braveApiKey: props.aiConfig.braveApiKey ?? null,
          onEvent: ch,
        }),
      )) {
        handleEvent(event);
        scrollToBottom();
      }
    } catch (e) {
      finalizeStreaming();
      setMessages((m) => [
        ...m,
        {
          kind: "saga",
          content: e instanceof Error ? e.message : "An error occurred.",
        },
      ]);
    } finally {
      setGenerating(false);
      inputRef?.focus();
    }
  }

  function handleEvent(event: SagaEvent) {
    switch (event.type) {
      case "text":
        ensureStreamingPlaceholder();
        setMessages((m) => {
          const updated = [...m];
          const last = updated[updated.length - 1];
          if (last?.kind === "saga" && last.streaming) {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + event.text,
            };
          }
          return updated;
        });
        break;

      case "tool_call":
        finalizeStreaming();
        setMessages((m) => [
          ...m,
          { kind: "tool_call", name: event.name, args: event.args },
        ]);
        break;

      case "tool_result":
        setMessages((m) => [
          ...m,
          {
            kind: "tool_result",
            name: event.name,
            result: event.result,
            isError: event.is_error,
          },
        ]);
        break;

      case "confirm_needed":
        setPendingConfirm({ tool: event.tool, args: event.args });
        break;

      case "notice":
        finalizeStreaming();
        setMessages((m) => [...m, { kind: "notice", content: event.text }]);
        break;

      case "navigate":
        props.onNavigate?.(event.chapter, event.text);
        break;

      case "error":
        finalizeStreaming();
        setMessages((m) => [
          ...m,
          { kind: "saga", content: `Error: ${event.message}` },
        ]);
        break;

      case "done":
        finalizeStreaming();
        break;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") props.onToggle();
  }

  // -- Render ----------------------------------------------------------------

  return (
    <>
      <div class="saga-panel" classList={{ open: props.open }}>
        <div class="saga-inner">
          <div class="saga-history" ref={historyRef}>
            <For each={messages()}>
              {(msg) => {
                if (msg.kind === "user") {
                  return (
                    <div class="saga-message saga-message--user">
                      <span class="saga-message-label">You</span>
                      <span class="saga-message-text">{msg.content}</span>
                    </div>
                  );
                }
                if (msg.kind === "saga") {
                  return (
                    <div class="saga-message saga-message--saga">
                      <span class="saga-message-label">Saga</span>
                      <Show
                        when={!msg.streaming}
                        fallback={
                          <span class="saga-message-text">
                            {msg.content || null}
                            <span class="saga-cursor" />
                          </span>
                        }
                      >
                        <span
                          class="saga-message-text saga-message-text--md"
                          innerHTML={md.render(msg.content)}
                        />
                      </Show>
                    </div>
                  );
                }
                if (msg.kind === "tool_call") {
                  return (
                    <div class="saga-tool-call">
                      <span class="saga-tool-icon">⚙</span>
                      <span class="saga-tool-name">{msg.name}</span>
                      <span class="saga-tool-args">
                        {summariseArgs(msg.args)}
                      </span>
                    </div>
                  );
                }
                if (msg.kind === "tool_result") {
                  return (
                    <div
                      class="saga-tool-result"
                      classList={{ "saga-tool-result--error": msg.isError }}
                    >
                      <span class="saga-tool-result-arrow">↳</span>
                      <span class="saga-tool-result-text">
                        {firstLine(msg.result)}
                      </span>
                    </div>
                  );
                }
                if (msg.kind === "notice") {
                  return <div class="saga-notice">{msg.content}</div>;
                }
              }}
            </For>
          </div>

          <Show when={pendingConfirm()}>
            {(confirm) => (
              <div class="saga-confirm">
                <p class="saga-confirm-label">
                  Saga wants to{" "}
                  <strong>{confirm().tool.replace(/_/g, " ")}</strong>:
                </p>
                <pre class="saga-confirm-args">
                  {summariseArgs(confirm().args)}
                </pre>
                <div class="saga-confirm-actions">
                  <button
                    class="btn-secondary"
                    onClick={() => resolveConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    class="btn-primary"
                    onClick={() => resolveConfirm(true)}
                  >
                    Allow
                  </button>
                </div>
              </div>
            )}
          </Show>

          <div class="saga-input-row">
            <span class="saga-prompt-char">&gt;</span>
            <textarea
              ref={inputRef}
              class="saga-input"
              placeholder="Ask Saga… (Enter to send, Shift+Enter for newline)"
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={generating()}
            />
            <button
              class="saga-clear-btn"
              title="Clear conversation"
              disabled={generating()}
              onClick={() => startNewSession()}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      <button
        class="saga-tab"
        classList={{ open: props.open }}
        onClick={() => props.onToggle()}
      >
        {props.open ? "Hide Saga" : "Saga Console"}
      </button>
    </>
  );
};

export default SagaConsole;
