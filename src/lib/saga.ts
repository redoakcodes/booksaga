import Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "./ai";

// Edit this greeting to your liking — it's the first thing Saga says when the console opens.
export const SAGA_GREETING =
  "Hello, I'm Saga — your writing assistant. I can help you brainstorm ideas, develop characters, refine prose, or just think through story problems. What are you working on?";

const SAGA_SYSTEM_PROMPT = `You are Saga, a thoughtful and perceptive writing assistant built into the Booksaga writing app. Your sole purpose is to help the writer with their creative work.

You may:
- Help brainstorm plot, character, setting, theme, and structure
- Offer feedback and suggestions on prose style, pacing, and voice
- Discuss writing craft — show vs. tell, point of view, tension, etc.
- Help develop world-building notes and character profiles (wiki entries)
- Read and discuss project files when the writer shares their content

You must NOT:
- Directly edit manuscript chapters without the writer's explicit instruction and confirmation
- Make up details about the writer's project that they haven't told you
- Pretend to have read files you haven't been shown

When offering edits or additions to wiki entries, describe the proposed change clearly and ask for confirmation before the writer applies it. Keep your responses focused and practical. Avoid unnecessary preamble.`;

export type ApiMessage = { role: "user" | "assistant"; content: string };

export async function* streamSaga(
  history: ApiMessage[],
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
    max_tokens: 2048,
    system: SAGA_SYSTEM_PROMPT,
    messages: history,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
