pub mod git;

use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

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
                .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
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
    let n = count.min(10).max(1);
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
                    let ext = file_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
