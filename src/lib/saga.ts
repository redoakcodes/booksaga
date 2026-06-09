import Anthropic from "@anthropic-ai/sdk";
import { invoke } from "@tauri-apps/api/core";
import type { AiConfig } from "./ai";
import type { ProjectModel } from "./project";
import { MANUSCRIPT_DIR, WIKI_DIR, EXERCISES_DIR } from "./project";

export const SAGA_GREETING =
  "Hello, I'm Saga — your writing assistant. I can help you brainstorm ideas, develop characters, refine prose, or think through story problems. I can read your wiki pages and manuscript chapters if that would help. What are you working on?";

const SYSTEM_PROMPT_BASE = `You are Saga, a thoughtful writing assistant built into the Booksaga writing app. Help the writer with their creative work.

You have tools to read wiki pages, manuscript chapters, and exercise files from the project, and to create or edit wiki pages when asked.

Rules:
- Manuscript chapters are read-only — never propose edits to them directly.
- Before creating or editing a wiki page, describe your plan; the app will ask the writer for confirmation before the change is applied.
- Don't invent project details you haven't read via tools.
- Keep responses focused and practical.`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string; isError: boolean }
  | { type: "done" };

export type ConfirmCallback = (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

export type ApiMessage = Anthropic.MessageParam;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set(["create_wiki_page", "edit_wiki_page"]);

const SEARCH_TOOL: Anthropic.Tool = {
  name: "web_search",
  description: "Search the web using Brave Search. Returns titles, URLs, and snippets. Use this to look up facts, research topics, or find reference material for the writer.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
      count: { type: "number", description: "Number of results to return (default 5, max 10)" },
    },
    required: ["query"],
  },
};

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "list_wiki_pages",
    description: "List all wiki pages in the project.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_wiki_page",
    description: "Read the contents of a wiki page by name (fuzzy matched on filename stem).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Page name or filename stem" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_exercise_files",
    description: "List all writing exercise files in the project.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_exercise_file",
    description: "Read a writing exercise file by name (fuzzy matched).",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Exercise filename or stem" },
      },
      required: ["name"],
    },
  },
  {
    name: "read_manuscript_excerpt",
    description: "Read a range of lines from a manuscript chapter (read-only).",
    input_schema: {
      type: "object" as const,
      properties: {
        chapter: { type: "string", description: "Chapter filename or partial name (fuzzy matched)" },
        start_line: { type: "number", description: "First line to read, 1-indexed (default 1)" },
        end_line: { type: "number", description: "Last line to read, inclusive (default 50)" },
      },
      required: ["chapter"],
    },
  },
  {
    name: "create_wiki_page",
    description: "Create a new wiki page. Requires writer confirmation. Use for new characters, locations, or research entries.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Page filename without .md extension" },
        content: { type: "string", description: "Full markdown content for the page" },
        section: {
          type: "string",
          description: "Subfolder within wiki/ — e.g. 'characters', 'locations', 'research'",
        },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "edit_wiki_page",
    description: "Edit an existing wiki page by replacing specific text. Requires writer confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Page name or filename stem (fuzzy matched)" },
        old_text: { type: "string", description: "Exact text to replace" },
        new_text: { type: "string", description: "Replacement text" },
      },
      required: ["name", "old_text", "new_text"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function fuzzyFindWiki(name: string, model: ProjectModel): string | undefined {
  const needle = name.toLowerCase().replace(/\s+/g, "-").replace(/\.md$/, "");
  return model.wikiFiles.find((f) => {
    const stem = f.replace(/\.md$/, "").toLowerCase();
    return stem === needle || stem.endsWith("/" + needle) || stem.includes(needle);
  });
}

function listWikiPages(model: ProjectModel): string {
  if (model.wikiFiles.length === 0) return "No wiki pages yet.";
  return "Wiki pages:\n" + model.wikiFiles.map((f) => `  - ${f.replace(/\.md$/, "")}`).join("\n");
}

async function readWikiPage(name: string, model: ProjectModel): Promise<string> {
  const match = fuzzyFindWiki(name, model);
  if (!match) {
    const avail = model.wikiFiles.slice(0, 10).map((f) => f.replace(/\.md$/, "")).join(", ");
    return `Wiki page '${name}' not found. Available: ${avail || "none"}`;
  }
  return (await model.fs.readFile(WIKI_DIR, ...match.split("/"))) ?? `Could not read ${match}.`;
}

function listExerciseFiles(model: ProjectModel): string {
  if (model.exerciseFiles.length === 0) return "No exercise files yet.";
  return "Exercise files:\n" + model.exerciseFiles.map((f) => `  - ${f}`).join("\n");
}

async function readExerciseFile(name: string, model: ProjectModel): Promise<string> {
  const needle = name.toLowerCase().replace(/\.md$/, "");
  const match = model.exerciseFiles.find((f) => {
    const stem = f.replace(/\.md$/, "").toLowerCase();
    return stem === needle || stem.includes(needle);
  });
  if (!match) {
    const avail = model.exerciseFiles.slice(0, 10).map((f) => f.replace(/\.md$/, "")).join(", ");
    return `Exercise file '${name}' not found. Available: ${avail || "none"}`;
  }
  return (await model.fs.readFile(EXERCISES_DIR, ...match.split("/"))) ?? `Could not read ${match}.`;
}

async function readManuscriptExcerpt(
  chapter: string,
  startLine: number,
  endLine: number,
  model: ProjectModel,
): Promise<string> {
  const needle = chapter.toLowerCase().replace(/\.md$/, "").replace(/\s+/g, "-");
  const match = model.chapters.find((f) => {
    const stem = f.replace(/\.md$/, "").toLowerCase();
    return stem === needle || stem.includes(needle) || f.toLowerCase() === chapter.toLowerCase();
  });
  if (!match) {
    const avail = model.chapters.slice(0, 10).join(", ");
    return `Chapter '${chapter}' not found. Available: ${avail || "none"}`;
  }
  const content = await model.fs.readFile(MANUSCRIPT_DIR, ...match.split("/"));
  if (!content) return `Could not read ${match}.`;
  const lines = content.split("\n");
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  return `[${match}, lines ${start + 1}–${end}]\n\n${lines.slice(start, end).join("\n")}`;
}

async function createWikiPage(
  name: string,
  content: string,
  section: string,
  model: ProjectModel,
): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
  const parts = section ? [WIKI_DIR, section, slug] : [WIKI_DIR, slug];
  await model.fs.writeFile(parts, content);
  return `Created ${parts.join("/")}.`;
}

