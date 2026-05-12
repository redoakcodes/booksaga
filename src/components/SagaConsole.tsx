import { createEffect, createSignal, For, Show, type Component } from "solid-js";
import type { AiConfig } from "../lib/ai";
import { SAGA_GREETING, streamSaga, type ApiMessage } from "../lib/saga";

interface Message {
  role: "saga" | "user";
  content: string;
  streaming?: boolean;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  aiConfig: AiConfig;
}

const SagaConsole: Component<Props> = (props) => {
  const [messages, setMessages] = createSignal<Message[]>([
    { role: "saga", content: SAGA_GREETING },
  ]);
  const [input, setInput] = createSignal("");
  const [generating, setGenerating] = createSignal(false);
  let inputRef!: HTMLTextAreaElement;
  let historyRef!: HTMLDivElement;

  createEffect(() => {
    if (props.open) {
      setTimeout(() => inputRef?.focus(), 50);
    }
  });

  function scrollToBottom() {
    if (historyRef) historyRef.scrollTop = historyRef.scrollHeight;
  }

  createEffect(() => {
    messages(); // track
    scrollToBottom();
  });

  async function handleSubmit() {
    const text = input().trim();
    if (!text || generating()) return;
    setInput("");

    if (text.startsWith("/")) {
      setMessages((m) => [
        ...m,
        { role: "user", content: text },
        {
          role: "saga",
          content: `Unknown command: ${text.split(" ")[0]}. No slash commands are available yet.`,
        },
      ]);
      return;
    }

    setMessages((m) => [...m, { role: "user", content: text }]);

    // Build API history from display messages (skip greeting at index 0)
    const history: ApiMessage[] = messages()
      .slice(1)
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

    // Add streaming placeholder
    setMessages((m) => [...m, { role: "saga", content: "", streaming: true }]);
    setGenerating(true);

    try {
      for await (const chunk of streamSaga(history, props.aiConfig)) {
        setMessages((m) => {
          const updated = [...m];
          const last = updated[updated.length - 1];
          if (last?.streaming) {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
        scrollToBottom();
      }
      setMessages((m) => {
        const updated = [...m];
        const last = updated[updated.length - 1];
        if (last?.streaming) updated[updated.length - 1] = { ...last, streaming: false };
        return updated;
      });
    } catch (e) {
      setMessages((m) => {
        const updated = [...m];
        const last = updated[updated.length - 1];
        if (last?.streaming) {
          updated[updated.length - 1] = {
            role: "saga",
            content: e instanceof Error ? e.message : "An error occurred.",
            streaming: false,
          };
        }
        return updated;
      });
    } finally {
      setGenerating(false);
      inputRef?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      props.onToggle();
    }
  }

  return (
    <>
      <div class="saga-panel" classList={{ open: props.open }}>
        <div class="saga-inner">
          <div class="saga-history" ref={historyRef}>
            <For each={messages()}>
              {(msg) => (
                <div
                  class="saga-message"
                  classList={{
                    "saga-message--user": msg.role === "user",
                    "saga-message--saga": msg.role === "saga",
                  }}
                >
                  <span class="saga-message-label">
                    {msg.role === "user" ? "You" : "Saga"}
                  </span>
                  <span class="saga-message-text">
                    {msg.content}
                    <Show when={msg.streaming}>
                      <span class="saga-cursor" />
                    </Show>
                  </span>
                </div>
              )}
            </For>
          </div>
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
          </div>
        </div>
      </div>
      <button class="saga-tab" onClick={props.onToggle}>
        {props.open ? "Hide Saga" : "Saga Console"}
      </button>
    </>
  );
};

export default SagaConsole;
