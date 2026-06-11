pub mod git;

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Project scanning
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
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
// Anthropic streaming
// ---------------------------------------------------------------------------

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicEvent {
    TextDelta { text: String },
    FinalMessage { json: String },
}

enum ContentBlock {
    Text {
        content: String,
    },
    ToolUse {
        id: String,
        name: String,
        json_accum: String,
    },
}

#[tauri::command]
async fn anthropic_stream(
    api_key: String,
    model: String,
    system: String,
    messages_json: String,
    tools_json: String,
    on_event: tauri::ipc::Channel<AnthropicEvent>,
) -> Result<(), String> {
    let messages: serde_json::Value =
        serde_json::from_str(&messages_json).map_err(|e| format!("invalid messages: {e}"))?;
    let tools: serde_json::Value =
        serde_json::from_str(&tools_json).map_err(|e| format!("invalid tools: {e}"))?;

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
        .header("x-api-key", &api_key)
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
                                    id: ev["content_block"]["id"].as_str().unwrap_or("").to_owned(),
                                    name: ev["content_block"]["name"]
                                        .as_str()
                                        .unwrap_or("")
                                        .to_owned(),
                                    json_accum: String::new(),
                                }
                            } else {
                                ContentBlock::Text {
                                    content: String::new(),
                                }
                            };
                            blocks.insert(idx, block);
                        }
                        "content_block_delta" => {
                            let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                            let dtype = ev["delta"]["type"].as_str().unwrap_or("");
                            if dtype == "text_delta" {
                                let text = ev["delta"]["text"].as_str().unwrap_or("").to_owned();
                                if !text.is_empty() {
                                    on_event
                                        .send(AnthropicEvent::TextDelta { text: text.clone() })
                                        .map_err(|e| e.to_string())?;
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
                                    ref mut json_accum, ..
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
            ContentBlock::ToolUse {
                id,
                name,
                json_accum,
            } => {
                let input: serde_json::Value =
                    serde_json::from_str(&json_accum).unwrap_or(serde_json::json!({}));
                serde_json::json!({"type": "tool_use", "id": id, "name": name, "input": input})
            }
        })
        .collect();

    let final_msg = serde_json::json!({
        "id": msg_id,
        "type": "message",
        "role": "assistant",
        "content": content,
        "stop_reason": stop_reason,
    });

    on_event
        .send(AnthropicEvent::FinalMessage {
            json: final_msg.to_string(),
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Shared project root — written on project open, read by the booksaga:// protocol handler.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectRoot(Mutex::new(None)))
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
            scan_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
