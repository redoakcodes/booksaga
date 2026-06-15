pub mod git;
pub mod saga_tools;

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// App settings (stored in OS app-data dir as JSON)
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_app_settings(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_app_settings(json: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("settings.json"), json).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Credentials (stored in OS keychain)
// ---------------------------------------------------------------------------

fn no_such_entry(e: &keyring::Error) -> bool {
    matches!(e, keyring::Error::NoEntry)
        || e.to_string().to_lowercase().contains("not found")
        || e.to_string().to_lowercase().contains("no entry")
}

#[tauri::command]
fn get_credential(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("booksaga", &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(ref e) if no_such_entry(e) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_credential(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new("booksaga", &key).map_err(|e| e.to_string())?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(ref e) if no_such_entry(e) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&value).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn delete_credential(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("booksaga", &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(ref e) if no_such_entry(e) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Project scanning
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedProject {
    pub config_json: Option<String>,
    pub toc_text: Option<String>,
    pub chapters: Vec<String>,
    pub wiki_files: Vec<String>,
    pub wiki_dirs: Vec<String>,
    pub wiki_contents: Vec<(String, String)>,
    pub diagram_files: Vec<String>,
    pub exercise_files: Vec<String>,
}

fn collect_by_ext(dir: &Path, prefix: &str, ext: &str, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<_> = entries.flatten().collect();
    names.sort_by_key(|e| e.file_name());
    for entry in names {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let rel = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        let path = entry.path();
        if path.is_file() && name.ends_with(ext) {
            out.push(rel);
        } else if path.is_dir() {
            collect_by_ext(&path, &rel, ext, out);
        }
    }
}

fn collect_subdirs(dir: &Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<_> = entries.flatten().collect();
    names.sort_by_key(|e| e.file_name());
    for entry in names {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name();
        let rel = if prefix.is_empty() {
            name.to_string_lossy().to_string()
        } else {
            format!("{prefix}/{}", name.to_string_lossy())
        };
        out.push(rel.clone());
        collect_subdirs(&entry.path(), &rel, out);
    }
}

pub fn scan_project_impl(root_path: &str) -> Result<ScannedProject, String> {
    let root = Path::new(root_path);

    let config_json = std::fs::read_to_string(root.join(".booksaga/config.json")).ok();
    let toc_text = std::fs::read_to_string(root.join("manuscript/toc.md")).ok();

    let manuscript_dir = root.join("manuscript");
    let wiki_dir = root.join("wiki");
    let exercises_dir = root.join("exercises");

    let mut chapters = Vec::new();
    collect_by_ext(&manuscript_dir, "", ".md", &mut chapters);
    chapters.retain(|f| f != "toc.md");

    let mut wiki_files = Vec::new();
    collect_by_ext(&wiki_dir, "", ".md", &mut wiki_files);

    let mut wiki_dirs = Vec::new();
    collect_subdirs(&wiki_dir, "", &mut wiki_dirs);

    let mut diagram_files = Vec::new();
    collect_by_ext(&wiki_dir, "", ".mmd", &mut diagram_files);

    let mut exercise_files = Vec::new();
    collect_by_ext(&exercises_dir, "", ".md", &mut exercise_files);

    let mut wiki_contents = Vec::new();
    for file in &wiki_files {
        let path = wiki_dir.join(file);
        if let Ok(content) = std::fs::read_to_string(&path) {
            wiki_contents.push((file.clone(), content));
        }
    }

    Ok(ScannedProject {
        config_json,
        toc_text,
        chapters,
        wiki_files,
        wiki_dirs,
        wiki_contents,
        diagram_files,
        exercise_files,
    })
}

#[tauri::command]
fn scan_project(root_path: String) -> Result<ScannedProject, String> {
    scan_project_impl(&root_path)
}

// ---------------------------------------------------------------------------
// LLM streaming — shared types and inner functions
// ---------------------------------------------------------------------------

/// Events emitted by the existing anthropic_stream / ollama_stream commands
/// (consumed by streamExercise in TypeScript).
#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum LlmEvent {
    TextDelta { text: String },
    FinalMessage { json: String },
    ToolsNotSupported,
}

enum ContentBlock {
    Text { content: String },
    ToolUse { id: String, name: String, json_accum: String },
}

enum LlmCallResult {
    Message(serde_json::Value),
    ToolsNotSupported,
}

async fn call_llm_anthropic<F>(
    api_key: &str,
    model: &str,
    system: &str,
    messages: &serde_json::Value,
    tools: &serde_json::Value,
    on_text: F,
) -> Result<LlmCallResult, String>
where
    F: Fn(String) -> Result<(), String>,
{
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": messages,
        "stream": true,
    });
    if let serde_json::Value::Array(ref t) = tools {
        if !t.is_empty() {
            body["tools"] = tools.clone();
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error {status}: {text}"));
    }

    use futures::StreamExt;

    let mut blocks: std::collections::BTreeMap<usize, ContentBlock> = Default::default();
    let mut msg_id = String::new();
    let mut stop_reason = String::new();
    let mut buf = String::new();

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        loop {
            match buf.find('\n') {
                None => break,
                Some(pos) => {
                    let line: String = buf[..pos].trim_end_matches('\r').to_owned();
                    buf = buf[pos + 1..].to_owned();

                    let Some(data) = line.strip_prefix("data: ") else {
                        continue;
                    };
                    if data == "[DONE]" {
                        continue;
                    }
                    let ev: serde_json::Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };

                    match ev["type"].as_str().unwrap_or("") {
                        "message_start" => {
                            msg_id = ev["message"]["id"].as_str().unwrap_or("").to_owned();
                        }
                        "content_block_start" => {
                            let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                            let btype = ev["content_block"]["type"].as_str().unwrap_or("");
                            let block = if btype == "tool_use" {
                                ContentBlock::ToolUse {
                                    id: ev["content_block"]["id"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_owned(),
                                    name: ev["content_block"]["name"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_owned(),
                                    json_accum: String::new(),
                                }
                            } else {
                                ContentBlock::Text { content: String::new() }
                            };
                            blocks.insert(idx, block);
                        }
                        "content_block_delta" => {
                            let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                            let dtype = ev["delta"]["type"].as_str().unwrap_or("");
                            if dtype == "text_delta" {
                                let text =
                                    ev["delta"]["text"].as_str().unwrap_or("").to_owned();
                                if !text.is_empty() {
                                    on_text(text.clone())?;
                                    if let Some(ContentBlock::Text { ref mut content }) =
                                        blocks.get_mut(&idx)
                                    {
                                        content.push_str(&text);
                                    }
                                }
                            } else if dtype == "input_json_delta" {
                                let partial = ev["delta"]["partial_json"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_owned();
                                if let Some(ContentBlock::ToolUse {
                                    ref mut json_accum,
                                    ..
                                }) = blocks.get_mut(&idx)
                                {
                                    json_accum.push_str(&partial);
                                }
                            }
                        }
                        "message_delta" => {
                            stop_reason =
                                ev["delta"]["stop_reason"].as_str().unwrap_or("").to_owned();
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let content: Vec<serde_json::Value> = blocks
        .into_values()
        .map(|b| match b {
            ContentBlock::Text { content } => {
                serde_json::json!({"type": "text", "text": content})
            }
            ContentBlock::ToolUse { id, name, json_accum } => {
                let input: serde_json::Value =
                    serde_json::from_str(&json_accum).unwrap_or(serde_json::json!({}));
                serde_json::json!({"type": "tool_use", "id": id, "name": name, "input": input})
            }
        })
        .collect();

    Ok(LlmCallResult::Message(serde_json::json!({
        "id": msg_id,
        "type": "message",
        "role": "assistant",
        "content": content,
        "stop_reason": stop_reason,
    })))
}

#[tauri::command]
async fn anthropic_stream(
    api_key: String,
    model: String,
    system: String,
    messages_json: String,
    tools_json: String,
    on_event: tauri::ipc::Channel<LlmEvent>,
) -> Result<(), String> {
    let messages: serde_json::Value =
        serde_json::from_str(&messages_json).map_err(|e| format!("invalid messages: {e}"))?;
    let tools: serde_json::Value =
        serde_json::from_str(&tools_json).map_err(|e| format!("invalid tools: {e}"))?;

    match call_llm_anthropic(&api_key, &model, &system, &messages, &tools, |text| {
        on_event.send(LlmEvent::TextDelta { text }).map_err(|e| e.to_string())
    })
    .await?
    {
        LlmCallResult::Message(msg) => on_event
            .send(LlmEvent::FinalMessage { json: msg.to_string() })
            .map_err(|e| e.to_string())?,
        LlmCallResult::ToolsNotSupported => {}
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Ollama streaming
// ---------------------------------------------------------------------------

fn is_tools_unsupported(text: &str) -> bool {
    let l = text.to_lowercase();
    l.contains("does not support tools")
        || l.contains("model does not support")
        || (l.contains("tool") && l.contains("not support"))
}

fn convert_messages_to_ollama(messages: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut result = Vec::new();
    let Some(msgs) = messages.as_array() else {
        return result;
    };
    for msg in msgs {
        let role = msg["role"].as_str().unwrap_or("user");
        if let Some(text) = msg["content"].as_str() {
            result.push(serde_json::json!({ "role": role, "content": text }));
            continue;
        }
        let Some(blocks) = msg["content"].as_array() else {
            continue;
        };
        let mut text_parts: Vec<String> = Vec::new();
        let mut tool_calls: Vec<serde_json::Value> = Vec::new();
        let mut tool_results: Vec<serde_json::Value> = Vec::new();
        for block in blocks {
            match block["type"].as_str() {
                Some("text") => {
                    if let Some(t) = block["text"].as_str() {
                        text_parts.push(t.to_owned());
                    }
                }
                Some("tool_use") => {
                    tool_calls.push(serde_json::json!({
                        "function": { "name": block["name"], "arguments": block["input"] }
                    }));
                }
                Some("tool_result") => {
                    tool_results.push(serde_json::json!({
                        "role": "tool",
                        "content": block["content"].as_str().unwrap_or(""),
                    }));
                }
                _ => {}
            }
        }
        if !tool_results.is_empty() {
            result.extend(tool_results);
        } else {
            let mut m = serde_json::json!({
                "role": role,
                "content": text_parts.join(""),
            });
            if !tool_calls.is_empty() {
                m["tool_calls"] = serde_json::Value::Array(tool_calls);
            }
            result.push(m);
        }
    }
    result
}

async fn call_llm_ollama<F>(
    endpoint: &str,
    model: &str,
    system: &str,
    messages: &serde_json::Value,
    tools: &serde_json::Value,
    on_text: F,
) -> Result<LlmCallResult, String>
where
    F: Fn(String) -> Result<(), String>,
{
    let mut ollama_msgs = convert_messages_to_ollama(messages);
    if !system.is_empty() {
        ollama_msgs.insert(
            0,
            serde_json::json!({ "role": "system", "content": system }),
        );
    }

    let mut body = serde_json::json!({
        "model": model,
        "stream": true,
        "messages": ollama_msgs,
    });

    if let serde_json::Value::Array(ref t) = tools {
        if !t.is_empty() {
            let ollama_tools: Vec<serde_json::Value> = t
                .iter()
                .map(|tool| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parameters": tool["input_schema"],
                        },
                    })
                })
                .collect();
            body["tools"] = serde_json::Value::Array(ollama_tools);
        }
    }

    let base = endpoint.trim_end_matches('/');
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if is_tools_unsupported(&text) {
            return Ok(LlmCallResult::ToolsNotSupported);
        }
        return Err(format!("Ollama error {status}: {text}"));
    }

    use futures::StreamExt;

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full_text = String::new();
    let mut final_tool_calls: Vec<serde_json::Value> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_owned();
            buf = buf[pos + 1..].to_owned();
            if line.is_empty() {
                continue;
            }
            let ev: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(err) = ev["error"].as_str() {
                if is_tools_unsupported(err) {
                    return Ok(LlmCallResult::ToolsNotSupported);
                }
                return Err(format!("Ollama error: {err}"));
            }
            let content = ev["message"]["content"].as_str().unwrap_or("").to_owned();
            if !content.is_empty() {
                on_text(content.clone())?;
                full_text.push_str(&content);
            }
            if ev["done"].as_bool().unwrap_or(false) {
                if let Some(calls) = ev["message"]["tool_calls"].as_array() {
                    final_tool_calls = calls.clone();
                }
            }
        }
    }

    let mut content_blocks: Vec<serde_json::Value> = Vec::new();
    if !full_text.is_empty() {
        content_blocks.push(serde_json::json!({ "type": "text", "text": full_text }));
    }
    let stop_reason = if final_tool_calls.is_empty() {
        "end_turn"
    } else {
        for (i, call) in final_tool_calls.iter().enumerate() {
            let name = call["function"]["name"].as_str().unwrap_or("");
            let args = &call["function"]["arguments"];
            content_blocks.push(serde_json::json!({
                "type": "tool_use",
                "id": format!("call-{i}"),
                "name": name,
                "input": args,
            }));
        }
        "tool_use"
    };

    Ok(LlmCallResult::Message(serde_json::json!({
        "id": format!("ollama-{model}"),
        "type": "message",
        "role": "assistant",
        "content": content_blocks,
        "stop_reason": stop_reason,
    })))
}

#[tauri::command]
async fn ollama_stream(
    endpoint: String,
    model: String,
    system: String,
    messages_json: String,
    tools_json: String,
    on_event: tauri::ipc::Channel<LlmEvent>,
) -> Result<(), String> {
    let messages: serde_json::Value =
        serde_json::from_str(&messages_json).map_err(|e| format!("invalid messages: {e}"))?;
    let tools: serde_json::Value =
        serde_json::from_str(&tools_json).map_err(|e| format!("invalid tools: {e}"))?;

    match call_llm_ollama(&endpoint, &model, &system, &messages, &tools, |text| {
        on_event.send(LlmEvent::TextDelta { text }).map_err(|e| e.to_string())
    })
    .await?
    {
        LlmCallResult::Message(msg) => on_event
            .send(LlmEvent::FinalMessage { json: msg.to_string() })
            .map_err(|e| e.to_string())?,
        LlmCallResult::ToolsNotSupported => on_event
            .send(LlmEvent::ToolsNotSupported)
            .map_err(|e| e.to_string())?,
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Saga — event type, session state, confirmation channel
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SagaEvent {
    Text { text: String },
    ToolCall { name: String, args: serde_json::Value },
    ToolResult { name: String, result: String, is_error: bool },
    ConfirmNeeded { tool: String, args: serde_json::Value },
    Notice { text: String },
    Navigate { chapter: String, context: Option<String>, text: Option<String> },
    Error { message: String },
    Done,
}

#[allow(dead_code)]
pub(crate) struct SagaSession {
    pub(crate) id: u64,
    pub(crate) messages: Vec<serde_json::Value>,
    pub(crate) tools_disabled: bool,
}

pub struct SagaState(pub(crate) Mutex<Option<SagaSession>>);

/// Oneshot sender placed here when the saga loop is suspended awaiting confirmation.
pub struct ConfirmState(pub Mutex<Option<tokio::sync::oneshot::Sender<bool>>>);

#[tauri::command]
fn new_saga_session(state: tauri::State<SagaState>) -> u64 {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(1);
    *state.0.lock().unwrap() = Some(SagaSession {
        id,
        messages: vec![],
        tools_disabled: false,
    });
    id
}

// ---------------------------------------------------------------------------
// Shared project root — written on project open, read by the booksaga:// protocol handler.
// ---------------------------------------------------------------------------

pub struct ProjectRoot(pub Mutex<Option<String>>);

#[tauri::command]
fn set_project_root(root: String, state: tauri::State<ProjectRoot>) {
    *state.0.lock().unwrap() = Some(root);
}

#[tauri::command]
fn git_init(root_path: String) -> Result<(), String> {
    git::init(&root_path)
}

#[tauri::command]
fn git_commit_file(root_path: String, rel_path: String, message: String) -> Result<(), String> {
    git::commit_file(&root_path, &rel_path, &message)
}

#[tauri::command]
async fn save_image(root_path: String, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe_name = Path::new(&filename)
        .file_name()
        .map(|n| {
            n.to_string_lossy()
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                        c
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
        })
        .filter(|n| !n.is_empty())
        .ok_or("Invalid filename")?;

    let art_dir = Path::new(&root_path).join("manuscript").join("art");
    std::fs::create_dir_all(&art_dir).map_err(|e| e.to_string())?;
    std::fs::write(art_dir.join(&safe_name), &bytes).map_err(|e| e.to_string())?;

    let rel_path = format!("manuscript/art/{}", safe_name);
    git::commit_file(&root_path, &rel_path, &format!("add image: {}", safe_name))?;

    Ok(safe_name)
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
async fn brave_search(query: String, count: u8, api_key: String) -> Result<String, String> {
    let n = count.clamp(1, 10);
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("Accept", "application/json")
        .header("X-Subscription-Token", &api_key)
        .query(&[
            ("q", query.as_str()),
            ("count", n.to_string().as_str()),
            ("text_decorations", "false"),
            ("search_lang", "en"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Brave Search API error: HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let results = json["web"]["results"].as_array();

    match results {
        None => Ok("No results found.".to_string()),
        Some(items) if items.is_empty() => Ok("No results found.".to_string()),
        Some(items) => {
            let formatted = items
                .iter()
                .enumerate()
                .map(|(i, r)| {
                    let title = r["title"].as_str().unwrap_or("(no title)");
                    let url = r["url"].as_str().unwrap_or("");
                    let desc = r["description"].as_str().unwrap_or("");
                    format!("{}. {}\n   {}\n   {}", i + 1, title, url, desc)
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            Ok(formatted)
        }
    }
}

// ---------------------------------------------------------------------------
// Saga agentic loop
// ---------------------------------------------------------------------------

const SAGA_SYSTEM_BASE: &str = "You are Saga, a thoughtful writing assistant built into the Booksaga writing app. Help the writer with their creative work.

You have tools to read wiki pages, manuscript chapters, and exercise files from the project, and to create or edit wiki pages when asked.

Rules:
- Manuscript chapters are read-only — never propose edits to them directly.
- Before creating or editing a wiki page, describe your plan; the app will ask the writer for confirmation before the change is applied.
- Don't invent project details you haven't read via tools.
- Keep responses focused and practical.";

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn saga_turn(
    session_id: u64,
    user_message: String,
    current_file: Option<String>,
    provider: String,
    model: String,
    endpoint: Option<String>,
    api_key: Option<String>,
    brave_api_key: Option<String>,
    on_event: tauri::ipc::Channel<SagaEvent>,
    saga_state: tauri::State<'_, SagaState>,
    confirm_state: tauri::State<'_, ConfirmState>,
    project_root: tauri::State<'_, ProjectRoot>,
) -> Result<(), String> {
    // Validate session
    {
        let guard = saga_state.0.lock().unwrap();
        let Some(ref session) = *guard else {
            return Err("No active session. Call new_saga_session first.".into());
        };
        if session.id != session_id {
            return Err("Session ID mismatch — session was reset.".into());
        }
    }

    // Get project root (may be None if no project open)
    let root_path = project_root.0.lock().unwrap().clone();
    let has_project = root_path.is_some();
    let has_brave = brave_api_key.is_some();

    // Build system prompt
    let mut system = SAGA_SYSTEM_BASE.to_owned();
    if let Some(ref f) = current_file {
        system.push_str(&format!("\n\nCurrently open file: {f}"));
    }

    // Append user message to history
    {
        let mut guard = saga_state.0.lock().unwrap();
        if let Some(ref mut session) = *guard {
            session.messages.push(serde_json::json!({
                "role": "user",
                "content": user_message
            }));
        }
    }

    let tools_json = {
        let guard = saga_state.0.lock().unwrap();
        let disabled = guard.as_ref().map(|s| s.tools_disabled).unwrap_or(false);
        if disabled {
            serde_json::Value::Array(vec![])
        } else {
            serde_json::Value::Array(saga_tools::tool_definitions(has_project, has_brave))
        }
    };

    loop {
        // Snapshot current messages for the LLM call
        let messages_val = {
            let guard = saga_state.0.lock().unwrap();
            serde_json::Value::Array(
                guard.as_ref().map(|s| s.messages.clone()).unwrap_or_default(),
            )
        };

        // Call the appropriate provider
        let on_event_clone = on_event.clone();
        let result = if provider == "anthropic" {
            let key = api_key
                .as_deref()
                .ok_or("No Anthropic API key configured.")?;
            call_llm_anthropic(key, &model, &system, &messages_val, &tools_json, move |text| {
                on_event_clone
                    .send(SagaEvent::Text { text })
                    .map_err(|e| e.to_string())
            })
            .await
        } else {
            let ep = endpoint.as_deref().unwrap_or("http://localhost:11434");
            call_llm_ollama(ep, &model, &system, &messages_val, &tools_json, move |text| {
                on_event_clone
                    .send(SagaEvent::Text { text })
                    .map_err(|e| e.to_string())
            })
            .await
        };

        let final_msg = match result? {
            LlmCallResult::ToolsNotSupported => {
                // Disable tools for this session and retry without them
                {
                    let mut guard = saga_state.0.lock().unwrap();
                    if let Some(ref mut session) = *guard {
                        session.tools_disabled = true;
                    }
                }
                on_event
                    .send(SagaEvent::Notice {
                        text: "This model doesn't support tool use — wiki access is unavailable for this session.".into(),
                    })
                    .map_err(|e| e.to_string())?;
                // Retry without tools
                let messages_val2 = {
                    let guard = saga_state.0.lock().unwrap();
                    serde_json::Value::Array(
                        guard.as_ref().map(|s| s.messages.clone()).unwrap_or_default(),
                    )
                };
                let empty_tools = serde_json::Value::Array(vec![]);
                let on_event2 = on_event.clone();
                let result2 = if provider == "anthropic" {
                    let key = api_key.as_deref().ok_or("No Anthropic API key.")?;
                    call_llm_anthropic(
                        key,
                        &model,
                        &system,
                        &messages_val2,
                        &empty_tools,
                        move |text| {
                            on_event2
                                .send(SagaEvent::Text { text })
                                .map_err(|e| e.to_string())
                        },
                    )
                    .await
                } else {
                    let ep = endpoint.as_deref().unwrap_or("http://localhost:11434");
                    call_llm_ollama(
                        ep,
                        &model,
                        &system,
                        &messages_val2,
                        &empty_tools,
                        move |text| {
                            on_event2
                                .send(SagaEvent::Text { text })
                                .map_err(|e| e.to_string())
                        },
                    )
                    .await
                };
                match result2? {
                    LlmCallResult::Message(m) => m,
                    LlmCallResult::ToolsNotSupported => {
                        return Err("Model rejected tool-free request.".into());
                    }
                }
            }
            LlmCallResult::Message(m) => m,
        };

        // Build assistant content blocks from final message
        let content_arr = final_msg["content"]
            .as_array()
            .cloned()
            .unwrap_or_default();

        // Append assistant turn to history
        {
            let mut guard = saga_state.0.lock().unwrap();
            if let Some(ref mut session) = *guard {
                session.messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": content_arr.clone(),
                }));
            }
        }

        // Collect tool uses
        let tool_uses: Vec<&serde_json::Value> = content_arr
            .iter()
            .filter(|b| b["type"].as_str() == Some("tool_use"))
            .collect();

        if tool_uses.is_empty() {
            break; // End of agentic loop
        }

        // Process each tool call
        let mut tool_results: Vec<serde_json::Value> = Vec::new();
        let root_path_ref = root_path.as_deref().unwrap_or("");

        for tool in &tool_uses {
            let name = tool["name"].as_str().unwrap_or("").to_owned();
            let tool_id = tool["id"].as_str().unwrap_or("").to_owned();
            let args = tool["input"].clone();

            on_event
                .send(SagaEvent::ToolCall {
                    name: name.clone(),
                    args: args.clone(),
                })
                .map_err(|e| e.to_string())?;

            let (result_text, is_error) = if saga_tools::WRITE_TOOLS.contains(&name.as_str()) {
                // Suspend loop, ask frontend for confirmation
                let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
                {
                    let mut guard = confirm_state.0.lock().unwrap();
                    *guard = Some(tx);
                }
                on_event
                    .send(SagaEvent::ConfirmNeeded {
                        tool: name.clone(),
                        args: args.clone(),
                    })
                    .map_err(|e| e.to_string())?;

                // Await user decision (implicit cancel if channel is dropped)
                let confirmed = rx.await.unwrap_or(false);

                if !confirmed {
                    ("Cancelled by writer.".into(), false)
                } else {
                    execute_write_tool(&name, &args, root_path_ref)
                }
            } else {
                execute_read_tool(&name, &args, root_path_ref, brave_api_key.as_deref()).await
            };

            on_event
                .send(SagaEvent::ToolResult {
                    name: name.clone(),
                    result: result_text.clone(),
                    is_error,
                })
                .map_err(|e| e.to_string())?;

            // Handle navigate_to_passage specially
            if name == "navigate_to_passage" && !is_error {
                let chapter = args["chapter"].as_str().unwrap_or("").to_owned();
                let context = args["context"].as_str().map(str::to_owned);
                let text = args["text"].as_str().map(str::to_owned);
                on_event
                    .send(SagaEvent::Navigate { chapter, context, text })
                    .map_err(|e| e.to_string())?;
            }

            tool_results.push(serde_json::json!({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result_text,
                "is_error": is_error,
            }));
        }

        // Append tool results to history and loop
        {
            let mut guard = saga_state.0.lock().unwrap();
            if let Some(ref mut session) = *guard {
                session.messages.push(serde_json::json!({
                    "role": "user",
                    "content": tool_results,
                }));
            }
        }
    }

    on_event
        .send(SagaEvent::Done)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn execute_write_tool(
    name: &str,
    args: &serde_json::Value,
    root_path: &str,
) -> (String, bool) {
    if root_path.is_empty() {
        return ("No project is open.".into(), true);
    }
    let wiki_dir = Path::new(root_path).join("wiki");

    // We need current wiki_files for edit_wiki_page fuzzy lookup.
    // Scan wiki dir on demand (write tools are rare).
    let mut wiki_files: Vec<String> = Vec::new();
    crate::collect_by_ext(&wiki_dir, "", ".md", &mut wiki_files);

    match name {
        "create_wiki_page" => {
            let page_name = args["name"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            let section = args["section"].as_str().unwrap_or("");
            saga_tools::create_wiki_page(page_name, content, section, &wiki_dir)
        }
        "edit_wiki_page" => {
            let page_name = args["name"].as_str().unwrap_or("");
            let old_text = args["old_text"].as_str().unwrap_or("");
            let new_text = args["new_text"].as_str().unwrap_or("");
            saga_tools::edit_wiki_page(page_name, old_text, new_text, &wiki_files, &wiki_dir)
        }
        _ => (format!("Unknown write tool: {name}"), true),
    }
}

async fn execute_read_tool(
    name: &str,
    args: &serde_json::Value,
    root_path: &str,
    brave_api_key: Option<&str>,
) -> (String, bool) {
    let no_project = || ("No project is open.".into(), true);

    match name {
        "list_manuscript_chapters" => {
            if root_path.is_empty() {
                return no_project();
            }
            let manuscript_dir = Path::new(root_path).join("manuscript");
            let mut chapters = Vec::new();
            collect_by_ext(&manuscript_dir, "", ".md", &mut chapters);
            chapters.retain(|f| f != "toc.md");
            if chapters.is_empty() {
                ("No manuscript chapters yet.".into(), false)
            } else {
                let list = chapters
                    .iter()
                    .map(|c| format!("  - {c}"))
                    .collect::<Vec<_>>()
                    .join("\n");
                (format!("Manuscript chapters:\n{list}"), false)
            }
        }
        "list_wiki_pages" => {
            if root_path.is_empty() {
                return no_project();
            }
            let wiki_dir = Path::new(root_path).join("wiki");
            let mut wiki_files = Vec::new();
            collect_by_ext(&wiki_dir, "", ".md", &mut wiki_files);
            saga_tools::list_wiki_pages(&wiki_files)
        }
        "read_wiki_page" => {
            if root_path.is_empty() {
                return no_project();
            }
            let wiki_dir = Path::new(root_path).join("wiki");
            let mut wiki_files = Vec::new();
            collect_by_ext(&wiki_dir, "", ".md", &mut wiki_files);
            let page_name = args["name"].as_str().unwrap_or("");
            saga_tools::read_wiki_page(page_name, &wiki_files, &wiki_dir)
        }
        "list_exercise_files" => {
            if root_path.is_empty() {
                return no_project();
            }
            let exercises_dir = Path::new(root_path).join("exercises");
            let mut exercise_files = Vec::new();
            collect_by_ext(&exercises_dir, "", ".md", &mut exercise_files);
            saga_tools::list_exercise_files(&exercise_files)
        }
        "read_exercise_file" => {
            if root_path.is_empty() {
                return no_project();
            }
            let exercises_dir = Path::new(root_path).join("exercises");
            let mut exercise_files = Vec::new();
            collect_by_ext(&exercises_dir, "", ".md", &mut exercise_files);
            let file_name = args["name"].as_str().unwrap_or("");
            saga_tools::read_exercise_file(file_name, &exercise_files, &exercises_dir)
        }
        "read_manuscript_excerpt" => {
            if root_path.is_empty() {
                return no_project();
            }
            let manuscript_dir = Path::new(root_path).join("manuscript");
            let mut chapters = Vec::new();
            collect_by_ext(&manuscript_dir, "", ".md", &mut chapters);
            chapters.retain(|f| f != "toc.md");
            let chapter = args["chapter"].as_str().unwrap_or("");
            let start = args["start_line"].as_u64().unwrap_or(1) as usize;
            let end = args["end_line"].as_u64().unwrap_or(50) as usize;
            saga_tools::read_manuscript_excerpt(chapter, start, end, &chapters, &manuscript_dir)
        }
        "navigate_to_passage" => {
            // Result text is informational; the SagaEvent::Navigate is emitted separately.
            let chapter = args["chapter"].as_str().unwrap_or("(unknown)");
            (format!("Navigating to {chapter}."), false)
        }
        "web_search" => {
            let Some(key) = brave_api_key else {
                return (
                    "No Brave Search API key configured. Add your key in Settings.".into(),
                    true,
                );
            };
            let query = args["query"].as_str().unwrap_or("");
            let count = args["count"].as_u64().unwrap_or(5) as u8;
            saga_tools::web_search(query, count, key).await
        }
        _ => (format!("Unknown tool: {name}"), true),
    }
}

#[tauri::command]
fn resolve_saga_confirm(
    confirmed: bool,
    confirm_state: tauri::State<ConfirmState>,
) -> Result<(), String> {
    let mut guard = confirm_state.0.lock().unwrap();
    if let Some(tx) = guard.take() {
        let _ = tx.send(confirmed);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectRoot(Mutex::new(None)))
        .manage(SagaState(Mutex::new(None)))
        .manage(ConfirmState(Mutex::new(None)))
        .register_uri_scheme_protocol("booksaga", |app, request| {
            let state = app.app_handle().state::<ProjectRoot>();
            let guard = state.0.lock().unwrap();
            let Some(ref root) = *guard else {
                return tauri::http::Response::builder()
                    .status(404)
                    .body(b"no project open".to_vec())
                    .unwrap();
            };
            let url_path = request.uri().path().trim_start_matches('/');
            let file_path = Path::new(root).join(url_path);
            match std::fs::read(&file_path) {
                Ok(bytes) => {
                    let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    tauri::http::Response::builder()
                        .header("Content-Type", mime_for_ext(ext))
                        .body(bytes)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(vec![])
                    .unwrap(),
            }
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git_init,
            git_commit_file,
            brave_search,
            set_project_root,
            save_image,
            anthropic_stream,
            ollama_stream,
            scan_project,
            load_app_settings,
            save_app_settings,
            get_credential,
            set_credential,
            delete_credential,
            new_saga_session,
            saga_turn,
            resolve_saga_confirm,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
