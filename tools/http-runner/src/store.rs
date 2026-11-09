//! What the user typed on the login page, kept per host in a per-user file outside the project.

use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::{DirBuilder, OpenOptions};
use std::io::{ErrorKind, Write};
#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

/// The saved logins: host, then value name, then the typed value. A host with a key is confirmed.
type Logins = BTreeMap<String, BTreeMap<String, String>>;

/// The folder that holds `logins.json`.
#[derive(Debug, Clone)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    /// Opens the store in `HTTP_RUNNER_DIR`, else the per-user data folder.
    ///
    /// # Errors
    /// Returns that there is no folder to keep it in, when the environment names no home.
    pub fn open() -> Result<Self, String> {
        dir_from(|k| std::env::var_os(k).filter(|v| !v.is_empty()))
            .map(Self::at)
            .ok_or_else(|| {
                "no home folder to keep the saved logins in; set HTTP_RUNNER_DIR".to_string()
            })
    }

    /// A store in `dir`, which `save` creates when it is missing.
    #[must_use]
    pub fn at(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// The names in `names` that have no saved value for `host`, in the order given.
    ///
    /// # Errors
    /// Returns why the saved logins cannot be read.
    pub fn missing(&self, host: &str, names: &[String]) -> Result<Vec<String>, String> {
        let saved = self.load()?.remove(host).unwrap_or_default();
        Ok(names
            .iter()
            .filter(|n| !saved.contains_key(*n))
            .cloned()
            .collect())
    }

    /// Whether the user has confirmed `host`, with or without values.
    ///
    /// # Errors
    /// Returns why the saved logins cannot be read.
    pub fn is_confirmed(&self, host: &str) -> Result<bool, String> {
        Ok(self.load()?.contains_key(host))
    }

    /// The value saved for `name` on `host`; a value never leaves the host it was typed for.
    ///
    /// # Errors
    /// Returns why the saved logins cannot be read.
    pub fn get(&self, host: &str, name: &str) -> Result<Option<String>, String> {
        Ok(self.load()?.remove(host).and_then(|mut v| v.remove(name)))
    }

    /// Every value saved for `host`, for masking.
    ///
    /// # Errors
    /// Returns why the saved logins cannot be read.
    pub fn values(&self, host: &str) -> Result<Vec<String>, String> {
        Ok(self
            .load()?
            .remove(host)
            .map(|v| v.into_values().collect())
            .unwrap_or_default())
    }

    /// Confirms `host` and saves `values` for it, over any it already had. The file is read
    /// again just before it is replaced, so another session's hosts survive.
    ///
    /// # Errors
    /// Returns why the saved logins cannot be read or the file cannot be written.
    pub fn save(&self, host: &str, values: &BTreeMap<String, String>) -> Result<(), String> {
        let mut logins = self.load()?;
        logins
            .entry(host.to_string())
            .or_default()
            .extend(values.clone());
        let json = serde_json::to_vec_pretty(&logins)
            .map_err(|e| format!("cannot encode the saved logins: {e}"))?;

        let mut dir = DirBuilder::new();
        dir.recursive(true);
        #[cfg(unix)]
        dir.mode(0o700);
        dir.create(&self.dir)
            .map_err(|e| format!("cannot create {}: {e}", self.dir.display()))?;

        // A rename in the same folder is atomic, so a reader or a crash never meets half a file.
        let file = self.file();
        let temp = self
            .dir
            .join(format!("logins.json.{}.tmp", std::process::id()));
        let written = write_private(&temp, &json).and_then(|()| std::fs::rename(&temp, &file));
        if let Err(e) = written {
            let _ = std::fs::remove_file(&temp);
            return Err(format!("cannot write {}: {e}", file.display()));
        }
        Ok(())
    }

    fn file(&self) -> PathBuf {
        self.dir.join("logins.json")
    }

    /// An absent file is no logins; one that cannot be read is an error, so `save` never
    /// replaces what it could not read. The message holds no text from the file, which has secrets.
    fn load(&self) -> Result<Logins, String> {
        let file = self.file();
        let bytes = match std::fs::read(&file) {
            Ok(b) => b,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Logins::new()),
            Err(e) => return Err(format!("cannot read {}: {e}", file.display())),
        };
        serde_json::from_slice(&bytes).map_err(|e| {
            format!(
                "the saved logins in {} are damaged (line {}, column {}); fix or delete the file",
                file.display(),
                e.line(),
                e.column()
            )
        })
    }
}

/// On Windows the per-user data folder's own permissions keep other users out.
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    options.mode(0o600);
    options.open(path)?.write_all(bytes)
}

