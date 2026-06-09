pub mod git;

#[tauri::command]
fn git_init(root_path: String) -> Result<(), String> {
    git::init(&root_path)
}

#[tauri::command]
fn git_commit_file(root_path: String, rel_path: String, message: String) -> Result<(), String> {
    git::commit_file(&root_path, &rel_path, &message)
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
        .invoke_handler(tauri::generate_handler![git_init, git_commit_file, brave_search])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
