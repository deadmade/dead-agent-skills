//! Saves each exchange beside the `.http` file it came from.

use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Write as _};
use std::path::{Path, PathBuf};

use serde_json::json;

/// A longer run of base64 characters goes to a file of its own, such as a DPD label.
const MAX_BASE64_RUN: usize = 4096;

/// One request and its reply; all the text is already masked.
pub struct Exchange {
    pub method: String,
    pub url: String,
    pub request_headers: Vec<(String, String)>,
    pub request_body: Option<String>,
    pub status: u16,
    pub response_headers: Vec<(String, String)>,
    pub response_body: String,
}

/// Writes `http-replies/<file stem>/<request>/<timestamp>.json` and returns its path.
///
/// # Errors
///
/// Returns why the folder or a file cannot be written.
pub fn save(http_file: &Path, request: &str, exchange: &Exchange) -> Result<PathBuf, String> {
    let (Some(folder), Some(stem)) = (http_file.parent(), http_file.file_stem()) else {
        return Err(format!("{} is not a file", http_file.display()));
    };
    let dir = folder.join("http-replies").join(stem).join(request);
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    // No colon in the name: Windows refuses one.
    let stamp = jiff::Timestamp::now().strftime("%Y%m%dT%H%M%S%.3fZ");
    let (mut file, path, base) = create(&dir, &stamp.to_string())?;
    let body = side_files(&exchange.response_body, &dir, &base)?;
    let saved = json!({
        "request": {
            "method": exchange.method,
            "url": exchange.url,
            "headers": exchange.request_headers,
            "body": exchange.request_body,
        },
        "response": {
            "status": exchange.status,
            "headers": exchange.response_headers,
            "body": body,
        },
    });
    let text = serde_json::to_vec_pretty(&saved).map_err(|e| format!("cannot encode: {e}"))?;
    file.write_all(&text)
        .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    Ok(path)
}

/// Creates `<stamp>.json`, or the next of `<stamp>-2.json` and so on when the name is taken.
fn create(dir: &Path, stamp: &str) -> Result<(File, PathBuf, String), String> {
    let mut n = 1;
    loop {
        let base = if n == 1 {
            stamp.to_string()
        } else {
            format!("{stamp}-{n}")
        };
        let path = dir.join(format!("{base}.json"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((file, path, base)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => n += 1,
            Err(e) => return Err(format!("cannot create {}: {e}", path.display())),
        }
    }
}

/// `body` with each long run of base64 characters written to its own file and replaced by that
/// file's name.
fn side_files(body: &str, dir: &Path, base: &str) -> Result<String, String> {
    let base64 = |c: char| c.is_ascii_alphanumeric() || "+/=".contains(c);
    let (mut out, mut rest, mut count) = (String::new(), body, 0);
    while let Some(start) = rest.find(base64) {
        let tail = &rest[start..];
        let (run, after) = tail.split_at(tail.find(|c| !base64(c)).unwrap_or(tail.len()));
        out.push_str(&rest[..start]);
        if run.len() > MAX_BASE64_RUN {
            count += 1;
            let name = format!("{base}.body-{count}.b64");
            let path = dir.join(&name);
            std::fs::write(&path, run)
                .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
            out.push_str(&name);
        } else {
            out.push_str(run);
        }
        rest = after;
    }
    out.push_str(rest);
    Ok(out)
}
