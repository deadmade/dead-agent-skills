//! A session's backgrounded commands (`run_in_background`), read from Claude Code's own runtime folder:
//! `<tmp>/claude-<uid>/<project folder>/<session id>/tasks/<task id>.output`. The folder is undocumented, so every
//! read here degrades to nothing when it isn't where it was.
//!
//! The project folder is found by the session id, not worked out from the session's cwd: a worktree session's `tasks/`
//! can sit under another folder than its transcript does. The same `tasks/` folder holds symlinks (`a<hex>.output`)
//! to subagents' transcripts, which are not commands and are never listed or read.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use jiff::Timestamp;
use serde::Serialize;
use ts_rs::TS;

use crate::paths::{Platform, claude_tmp_dir};

/// One backgrounded command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
pub struct BackgroundTask {
    /// The output file's name without `.output`.
    pub id: String,
    /// When its output file was last written, as every other time here: UTC, RFC 3339.
    pub started: String,
}

/// Whether `id` is safe to join onto a path: ids and session ids reach here from a view, so nothing but letters,
/// digits, `_` and `-` (no separator, no `.`) gets near the filesystem.
fn is_plain_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The `tasks/` folder of `session_id`, under whichever project folder of `base` (`claude_tmp_dir`) holds one; the
/// most recently changed when several do. `None` when there is none, or `session_id` isn't a plain id.
pub fn find_session_tasks_dir(base: &Path, session_id: &str) -> Option<PathBuf> {
    if !is_plain_id(session_id) {
        return None;
    }
    fs::read_dir(base)
        .ok()?
        .filter_map(Result::ok)
        .map(|project| project.path().join(session_id).join("tasks"))
        .filter_map(|dir| {
            let changed = fs::metadata(&dir).ok().filter(fs::Metadata::is_dir)?;
            Some((changed.modified().ok(), dir))
        })
        .max()
        .map(|(_, dir)| dir)
}

/// The commands that have an output file in `dir`, oldest first. Regular files only, and only ones named like an id.
pub fn list_background_tasks(dir: &Path) -> Vec<BackgroundTask> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut found: Vec<(SystemTime, String)> = entries
        .filter_map(Result::ok)
        // `DirEntry::file_type` doesn't follow a symlink.
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_stem()?.to_str()?;
            if path.extension()? != "output" || !is_plain_id(id) {
                return None;
            }
            let modified = entry
                .metadata()
                .ok()?
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH);
            Some((modified, id.to_owned()))
        })
        .collect();
    found.sort();
    found
        .into_iter()
        .map(|(modified, id)| BackgroundTask {
            id,
            started: Timestamp::try_from(modified)
                .unwrap_or(Timestamp::UNIX_EPOCH)
                .to_string(),
        })
        .collect()
}

