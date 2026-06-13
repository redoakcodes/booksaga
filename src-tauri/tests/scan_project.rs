use app_lib::{scan_project_impl as scan_project, ScannedProject};
use std::fs;

fn write(dir: &tempfile::TempDir, rel: &str, content: &str) {
    let path = dir.path().join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

#[test]
fn scan_empty_project_returns_empty_lists() {
    let dir = tempfile::tempdir().unwrap();
    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.chapters.is_empty());
    assert!(result.wiki_files.is_empty());
    assert!(result.wiki_dirs.is_empty());
    assert!(result.diagram_files.is_empty());
    assert!(result.exercise_files.is_empty());
    assert!(result.config_json.is_none());
    assert!(result.toc_text.is_none());
}

#[test]
fn scan_reads_config_and_toc() {
    let dir = tempfile::tempdir().unwrap();
    write(
        &dir,
        ".booksaga/config.json",
        r#"{"project":{"title":"Test"}}"#,
    );
    write(&dir, "manuscript/toc.md", "# Table of Contents\n");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.config_json.unwrap().contains("Test"));
    assert!(result.toc_text.unwrap().contains("Table of Contents"));
}

#[test]
fn scan_lists_manuscript_chapters_excluding_toc() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "manuscript/toc.md", "");
    write(&dir, "manuscript/chapter-one.md", "");
    write(&dir, "manuscript/chapter-two.md", "");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.chapters.contains(&"chapter-one.md".to_string()));
    assert!(result.chapters.contains(&"chapter-two.md".to_string()));
    assert!(!result.chapters.contains(&"toc.md".to_string()));
}

#[test]
fn scan_lists_wiki_files_with_subdirectory_paths() {
    let dir = tempfile::tempdir().unwrap();
    write(
        &dir,
        "wiki/characters/elara.md",
        "# Elara\n\nKnows [[City]].",
    );
    write(&dir, "wiki/locations/city.md", "# City\n");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result
        .wiki_files
        .contains(&"characters/elara.md".to_string()));
    assert!(result.wiki_files.contains(&"locations/city.md".to_string()));
}

#[test]
fn scan_lists_wiki_dirs() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "wiki/characters/elara.md", "");
    write(&dir, "wiki/locations/city.md", "");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.wiki_dirs.contains(&"characters".to_string()));
    assert!(result.wiki_dirs.contains(&"locations".to_string()));
}

#[test]
fn scan_lists_diagram_files() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "wiki/story-arc.mmd", "flowchart TD\n");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.diagram_files.contains(&"story-arc.mmd".to_string()));
}

#[test]
fn scan_lists_exercise_files() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "exercises/2024-01-01-12-00-00.md", "");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result
        .exercise_files
        .contains(&"2024-01-01-12-00-00.md".to_string()));
}

#[test]
fn scan_returns_wiki_contents_for_index_building() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "wiki/elara.md", "# Elara\n\nKnows [[City]].");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    let entry = result
        .wiki_contents
        .iter()
        .find(|(f, _)| f == "elara.md")
        .unwrap();
    assert!(entry.1.contains("[[City]]"));
}

#[test]
fn scanned_project_serializes_as_camel_case() {
    // Regression test: TypeScript interface uses camelCase field names.
    // If this serializes as snake_case, scan_project returns empty data to JS.
    let s = ScannedProject {
        config_json: Some("{}".to_string()),
        toc_text: None,
        chapters: vec![],
        wiki_files: vec!["wiki.md".to_string()],
        wiki_dirs: vec![],
        wiki_contents: vec![],
        diagram_files: vec![],
        exercise_files: vec![],
    };
    let json = serde_json::to_string(&s).unwrap();
    assert!(json.contains("\"wikiFiles\""), "wikiFiles must be camelCase");
    assert!(json.contains("\"configJson\""), "configJson must be camelCase");
    assert!(!json.contains("wiki_files"), "snake_case must not appear");
}

#[test]
fn scan_results_are_sorted() {
    let dir = tempfile::tempdir().unwrap();
    write(&dir, "manuscript/z-chapter.md", "");
    write(&dir, "manuscript/a-chapter.md", "");

    let result = scan_project(dir.path().to_str().unwrap()).unwrap();
    let a = result
        .chapters
        .iter()
        .position(|f| f == "a-chapter.md")
        .unwrap();
    let z = result
        .chapters
        .iter()
        .position(|f| f == "z-chapter.md")
        .unwrap();
    assert!(a < z);
}
