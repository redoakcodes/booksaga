use smallvec::SmallVec;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn history_dir(root: &str) -> std::path::PathBuf {
    Path::new(root).join(".booksaga").join("history")
}

pub fn init(root: &str) -> Result<(), String> {
    let dir = history_dir(root);
    if dir.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dir.join("objects")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("refs").join("heads")).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("HEAD"), b"ref: refs/heads/main\n").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn commit_file(root: &str, rel_path: &str, message: &str) -> Result<(), String> {
    let repo = gix::open(history_dir(root)).map_err(|e| e.to_string())?;

    // Read the file that was just written to disk
    let content = std::fs::read(Path::new(root).join(rel_path))
        .map_err(|e| e.to_string())?;

    // 1. Write blob
    let blob_id = repo
        .write_blob(&content)
        .map(|id| id.detach())
        .map_err(|e| e.to_string())?;

    // 2. Get current HEAD state (unborn on first commit)
    let (parents, base_tree_id) = head_state(&repo)?;

    // 3. Build new tree with the updated file path
    let parts: Vec<&[u8]> = rel_path.split('/').map(str::as_bytes).collect();
    let tree_id = upsert_in_tree(&repo, base_tree_id, &parts, blob_id)?;

    // 4. Write commit
    let commit_id = write_commit(&repo, tree_id, &parents, message)?;

    // 5. Advance HEAD ref
    update_head(&repo, commit_id, message)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

fn head_state(
    repo: &gix::Repository,
) -> Result<(Vec<gix::ObjectId>, Option<gix::ObjectId>), String> {
    match repo.head_commit() {
        Ok(commit) => {
            let head_id = commit.id;
            let tree_id = commit.tree_id().map_err(|e| e.to_string())?.detach();
            Ok((vec![head_id], Some(tree_id)))
        }
        Err(_) => Ok((vec![], None)), // unborn HEAD — first commit
    }
}

/// Recursively update `tree_id` so that `parts` (path components) points to `blob_id`.
/// Returns the new root tree OID.
fn upsert_in_tree(
    repo: &gix::Repository,
    tree_id: Option<gix::ObjectId>,
    parts: &[&[u8]],
    blob_id: gix::ObjectId,
) -> Result<gix::ObjectId, String> {
    use gix::bstr::ByteSlice;

    // Read existing entries from the current tree level
    let mut entries: Vec<gix::objs::tree::Entry> = match tree_id {
        Some(tid) => {
            let obj = repo.find_object(tid).map_err(|e| e.to_string())?;
            let tree =
                gix::objs::TreeRef::from_bytes(&obj.data, repo.object_hash())
                    .map_err(|e| e.to_string())?;
            tree.entries
                .iter()
                .map(|e| gix::objs::tree::Entry {
                    mode: e.mode,
                    filename: e.filename.to_owned(),
                    oid: e.oid.to_owned(),
                })
                .collect()
        }
        None => Vec::new(),
    };

    let name = parts[0];

    if parts.len() == 1 {
        // Leaf — upsert blob entry
        let entry = gix::objs::tree::Entry {
            mode: gix::objs::tree::EntryKind::Blob.into(),
            filename: name.into(),
            oid: blob_id,
        };
        match entries
            .iter()
            .position(|e| e.filename.as_bstr() == name.as_bstr())
        {
            Some(i) => entries[i] = entry,
            None => entries.push(entry),
        }
    } else {
        // Directory — recurse into subtree
        let subtree_id = entries
            .iter()
            .find(|e| e.filename.as_bstr() == name.as_bstr())
            .map(|e| e.oid);
        let new_subtree = upsert_in_tree(repo, subtree_id, &parts[1..], blob_id)?;
        let entry = gix::objs::tree::Entry {
            mode: gix::objs::tree::EntryKind::Tree.into(),
            filename: name.into(),
            oid: new_subtree,
        };
        match entries
            .iter()
            .position(|e| e.filename.as_bstr() == name.as_bstr())
        {
            Some(i) => entries[i] = entry,
            None => entries.push(entry),
        }
    }

    // Git sorts tree entries with directories treated as name + '/'
    entries.sort_by(|a, b| sort_key(a).cmp(&sort_key(b)));

    let tree = gix::objs::Tree { entries };
    repo.write_object(&tree)
        .map(|id| id.detach())
        .map_err(|e| e.to_string())
}

fn sort_key(entry: &gix::objs::tree::Entry) -> Vec<u8> {
    let mut key = entry.filename.to_vec();
    if entry.mode.kind() == gix::objs::tree::EntryKind::Tree {
        key.push(b'/');
    }
    key
}

fn make_sig() -> gix::actor::Signature {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    gix::actor::Signature {
        name: "BookSaga".into(),
        email: "booksaga@local".into(),
        time: gix::date::Time {
            seconds,
            offset: 0,
        },
    }
}

fn write_commit(
    repo: &gix::Repository,
    tree_id: gix::ObjectId,
    parent_ids: &[gix::ObjectId],
    message: &str,
) -> Result<gix::ObjectId, String> {
    let sig = make_sig();
    let parents: SmallVec<[gix::ObjectId; 1]> = parent_ids.iter().copied().collect();
    let commit = gix::objs::Commit {
        tree: tree_id,
        parents,
        author: sig.clone(),
        committer: sig,
        encoding: None,
        message: message.into(),
        extra_headers: vec![],
    };
    repo.write_object(&commit)
        .map(|id| id.detach())
        .map_err(|e| e.to_string())
}

fn update_head(
    repo: &gix::Repository,
    commit_id: gix::ObjectId,
    message: &str,
) -> Result<(), String> {
    use gix::refs::transaction::{Change, LogChange, PreviousValue, RefEdit, RefLog};

    let head = repo.head().map_err(|e| e.to_string())?;
    let ref_name = match head.kind {
        gix::head::Kind::Symbolic(r) => r.name,
        gix::head::Kind::Unborn(name) => name,
        gix::head::Kind::Detached { .. } => "refs/heads/main"
            .try_into()
            .map_err(|e: gix::validate::reference::name::Error| e.to_string())?,
    };

    repo.edit_references([RefEdit {
        change: Change::Update {
            log: LogChange {
                mode: RefLog::AndReference,
                force_create_reflog: false,
                message: message.into(),
            },
            expected: PreviousValue::Any,
            new: gix::refs::Target::Object(commit_id),
        },
        name: ref_name,
        deref: false,
    }])
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use gix::bstr::ByteSlice;
    use std::fs;

    fn open(root: &str) -> gix::Repository {
        gix::open(history_dir(root)).expect("open repo")
    }

    fn head_entries(repo: &gix::Repository) -> Vec<gix::objs::tree::Entry> {
        let commit = repo.head_commit().expect("head commit");
        let tree_id = commit.tree_id().expect("tree id").detach();
        let obj = repo.find_object(tree_id).expect("find tree");
        let tree = gix::objs::TreeRef::from_bytes(&obj.data, repo.object_hash())
            .expect("parse tree");
        tree.entries
            .iter()
            .map(|e| gix::objs::tree::Entry {
                mode: e.mode,
                filename: e.filename.to_owned(),
                oid: e.oid.to_owned(),
            })
            .collect()
    }

    fn blob_content(repo: &gix::Repository, oid: gix::ObjectId) -> Vec<u8> {
        repo.find_object(oid).expect("find blob").data.clone()
    }

    // -- init ----------------------------------------------------------------

    #[test]
    fn init_creates_history_structure() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        let base = dir.path().join(".booksaga/history");
        assert!(base.join("HEAD").exists());
        assert!(base.join("objects").exists());
        assert!(base.join("refs/heads").exists());
        assert_eq!(
            fs::read_to_string(base.join("HEAD")).unwrap(),
            "ref: refs/heads/main\n"
        );
    }

    #[test]
    fn init_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        init(root).unwrap();
    }

    // -- commit_file ---------------------------------------------------------

    #[test]
    fn commit_file_flat_path() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::write(dir.path().join("note.md"), b"# Hello\n").unwrap();
        commit_file(root, "note.md", "save: note").unwrap();

        let repo = open(root);
        let entries = head_entries(&repo);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].filename.as_bstr(), "note.md");
        assert_eq!(blob_content(&repo, entries[0].oid), b"# Hello\n");
    }

    #[test]
    fn commit_file_nested_path_creates_subtree() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::create_dir_all(dir.path().join("manuscript")).unwrap();
        fs::write(dir.path().join("manuscript/chapter1.md"), b"# Ch 1\n").unwrap();
        commit_file(root, "manuscript/chapter1.md", "save: chapter1").unwrap();

        let repo = open(root);
        let entries = head_entries(&repo);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].filename.as_bstr(), "manuscript");
        assert_eq!(entries[0].mode.kind(), gix::objs::tree::EntryKind::Tree);

        let sub_obj = repo.find_object(entries[0].oid).unwrap();
        let sub = gix::objs::TreeRef::from_bytes(&sub_obj.data, repo.object_hash()).unwrap();
        assert_eq!(sub.entries.len(), 1);
        assert_eq!(sub.entries[0].filename, "chapter1.md");
    }

    #[test]
    fn second_commit_accumulates_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::write(dir.path().join("a.md"), b"A").unwrap();
        commit_file(root, "a.md", "save: a").unwrap();
        fs::write(dir.path().join("b.md"), b"B").unwrap();
        commit_file(root, "b.md", "save: b").unwrap();

        let repo = open(root);
        let entries = head_entries(&repo);
        let names: Vec<&[u8]> = entries.iter().map(|e| e.filename.as_ref()).collect();
        assert!(names.contains(&b"a.md".as_slice()));
        assert!(names.contains(&b"b.md".as_slice()));
    }

    #[test]
    fn commit_file_updates_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::write(dir.path().join("note.md"), b"v1").unwrap();
        commit_file(root, "note.md", "save: v1").unwrap();
        fs::write(dir.path().join("note.md"), b"v2").unwrap();
        commit_file(root, "note.md", "save: v2").unwrap();

        let repo = open(root);
        let entries = head_entries(&repo);
        assert_eq!(entries.len(), 1);
        assert_eq!(blob_content(&repo, entries[0].oid), b"v2");
    }

    #[test]
    fn second_commit_has_parent() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::write(dir.path().join("a.md"), b"A").unwrap();
        commit_file(root, "a.md", "first").unwrap();
        let first_id = open(root).head_commit().unwrap().id;

        fs::write(dir.path().join("b.md"), b"B").unwrap();
        commit_file(root, "b.md", "second").unwrap();

        // The raw commit object lists parents as "parent <hex>\n" lines.
        let repo = open(root);
        let commit = repo.head_commit().unwrap();
        let obj = repo.find_object(commit.id).unwrap();
        let raw = std::str::from_utf8(&obj.data).unwrap();
        let parent_lines: Vec<&str> =
            raw.lines().filter(|l| l.starts_with("parent ")).collect();
        assert_eq!(parent_lines.len(), 1);
        assert!(parent_lines[0].contains(&first_id.to_hex().to_string()));
    }

    #[test]
    fn deeply_nested_path() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        init(root).unwrap();
        fs::create_dir_all(dir.path().join("wiki/characters")).unwrap();
        fs::write(dir.path().join("wiki/characters/elara.md"), b"# Elara\n").unwrap();
        commit_file(root, "wiki/characters/elara.md", "save: elara").unwrap();

        let repo = open(root);
        // Root → wiki (tree) → characters (tree) → elara.md (blob)
        let root_entries = head_entries(&repo);
        assert_eq!(root_entries.len(), 1);
        assert_eq!(root_entries[0].filename.as_bstr(), "wiki");

        let wiki_obj = repo.find_object(root_entries[0].oid).unwrap();
        let wiki = gix::objs::TreeRef::from_bytes(&wiki_obj.data, repo.object_hash()).unwrap();
        assert_eq!(wiki.entries.len(), 1);
        assert_eq!(wiki.entries[0].filename, "characters");

        let chars_obj = repo.find_object(wiki.entries[0].oid.to_owned()).unwrap();
        let chars = gix::objs::TreeRef::from_bytes(&chars_obj.data, repo.object_hash()).unwrap();
        assert_eq!(chars.entries.len(), 1);
        assert_eq!(chars.entries[0].filename, "elara.md");
    }
}
