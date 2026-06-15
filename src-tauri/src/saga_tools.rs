/// Tool implementations for the Saga agentic loop.
///
/// Each function returns a (result_text, is_error) tuple matching what goes into
/// tool_result messages sent back to the LLM.
use std::path::Path;

// ---------------------------------------------------------------------------
// Tool JSON schemas (Anthropic format, also converted for Ollama)
// ---------------------------------------------------------------------------

pub fn tool_definitions(has_project: bool, has_brave_key: bool) -> Vec<serde_json::Value> {
    let mut tools: Vec<serde_json::Value> = Vec::new();

    if has_project {
        tools.push(serde_json::json!({
            "name": "list_wiki_pages",
            "description": "List all wiki pages in the project.",
            "input_schema": { "type": "object", "properties": {} }
        }));
        tools.push(serde_json::json!({
            "name": "read_wiki_page",
            "description": "Read the contents of a wiki page by name (fuzzy matched on filename stem).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Page name or filename stem" }
                },
                "required": ["name"]
            }
        }));
        tools.push(serde_json::json!({
            "name": "list_exercise_files",
            "description": "List all writing exercise files in the project.",
            "input_schema": { "type": "object", "properties": {} }
        }));
        tools.push(serde_json::json!({
            "name": "read_exercise_file",
            "description": "Read a writing exercise file by name (fuzzy matched).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Exercise filename or stem" }
                },
                "required": ["name"]
            }
        }));
        tools.push(serde_json::json!({
            "name": "read_manuscript_excerpt",
            "description": "Read a range of lines from a manuscript chapter (read-only).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "chapter": {
                        "type": "string",
                        "description": "Chapter filename or partial name (fuzzy matched)"
                    },
                    "start_line": {
                        "type": "number",
                        "description": "First line to read, 1-indexed (default 1)"
                    },
                    "end_line": {
                        "type": "number",
                        "description": "Last line to read, inclusive (default 50)"
                    }
                },
                "required": ["chapter"]
            }
        }));
        tools.push(serde_json::json!({
            "name": "create_wiki_page",
            "description": "Create a new wiki page. Requires writer confirmation.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Page filename without .md extension"
                    },
                    "content": {
                        "type": "string",
                        "description": "Full markdown content for the page"
                    },
                    "section": {
                        "type": "string",
                        "description": "Subfolder within wiki/ — e.g. 'characters', 'locations'"
                    }
                },
                "required": ["name", "content"]
            }
        }));
        tools.push(serde_json::json!({
            "name": "edit_wiki_page",
            "description": "Edit an existing wiki page by replacing specific text. Requires writer confirmation.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Page name or filename stem (fuzzy matched)"
                    },
                    "old_text": { "type": "string", "description": "Exact text to replace" },
                    "new_text": { "type": "string", "description": "Replacement text" }
                },
                "required": ["name", "old_text", "new_text"]
            }
        }));
        tools.push(serde_json::json!({
            "name": "navigate_to_passage",
            "description": "Navigate the editor to a specific passage in a manuscript chapter, optionally highlighting a phrase.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "chapter": {
                        "type": "string",
                        "description": "Chapter filename or partial name (fuzzy matched)"
                    },
                    "text": {
                        "type": "string",
                        "description": "A phrase or sentence to highlight (optional)"
                    }
                },
                "required": ["chapter"]
            }
        }));
    }

    if has_brave_key {
        tools.push(serde_json::json!({
            "name": "web_search",
            "description": "Search the web using Brave Search. Returns titles, URLs, and snippets. Use this to look up facts, research topics, or find reference material for the writer.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query" },
                    "count": {
                        "type": "number",
                        "description": "Number of results to return (default 5, max 10)"
                    }
                },
                "required": ["query"]
            }
        }));
    }

    tools
}

pub const WRITE_TOOLS: &[&str] = &["create_wiki_page", "edit_wiki_page"];

// ---------------------------------------------------------------------------
// Fuzzy finders
// ---------------------------------------------------------------------------

fn fuzzy_find_wiki<'a>(name: &str, wiki_files: &'a [String]) -> Option<&'a str> {
    let needle = name.to_lowercase().replace(' ', "-").replace(".md", "");
    wiki_files
        .iter()
        .find(|f| {
            let stem = f.replace(".md", "").to_lowercase();
            stem == needle || stem.ends_with(&format!("/{needle}")) || stem.contains(&needle)
        })
        .map(|s| s.as_str())
}

fn fuzzy_find_chapter<'a>(name: &str, chapters: &'a [String]) -> Option<&'a str> {
    let needle = name.to_lowercase().replace(".md", "").replace(' ', "-");
    chapters
        .iter()
        .find(|f| {
            let stem = f.replace(".md", "").to_lowercase();
            stem == needle || stem.contains(&needle) || f.to_lowercase() == name.to_lowercase()
        })
        .map(|s| s.as_str())
}

fn fuzzy_find_exercise<'a>(name: &str, exercise_files: &'a [String]) -> Option<&'a str> {
    let needle = name.to_lowercase().replace(".md", "");
    exercise_files
        .iter()
        .find(|f| {
            let stem = f.replace(".md", "").to_lowercase();
            stem == needle || stem.contains(&needle)
        })
        .map(|s| s.as_str())
}

// ---------------------------------------------------------------------------
// Read-only tools
// ---------------------------------------------------------------------------

pub fn list_wiki_pages(wiki_files: &[String]) -> (String, bool) {
    if wiki_files.is_empty() {
        return ("No wiki pages yet.".into(), false);
    }
    let list = wiki_files
        .iter()
        .map(|f| format!("  - {}", f.replace(".md", "")))
        .collect::<Vec<_>>()
        .join("\n");
    (format!("Wiki pages:\n{list}"), false)
}