/// What command `task_id` has written so far, as the file holds it: Claude Code's own `[exited with code N]` or
/// `[killed]` line ends it, and stays. `None` for an id that isn't plain, no such file (or not a regular file), or a
/// failed read.
pub fn read_background_output(dir: &Path, task_id: &str) -> Option<String> {
    if !is_plain_id(task_id) {
        return None;
    }
    let path = dir.join(format!("{task_id}.output"));
    // `symlink_metadata` doesn't follow a link: a subagent's transcript link isn't a command's output.
    if !fs::symlink_metadata(&path).ok()?.is_file() {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// The session's `tasks/` folder, when Claude Code's runtime folder and the session's place in it are known.
fn session_dir(session: &str) -> Option<PathBuf> {
    let base = claude_tmp_dir(|key| std::env::var(key).ok(), Platform::current()).ok()?;
    find_session_tasks_dir(&base, session)
}

/// The session's backgrounded commands, oldest first; none when its folder isn't found.
#[tauri::command(async)]
pub fn background_tasks(session: &str) -> Vec<BackgroundTask> {
    session_dir(session).map_or_else(Vec::new, |dir| list_background_tasks(&dir))
}

/// One backgrounded command's output so far; `None` when it can't be read.
#[tauri::command(async)]
pub fn background_output(session: &str, task_id: &str) -> Option<String> {
    read_background_output(&session_dir(session)?, task_id)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{Duration, SystemTime};

    use super::*;
    use crate::paths::{Platform, claude_tmp_dir};

    /// A folder under the temp dir, removed when dropped.
    struct Dir(PathBuf);

    impl Dir {
        fn new(tag: &str) -> Dir {
            let path = std::env::temp_dir().join(format!(
                "flow-cockpit-background-{}-{tag}",
                std::process::id()
            ));
            fs::remove_dir_all(&path).ok();
            fs::create_dir_all(&path).unwrap();
            Dir(path)
        }
    }

    impl Drop for Dir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).ok();
        }
    }

    const SESSION: &str = "3d1f8c17-0000-4000-8000-000000000001";

    fn env(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let vars: Vec<(String, String)> = vars
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect();
        move |key| vars.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
    }

    fn tasks_dir(base: &Path, folder: &str, session: &str) -> PathBuf {
        let dir = base.join(folder).join(session).join("tasks");
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn output(dir: &Path, id: &str, text: &str, age_secs: u64) {
        let path = dir.join(format!("{id}.output"));
        fs::write(&path, text).unwrap();
        let at = SystemTime::now() - Duration::from_secs(age_secs);
        fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(at)
            .unwrap();
    }

    #[test]
    fn finds_a_sessions_tasks_dir_by_id_not_by_cwd() {
        let base = Dir::new("find");
        // The session's cwd was a worktree, but its `tasks/` sits under a folder no form of that cwd gives.
        let want = tasks_dir(&base.0, "-tmp-launch-folder", SESSION);
        tasks_dir(
            &base.0,
            "-home-me-repo--claude-worktrees-w",
            "another-session",
        );
        assert_eq!(find_session_tasks_dir(&base.0, SESSION), Some(want));
        assert_eq!(find_session_tasks_dir(&base.0, "unknown-session"), None);
        assert_eq!(
            find_session_tasks_dir(&base.0.join("missing"), SESSION),
            None
        );
    }

    #[test]
    fn a_session_id_with_a_path_part_finds_nothing() {
        let base = Dir::new("find-unsafe");
        tasks_dir(&base.0, "folder", SESSION);
        for id in ["", "..", "../folder", "a/b", r"a\b"] {
            assert_eq!(find_session_tasks_dir(&base.0, id), None, "{id:?}");
        }
    }

    #[test]
    fn lists_tasks_oldest_first() {
        let base = Dir::new("list");
        let dir = tasks_dir(&base.0, "folder", SESSION);
        output(&dir, "bnewest001", "c", 10);
        output(&dir, "boldest001", "a", 300);
        output(&dir, "bmiddle001", "b", 100);
        fs::write(dir.join("notes.txt"), "not an output").unwrap();
        let ids: Vec<String> = list_background_tasks(&dir)
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["boldest001", "bmiddle001", "bnewest001"]);
        let first = &list_background_tasks(&dir)[0];
        assert!(first.started.ends_with('Z'), "{}", first.started);
        assert_eq!(
            list_background_tasks(&base.0.join("missing")),
            Vec::<BackgroundTask>::new()
        );
    }

    #[cfg(unix)]
    #[test]
    fn skips_subagent_transcript_symlinks() {
        let base = Dir::new("symlinks");
        let dir = tasks_dir(&base.0, "folder", SESSION);
        let transcript = base.0.join("agent-a0115b90ea4c9b854.jsonl");
        fs::write(&transcript, "{}\n").unwrap();
        output(&dir, "birs7h46a", "hello", 5);
        output(&dir, "bxk2m9q1z", "again", 4);
        std::os::unix::fs::symlink(&transcript, dir.join("a0115b90ea4c9b854.output")).unwrap();
        let ids: Vec<String> = list_background_tasks(&dir)
            .into_iter()
            .map(|t| t.id)
            .collect();
        assert_eq!(ids, ["birs7h46a", "bxk2m9q1z"]);
        assert_eq!(
            read_background_output(&dir, "a0115b90ea4c9b854"),
            None,
            "a subagent's transcript link is not a task's output"
        );
    }

    #[test]
    fn reads_a_tasks_output() {
        let base = Dir::new("read");
        let dir = tasks_dir(&base.0, "folder", SESSION);
        let text = "line one\nline two\n[exited with code 0]\n";
        output(&dir, "birs7h46a", text, 5);
        assert_eq!(
            read_background_output(&dir, "birs7h46a").as_deref(),
            Some(text)
        );
    }

    #[test]
    fn missing_output_file_degrades_quietly() {
        let base = Dir::new("missing");
        let dir = tasks_dir(&base.0, "folder", SESSION);
        assert_eq!(read_background_output(&dir, "bnothere01"), None);
        assert_eq!(
            read_background_output(&base.0.join("gone"), "bnothere01"),
            None
        );
        // A folder where the file should be is a read failure too.
        fs::create_dir(dir.join("bisafolder.output")).unwrap();
        assert_eq!(read_background_output(&dir, "bisafolder"), None);
    }

    #[test]
    fn rejects_a_task_id_with_a_path_separator() {
        let base = Dir::new("separator");
        let dir = tasks_dir(&base.0, "folder", SESSION);
        fs::write(base.0.join("secret.output"), "secret").unwrap();
        fs::write(base.0.join("secret"), "secret").unwrap();
        for id in [
            "../../secret",
            "../secret",
            "..",
            "a/b",
            r"..\secret",
            "b.output",
            "",
            "id with space",
            "/etc/passwd",
        ] {
            assert_eq!(read_background_output(&dir, id), None, "{id:?}");
        }
    }

    #[test]
    fn claude_tmp_dir_matches_linux_and_windows() {
        let tmp = |vars: &[(&str, &str)], platform| claude_tmp_dir(env(vars), platform);
        let uid_segment = |dir: &Path| {
            dir.file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .strip_prefix("claude-")
                .unwrap()
                .parse::<u32>()
                .unwrap()
        };

        let linux = Platform::Linux;
        if cfg!(unix) {
            let set = tmp(&[("CLAUDE_CODE_TMPDIR", "/c")], linux).unwrap();
            assert_eq!(set.parent(), Some(Path::new("/c")));
            let tmpdir = tmp(&[("TMPDIR", "/t")], linux).unwrap();
            assert_eq!(tmpdir.parent(), Some(Path::new("/t")));
            // CLAUDE_CODE_TMPDIR wins; an empty one counts as unset.
            let both = tmp(&[("CLAUDE_CODE_TMPDIR", "/c"), ("TMPDIR", "/t")], linux).unwrap();
            assert_eq!(both.parent(), Some(Path::new("/c")));
            let empty = tmp(&[("CLAUDE_CODE_TMPDIR", ""), ("TMPDIR", "")], linux).unwrap();
            assert_eq!(empty.parent(), Some(Path::new("/tmp")));
            assert_eq!(uid_segment(&empty), uid_segment(&set));
            #[cfg(target_os = "linux")]
            {
                use std::os::unix::fs::MetadataExt;
                assert_eq!(
                    uid_segment(&empty),
                    fs::metadata("/proc/self").unwrap().uid()
                );
            }
        }

        let windows = Platform::Windows;
        let user = [("USERNAME", "me")];
        assert_eq!(
            tmp(&[("USERNAME", "me"), ("TEMP", r"C:\T")], windows),
            Ok(PathBuf::from(r"C:\T").join("claude-me"))
        );
        assert_eq!(
            tmp(
                &[
                    ("USERNAME", "me"),
                    ("TEMP", r"C:\T"),
                    ("CLAUDE_CODE_TMPDIR", r"D:\c")
                ],
                windows
            ),
            Ok(PathBuf::from(r"D:\c").join("claude-me"))
        );
        assert_eq!(
            tmp(&[("USERNAME", "me"), ("TMP", r"C:\U")], windows),
            Ok(PathBuf::from(r"C:\U").join("claude-me"))
        );
        assert!(tmp(&user, windows).is_err(), "no temp folder is known");
        assert!(
            tmp(&[("TEMP", r"C:\T")], windows).is_err(),
            "no user is known"
        );
    }
}
