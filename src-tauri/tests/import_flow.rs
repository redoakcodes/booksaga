/// Integration tests for the git history layer, covering the realistic
/// sequences of init + commit_file calls that the import flow produces.
use app_lib::git::{commit_file, init};
use std::fs;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn history_dir(root: &tempfile::TempDir) -> std::path::PathBuf {
    root.path().join(".booksaga/history")
}

fn root(dir: &tempfile::TempDir) -> &str {
    dir.path().to_str().unwrap()
}

fn write(dir: &tempfile::TempDir, rel: &str, content: &[u8]) {
    let path = dir.path().join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn open_repo(dir: &tempfile::TempDir) -> gix::Repository {
    gix::open(history_dir(dir)).expect("open history repo")
}

fn commit_count(repo: &gix::Repository) -> usize {
    // Walk from HEAD back through parents.
    let mut count = 0;
    let mut oid = match repo.head_commit() {
        Ok(c) => c.id,
        Err(_) => return 0,
    };
    loop {
        count += 1;
        let obj = repo.find_object(oid).unwrap();
        // Raw git commit format: lines before the blank line, "parent <hex>" entries
        let raw = std::str::from_utf8(&obj.data).unwrap();
        let parent_hex = raw
            .lines()
            .find(|l| l.starts_with("parent "))
            .map(|l| l["parent ".len()..].trim());
        match parent_hex {
            Some(hex) => oid = hex.parse().unwrap(),
            None => break,
        }
    }
    count
}

fn head_filenames(repo: &gix::Repository) -> Vec<String> {
    collect_names(repo, None)
}

fn collect_names(repo: &gix::Repository, tree_oid: Option<gix::ObjectId>) -> Vec<String> {
    use gix::bstr::ByteSlice;
    let tree_id = match tree_oid {
        Some(id) => id,
        None => {
            let commit = repo.head_commit().unwrap();
            commit.tree_id().unwrap().detach()
        }
    };
    let obj = repo.find_object(tree_id).unwrap();
    let tree = gix::objs::TreeRef::from_bytes(&obj.data, repo.object_hash()).unwrap();
    let mut names = Vec::new();
    for entry in &tree.entries {
        let name = entry.filename.to_str_lossy().into_owned();
        if entry.mode.kind() == gix::objs::tree::EntryKind::Tree {
            for child in collect_names(repo, Some(entry.oid.to_owned())) {
                names.push(format!("{}/{}", name, child));
            }
        } else {
            names.push(name);
        }
    }
    names
}

// ---------------------------------------------------------------------------
// Scenario 1 — Legacy project
//
// Directory already has manuscript/toc.md and chapter files but no
// .booksaga/config.json. The import path calls gitInit then initProject,
// which writes config.json (new) and skips toc.md (already exists).
// ---------------------------------------------------------------------------

#[test]
fn legacy_project_toc_preserved() {
    let dir = tempfile::tempdir().unwrap();
    let r = root(&dir);

    // Pre-existing content
    let original_toc = "# Table of Contents\n1. chapter-one.md\n1. chapter-two.md\n";
    write(&dir, "manuscript/toc.md", original_toc.as_bytes());
    write(&dir, "manuscript/chapter-one.md", b"# Chapter One\n\n");
    write(&dir, "manuscript/chapter-two.md", b"# Chapter Two\n\n");

    // Import flow: gitInit, then initProject writes only config.json
    init(r).unwrap();
    write(&dir, ".booksaga/config.json", b"{}\n");
    commit_file(r, ".booksaga/config.json", "save: config.json").unwrap();

    // toc.md was NOT overwritten — content on disk is still the original
    let on_disk = fs::read_to_string(dir.path().join("manuscript/toc.md")).unwrap();
    assert_eq!(on_disk, original_toc);

    // History exists and has exactly one commit
    let repo = open_repo(&dir);
    assert_eq!(commit_count(&repo), 1);
    let files = head_filenames(&repo);
    assert!(files.contains(&".booksaga/config.json".to_string()));
    assert!(!files.contains(&"manuscript/toc.md".to_string()));
}

// ---------------------------------------------------------------------------
// Scenario 2 — Re-import (idempotency)
//
// Importing the same directory a second time must not error or create a
// broken state. gitInit is a no-op when .booksaga/history already exists.
// ---------------------------------------------------------------------------

#[test]
fn reimport_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let r = root(&dir);

    // First import
    init(r).unwrap();
    write(&dir, ".booksaga/config.json", b"{}\n");
    commit_file(r, ".booksaga/config.json", "save: config.json").unwrap();
    write(&dir, "manuscript/toc.md", b"# TOC\n");
    commit_file(r, "manuscript/toc.md", "save: toc").unwrap();

    let commits_after_first = commit_count(&open_repo(&dir));

    // Second import — init must be a no-op
    init(r).unwrap();

    let commits_after_second = commit_count(&open_repo(&dir));
    assert_eq!(commits_after_first, commits_after_second);
}