pub fn read_wiki_page(name: &str, wiki_files: &[String], wiki_dir: &Path) -> (String, bool) {
    match fuzzy_find_wiki(name, wiki_files) {
        None => {
            let avail = wiki_files
                .iter()
                .take(10)
                .map(|f| f.replace(".md", ""))
                .collect::<Vec<_>>()
                .join(", ");
            (
                format!("Wiki page '{name}' not found. Available: {avail}"),
                true,
            )
        }
        Some(rel) => match std::fs::read_to_string(wiki_dir.join(rel)) {
            Ok(content) => (content, false),
            Err(_) => (format!("Could not read {rel}."), true),
        },
    }
}

pub fn list_exercise_files(exercise_files: &[String]) -> (String, bool) {
    if exercise_files.is_empty() {
        return ("No exercise files yet.".into(), false);
    }
    let list = exercise_files
        .iter()
        .map(|f| format!("  - {f}"))
        .collect::<Vec<_>>()
        .join("\n");
    (format!("Exercise files:\n{list}"), false)
}

pub fn read_exercise_file(
    name: &str,
    exercise_files: &[String],
    exercises_dir: &Path,
) -> (String, bool) {
    match fuzzy_find_exercise(name, exercise_files) {
        None => {
            let avail = exercise_files
                .iter()
                .take(10)
                .map(|f| f.replace(".md", ""))
                .collect::<Vec<_>>()
                .join(", ");
            (
                format!("Exercise file '{name}' not found. Available: {avail}"),
                true,
            )
        }
        Some(rel) => match std::fs::read_to_string(exercises_dir.join(rel)) {
            Ok(content) => (content, false),
            Err(_) => (format!("Could not read {rel}."), true),
        },
    }
}

pub fn read_manuscript_excerpt(
    chapter: &str,
    start_line: usize,
    end_line: usize,
    chapters: &[String],
    manuscript_dir: &Path,
) -> (String, bool) {
    match fuzzy_find_chapter(chapter, chapters) {
        None => {
            let avail = chapters.iter().take(10).cloned().collect::<Vec<_>>().join(", ");
            (
                format!("Chapter '{chapter}' not found. Available: {avail}"),
                true,
            )
        }
        Some(rel) => match std::fs::read_to_string(manuscript_dir.join(rel)) {
            Err(_) => (format!("Could not read {rel}."), true),
            Ok(content) => {
                let lines: Vec<&str> = content.lines().collect();
                let start = start_line.saturating_sub(1).min(lines.len());
                let end = end_line.min(lines.len());
                let excerpt = lines[start..end].join("\n");
                (
                    format!("[{rel}, lines {}–{}]\n\n{excerpt}", start + 1, end),
                    false,
                )
            }
        },
    }
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

pub fn create_wiki_page(
    name: &str,
    content: &str,
    section: &str,
    wiki_dir: &Path,
) -> (String, bool) {
    let slug = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
        + ".md";

    let target = if section.is_empty() {
        wiki_dir.join(&slug)
    } else {
        wiki_dir.join(section).join(&slug)
    };

    if let Some(parent) = target.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return (format!("Failed to create directory: {e}"), true);
        }
    }

    match std::fs::write(&target, content) {
        Ok(_) => {
            let rel = if section.is_empty() {
                slug
            } else {
                format!("{section}/{slug}")
            };
            (format!("Created wiki/{rel}."), false)
        }
        Err(e) => (format!("Failed to write page: {e}"), true),
    }
}

pub fn edit_wiki_page(
    name: &str,
    old_text: &str,
    new_text: &str,
    wiki_files: &[String],
    wiki_dir: &Path,
) -> (String, bool) {
    let rel = match fuzzy_find_wiki(name, wiki_files) {
        None => return (format!("Wiki page '{name}' not found."), true),
        Some(r) => r.to_owned(),
    };

    let path = wiki_dir.join(&rel);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return (format!("Could not read {rel}."), true),
    };

    if !content.contains(old_text) {
        return (
            format!(
                "Text to replace not found in '{rel}'. Check that old_text exactly matches the file content."
            ),
            true,
        );
    }

    let updated = content.replacen(old_text, new_text, 1);
    match std::fs::write(&path, updated) {
        Ok(_) => (format!("Updated wiki/{rel}."), false),
        Err(e) => (format!("Failed to write {rel}: {e}"), true),
    }
}

// ---------------------------------------------------------------------------
// Web search (calls the same Brave API logic as the Tauri command)
// ---------------------------------------------------------------------------

pub async fn web_search(query: &str, count: u8, api_key: &str) -> (String, bool) {
    let n = count.clamp(1, 10);
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("Accept", "application/json")
        .header("X-Subscription-Token", api_key)
        .query(&[
            ("q", query),
            ("count", n.to_string().as_str()),
            ("text_decorations", "false"),
            ("search_lang", "en"),
        ])
        .send()
        .await;

    match resp {
        Err(e) => (format!("Brave Search request failed: {e}"), true),
        Ok(r) if !r.status().is_success() => {
            (format!("Brave Search API error: HTTP {}", r.status()), true)
        }
        Ok(r) => match r.json::<serde_json::Value>().await {
            Err(e) => (format!("Failed to parse search response: {e}"), true),
            Ok(json) => {
                let results = json["web"]["results"].as_array();
                match results {
                    None => ("No results found.".into(), false),
                    Some(items) if items.is_empty() => ("No results found.".into(), false),
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
                        (formatted, false)
                    }
                }
            }
        },
    }
}