async function editWikiPage(
  name: string,
  oldText: string,
  newText: string,
  model: ProjectModel,
): Promise<string> {
  const match = fuzzyFindWiki(name, model);
  if (!match) return `Wiki page '${name}' not found.`;
  const content = await model.fs.readFile(WIKI_DIR, ...match.split("/"));
  if (!content) return `Could not read ${match}.`;
  if (!content.includes(oldText)) return `Text to replace not found in '${match}'. Check that old_text exactly matches the file content.`;
  await model.fs.writeFile([WIKI_DIR, ...match.split("/")], content.replace(oldText, newText));
  return `Updated ${match}.`;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  model: ProjectModel | null,
  config: AiConfig,
): Promise<[string, boolean]> {
  try {
    switch (name) {
      case "web_search": {
        if (!config.braveApiKey) return ["No Brave Search API key configured. Add your key in Settings.", true];
        const result = await invoke<string>("brave_search", {
          query: args.query as string,
          count: Math.min((args.count as number) ?? 5, 10),
          apiKey: config.braveApiKey,
        });
        return [result, false];
      }
      case "list_wiki_pages":
        if (!model) return ["No project is open.", true];
        return [listWikiPages(model), false];
      case "read_wiki_page":
        if (!model) return ["No project is open.", true];
        return [await readWikiPage(args.name as string, model), false];
      case "list_exercise_files":
        if (!model) return ["No project is open.", true];
        return [listExerciseFiles(model), false];
      case "read_exercise_file":
        if (!model) return ["No project is open.", true];
        return [await readExerciseFile(args.name as string, model), false];
      case "read_manuscript_excerpt":
        if (!model) return ["No project is open.", true];
        return [await readManuscriptExcerpt(
          args.chapter as string,
          (args.start_line as number) ?? 1,
          (args.end_line as number) ?? 50,
          model,
        ), false];
      case "create_wiki_page":
        if (!model) return ["No project is open.", true];
        return [await createWikiPage(
          args.name as string,
          args.content as string,
          (args.section as string) ?? "research",
          model,
        ), false];
      case "edit_wiki_page":
        if (!model) return ["No project is open.", true];
        return [await editWikiPage(
          args.name as string,
          args.old_text as string,
          args.new_text as string,
          model,
        ), false];
      default:
        return [`Unknown tool: ${name}`, true];
    }
  } catch (e) {
    return [`Tool '${name}' failed: ${e instanceof Error ? e.message : String(e)}`, true];
  }
}

// ---------------------------------------------------------------------------
// Agentic stream
// ---------------------------------------------------------------------------

export async function* streamSaga(
  apiMessages: ApiMessage[],
  config: AiConfig,
  model: ProjectModel | null,
  currentFile: string | null,
  onConfirm: ConfirmCallback,
): AsyncGenerator<AgentEvent> {
  if (!config.anthropicApiKey) {
    throw new Error("No Anthropic API key configured. Add your key in Menu → Settings.");
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey, dangerouslyAllowBrowser: true });

  let system = SYSTEM_PROMPT_BASE;
  if (currentFile) system += `\n\nCurrently open file: ${currentFile}`;

  const tools: Anthropic.Tool[] = [
    ...(model ? TOOL_DEFINITIONS : []),
    ...(config.braveApiKey ? [SEARCH_TOOL] : []),
  ];

  while (true) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system,
      messages: apiMessages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    let textContent = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        textContent += event.delta.text;
        yield { type: "text", text: event.delta.text };
      }
    }

    const finalMsg = await stream.getFinalMessage();
    const toolUses = finalMsg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Append assistant turn to history
    const assistantContent: Anthropic.MessageParam["content"] = [];
    if (textContent) (assistantContent as Anthropic.ContentBlockParam[]).push({ type: "text", text: textContent });
    for (const t of toolUses) {
      (assistantContent as Anthropic.ContentBlockParam[]).push({
        type: "tool_use",
        id: t.id,
        name: t.name,
        input: t.input,
      });
    }
    apiMessages.push({ role: "assistant", content: assistantContent });

    if (toolUses.length === 0) break;

    // Execute each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const args = tool.input as Record<string, unknown>;
      yield { type: "tool_call", id: tool.id, name: tool.name, args };

      let result: string;
      let isError: boolean;

      if (WRITE_TOOLS.has(tool.name)) {
        const confirmed = model ? await onConfirm(tool.name, args) : false;
        if (!confirmed) {
          result = "Cancelled by writer.";
          isError = false;
        } else {
          [result, isError] = await executeTool(tool.name, args, model, config);
        }
      } else {
        [result, isError] = await executeTool(tool.name, args, model, config);
      }

      yield { type: "tool_result", name: tool.name, result, isError };
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result, is_error: isError });
    }

    apiMessages.push({ role: "user", content: toolResults });
  }

  yield { type: "done" };
}