/// Never a shared folder such as the temp dir, where another user could plant a file.
fn dir_from(env: impl Fn(&str) -> Option<OsString>) -> Option<PathBuf> {
    if let Some(dir) = env("HTTP_RUNNER_DIR") {
        return Some(dir.into());
    }
    let data = if cfg!(windows) {
        env("LOCALAPPDATA").map(PathBuf::from)
    } else {
        env("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| env("HOME").map(|h| PathBuf::from(h).join(".local/share")))
    };
    data.map(|d| d.join("http-runner"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A folder name no other test or run shares; `save` creates the folder.
    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("http-runner-store-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn typed(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|&(k, v)| (k.into(), v.into())).collect()
    }

    #[test]
    fn value_belongs_to_one_host() {
        let store = Store::at(scratch("one-host"));
        let name = ["DHL_PASSWORD".to_string()];
        store
            .save("a.example", &typed(&[("DHL_PASSWORD", "s3cret-pw")]))
            .unwrap();
        assert_eq!(
            store.get("a.example", "DHL_PASSWORD").unwrap().as_deref(),
            Some("s3cret-pw")
        );
        assert_eq!(store.get("b.example", "DHL_PASSWORD").unwrap(), None);
        assert_eq!(store.missing("b.example", &name).unwrap(), name);
        assert_eq!(
            store.missing("a.example", &name).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn confirmed_with_no_values() {
        let store = Store::at(scratch("confirmed"));
        assert!(!store.is_confirmed("a.example").unwrap());
        store.save("a.example", &BTreeMap::new()).unwrap();
        assert!(store.is_confirmed("a.example").unwrap());
        assert_eq!(store.values("a.example").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn save_merges_and_overwrites() {
        let store = Store::at(scratch("merge"));
        store
            .save(
                "a.example",
                &typed(&[("USER", "first-user"), ("KEY", "old-key")]),
            )
            .unwrap();
        store
            .save(
                "a.example",
                &typed(&[("KEY", "new-key"), ("PASSWORD", "pw-value")]),
            )
            .unwrap();
        // Values come back by name: KEY overwritten, PASSWORD added, USER kept.
        assert_eq!(
            store.values("a.example").unwrap(),
            ["new-key", "pw-value", "first-user"]
        );
    }

    #[test]
    fn save_keeps_another_sessions_host() {
        let dir = scratch("sessions");
        let (first, second) = (Store::at(dir.clone()), Store::at(dir));
        first
            .save("a.example", &typed(&[("N", "value-a")]))
            .unwrap();
        second
            .save("b.example", &typed(&[("N", "value-b")]))
            .unwrap();
        for store in [&first, &second] {
            assert_eq!(store.values("a.example").unwrap(), ["value-a"]);
            assert_eq!(store.values("b.example").unwrap(), ["value-b"]);
        }
    }

    #[cfg(unix)]
    #[test]
    fn written_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("private");
        Store::at(dir.clone())
            .save("a.example", &typed(&[("N", "value-a")]))
            .unwrap();
        let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&dir), 0o700);
        assert_eq!(mode(&dir.join("logins.json")), 0o600);
        let files: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        assert_eq!(files.len(), 1, "no temporary file is left behind");
    }

    #[test]
    fn corrupt_file_is_an_error_not_empty() {
        let dir = scratch("corrupt");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("logins.json");
        let store = Store::at(dir);
        // The second file is valid JSON of the wrong shape: serde's message would quote the number.
        for body in [
            r#"{"a.example": {"N": "half"#,
            r#"{"a.example": {"N": 48151623}}"#,
        ] {
            std::fs::write(&file, body).unwrap();
            let errors = [
                store.get("a.example", "N").map(|_| ()),
                store.is_confirmed("a.example").map(|_| ()),
                store.missing("a.example", &[]).map(|_| ()),
                store.values("a.example").map(|_| ()),
                store.save("b.example", &BTreeMap::new()),
            ];
            for result in errors {
                let message = result.unwrap_err();
                assert!(message.contains("logins.json"), "{message}");
                assert!(!message.contains("48151623"), "{message}");
            }
            assert_eq!(std::fs::read_to_string(&file).unwrap(), body);
        }
    }

    #[test]
    fn dir_precedence() {
        fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<OsString> + 'a {
            move |k| {
                pairs
                    .iter()
                    .find(|(n, _)| *n == k)
                    .map(|(_, v)| OsString::from(v))
            }
        }
        let data = if cfg!(windows) {
            "LOCALAPPDATA"
        } else {
            "XDG_DATA_HOME"
        };
        assert_eq!(dir_from(env(&[])), None);
        assert_eq!(
            dir_from(env(&[("HTTP_RUNNER_DIR", "/s"), (data, "/d")])),
            Some(PathBuf::from("/s"))
        );
        assert_eq!(
            dir_from(env(&[(data, "/d"), ("HOME", "/h")])),
            Some(PathBuf::from("/d").join("http-runner"))
        );
        if !cfg!(windows) {
            assert_eq!(
                dir_from(env(&[("HOME", "/h")])),
                Some(PathBuf::from("/h/.local/share/http-runner"))
            );
        }
    }
}
