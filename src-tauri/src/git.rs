use smallvec::SmallVec;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn init(root: &str) -> Result<(), String> {
    let git_dir = Path::new(root).join(".git");
    if git_dir.exists() {
        return Ok(());
    }
    // Manually scaffold the minimal .git layout that gix::open needs.
    // Using gix::init would also call gix::open internally, which requires
    // config-parsing features we intentionally omit.
    std::fs::create_dir_all(git_dir.join("objects")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(git_dir.join("refs").join("heads")).map_err(|e| e.to_string())?;
    std::fs::write(git_dir.join("HEAD"), b"ref: refs/heads/main\n").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn commit_file(root: &str, rel_path: &str, message: &str) -> Result<(), String> {
    let repo = gix::open(root).map_err(|e| e.to_string())?;

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