// ---------------------------------------------------------------------------
// Scenario 3 — Project with an existing real .git at the root
//
// booksaga must write its history to .booksaga/history and leave the
// project's own .git untouched.
// ---------------------------------------------------------------------------

#[test]
fn does_not_touch_existing_dot_git() {
    let dir = tempfile::tempdir().unwrap();
    let r = root(&dir);

    // Simulate a user-managed git repo
    let user_git = dir.path().join(".git");
    fs::create_dir_all(user_git.join("objects")).unwrap();
    fs::create_dir_all(user_git.join("refs/heads")).unwrap();
    fs::write(user_git.join("HEAD"), b"ref: refs/heads/main\n").unwrap();
    fs::write(user_git.join("SENTINEL"), b"user-git\n").unwrap();

    // booksaga import
    init(r).unwrap();
    write(&dir, ".booksaga/config.json", b"{}\n");
    commit_file(r, ".booksaga/config.json", "save: config.json").unwrap();

    // Our history is in .booksaga/history, not .git
    assert!(history_dir(&dir).exists());

    // The user's .git/SENTINEL file is untouched
    let sentinel = fs::read(dir.path().join(".git/SENTINEL")).unwrap();
    assert_eq!(sentinel, b"user-git\n");

    // The user's .git/refs has no booksaga commits
    let user_refs = dir.path().join(".git/refs/heads");
    let entries: Vec<_> = fs::read_dir(&user_refs).unwrap().collect();
    assert!(
        entries.is_empty(),
        ".git/refs/heads should have no booksaga refs"
    );
}

// ---------------------------------------------------------------------------
// Scenario 4 — Fresh directory
//
// Empty directory imported as a new project: both config.json and toc.md
// are written and committed.
// ---------------------------------------------------------------------------

#[test]
fn fresh_directory_gets_both_files_committed() {
    let dir = tempfile::tempdir().unwrap();
    let r = root(&dir);

    init(r).unwrap();
    write(&dir, ".booksaga/config.json", b"{}\n");
    commit_file(r, ".booksaga/config.json", "save: config.json").unwrap();
    write(&dir, "manuscript/toc.md", b"# Table of Contents\n");
    commit_file(r, "manuscript/toc.md", "save: toc").unwrap();

    let repo = open_repo(&dir);
    assert_eq!(commit_count(&repo), 2);
    let files = head_filenames(&repo);
    assert!(files.contains(&".booksaga/config.json".to_string()));
    assert!(files.contains(&"manuscript/toc.md".to_string()));
}

// ---------------------------------------------------------------------------
// Scenario 5 — Save after import builds on the import history
//
// After the import commits, a subsequent writeFile (user saves a chapter)
// should add to the existing history, not start a new chain.
// ---------------------------------------------------------------------------

#[test]
fn save_after_import_extends_history() {
    let dir = tempfile::tempdir().unwrap();
    let r = root(&dir);

    // Import
    init(r).unwrap();
    write(&dir, ".booksaga/config.json", b"{}\n");
    commit_file(r, ".booksaga/config.json", "save: config.json").unwrap();
    write(&dir, "manuscript/toc.md", b"# TOC\n");
    commit_file(r, "manuscript/toc.md", "save: toc").unwrap();

    // User edits a chapter
    write(
        &dir,
        "manuscript/chapter-one.md",
        b"# Chapter One\n\nNew content.\n",
    );
    commit_file(r, "manuscript/chapter-one.md", "save: chapter-one").unwrap();

    let repo = open_repo(&dir);
    assert_eq!(commit_count(&repo), 3);
    let files = head_filenames(&repo);
    assert!(files.contains(&"manuscript/chapter-one.md".to_string()));
    assert!(files.contains(&"manuscript/toc.md".to_string()));
    assert!(files.contains(&".booksaga/config.json".to_string()));
}
