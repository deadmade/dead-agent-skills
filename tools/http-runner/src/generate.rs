//! Writes a `.http` file from a local `OpenAPI` 3 file: one named request per operation, the spec's first example as its body.
//!
//! A spec is untrusted text. It reaches the file only as a comment collapsed to one line, as a name reduced to letters,
//! digits, `_` and `-`, or as a path, media type, base URL or body that passed a check; whatever fails one is left out,
//! with a comment saying why. `body_problem` mirrors what `parse` does with a body line, so change them together.

use std::cell::Cell;
use std::collections::HashSet;
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::de::{
    self, DeserializeSeed, Deserializer, EnumAccess, MapAccess, SeqAccess, VariantAccess, Visitor,
};
use serde_norway::Value;
use url::Url;

const METHODS: [&str; 7] = ["get", "put", "post", "delete", "options", "head", "patch"];
const MAX_REF_STEPS: usize = 32;
/// The largest spec file read: libyaml holds every event of a file before anything else sees it, so this bounds memory.
const MAX_READ_BYTES: usize = 8 << 20;
/// The most the file written and any one body in it may hold.
const MAX_OUTPUT_BYTES: usize = 32 << 20;
/// How long reading a spec may take: libyaml scans some small files in quadratic time.
const DEADLINE: Duration = Duration::from_secs(10);
/// What one YAML node is counted as, beside its text: the limit comes to five million nodes.
const NODE_COST: usize = 64;
const MAX_EXPANDED: usize = 5_000_000 * NODE_COST;
const HINT: &str = "You can write the .http file yourself instead";

#[derive(Debug)]
pub struct Generated {
    pub path: PathBuf,
    pub requests: usize,
    /// Requests that carry a body.
    pub with_body: usize,
}

/// A request body taken from the spec, already checked.
struct Body {
    media: String,
    text: String,
    /// Names of the examples after the one used.
    others: Vec<String>,
}

/// Writes `<output>/<spec's file stem>.http` and never replaces a file.
///
/// # Errors
///
/// Returns readable text, ending with the hint that the agent can write the file itself, when the spec cannot be
/// read or is not `OpenAPI` 3, no single base URL can be told, or the target exists.
pub fn generate(spec: &Path, output: &Path, base_url: Option<&str>) -> Result<Generated, String> {
    write(spec, output, base_url).map_err(|e| format!("{e}. {HINT}"))
}

fn write(spec: &Path, output: &Path, base_url: Option<&str>) -> Result<Generated, String> {
    for (what, path) in [("spec", spec), ("output", output)] {
        if !path.is_absolute() {
            return Err(format!(
                "{what} must be an absolute path, got {}",
                path.display()
            ));
        }
    }
    let (text, requests, with_body) = build(spec, base_url)?;
    let mut file_name = spec.file_stem().unwrap_or_default().to_owned();
    file_name.push(".http");
    let path = output.join(file_name);
    fs::create_dir_all(output).map_err(|e| format!("cannot create {}: {e}", output.display()))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| match e.kind() {
            ErrorKind::AlreadyExists => format!(
                "{} already exists and generate never replaces a file; edit it, or choose another output folder",
                path.display()
            ),
            _ => format!("cannot create {}: {e}", path.display()),
        })?;
    file.write_all(text.as_bytes())
        .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    Ok(Generated {
        path,
        requests,
        with_body,
    })
}

/// Reads the spec and renders the file, on a worker thread that is given `DEADLINE`, so a spec the YAML reader
/// takes long over costs that long and no more. Nothing is created until this returns.
///
/// shortcut: a thread cannot be stopped, so a worker that overruns is left to finish on its own, holding a core and
/// the spec's memory until libyaml is done; move to a child process that can be killed if such workers pile up.
fn build(spec: &Path, base_url: Option<&str>) -> Result<(String, usize, usize), String> {
    let (spec, base_url) = (spec.to_owned(), base_url.map(str::to_owned));
    let (send, receive) = mpsc::channel();
    thread::spawn(move || {
        let built = read_spec(&spec).and_then(|doc| {
            let base = base(&doc, base_url.as_deref())?;
            let name = spec
                .file_name()
                .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
            render(&doc, &name, &base)
        });
        // After a timeout nobody is listening.
        let _ = send.send(built);
    });
    receive.recv_timeout(DEADLINE).map_err(|_| {
        format!(
            "the spec could not be read within {} seconds",
            DEADLINE.as_secs()
        )
    })?
}

fn read_spec(spec: &Path) -> Result<Value, String> {
    let cannot = |e: &dyn std::fmt::Display| format!("cannot read {}: {e}", spec.display());
    let meta = fs::metadata(spec).map_err(|e| cannot(&e))?;
    if !meta.is_file() {
        return Err(format!("{} is not a file", spec.display()));
    }
    if meta.len() > MAX_READ_BYTES as u64 {
        return Err(format!(
            "{} is larger than {MAX_READ_BYTES} bytes",
            spec.display()
        ));
    }
    let text = fs::read_to_string(spec).map_err(|e| cannot(&e))?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    // JSON goes through serde_json because it allows tabs, which YAML does not; both keep the file's key order.
    let doc: Value = if text.trim_start().starts_with('{') {
        serde_json::from_str(text).map_err(|e| format!("the spec is not valid JSON: {e}"))?
    } else {
        yaml(text)?
    };
    let version = match doc.get("openapi") {
        Some(Value::String(s)) => s.clone(),
        // `openapi: 3.0` unquoted is a number.
        Some(Value::Number(n)) => n.to_string(),
        _ if doc.get("swagger").is_some() => {
            return Err("this is a Swagger 2 file, and only OpenAPI 3 is read".to_owned());
        }
        _ => return Err("the file has no `openapi: 3.x` field".to_owned()),
    };
    if !version.starts_with("3.") {
        return Err(format!(
            "OpenAPI {} is not read, only 3.x",
            one_line(&version)
        ));
    }
    Ok(doc)
}

/// Reads YAML after a cheap refusal of aliases, which `Value` would keep a copy of at every use.
fn yaml(text: &str) -> Result<Value, String> {
    let cost = Cell::new(0);
    let counted = Cost(&cost).deserialize(serde_norway::Deserializer::from_str(text));
    if cost.get() > MAX_EXPANDED {
        return Err(format!(
            "the spec expands to more than {} YAML nodes once its aliases are replayed",
            MAX_EXPANDED / NODE_COST
        ));
    }
    counted.map_err(|e| format!("the spec is not valid YAML: {e}"))?;
    serde_norway::from_str(text).map_err(|e| format!("the spec is not valid YAML: {e}"))
}

/// Adds up what a YAML document expands to, aliases replayed, and keeps none of it.
#[derive(Clone, Copy)]
struct Cost<'a>(&'a Cell<usize>);

impl Cost<'_> {
    fn add<E: de::Error>(self, n: usize) -> Result<(), E> {
        let total = self.0.get().saturating_add(n);
        self.0.set(total);
        if total > MAX_EXPANDED {
            return Err(E::custom("the document is too large once expanded"));
        }
        Ok(())
    }
}

impl<'de> DeserializeSeed<'de> for Cost<'_> {
    type Value = ();

    fn deserialize<D: Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        self.add(NODE_COST)?;
        d.deserialize_any(self)
    }
}

/// Visits the kinds of node `Value` does, so a document `Value` reads is one this reads.
impl<'de> Visitor<'de> for Cost<'_> {
    type Value = ();

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a YAML value")
    }

    fn visit_bool<E>(self, _: bool) -> Result<(), E> {
        Ok(())
    }

    fn visit_i64<E>(self, _: i64) -> Result<(), E> {
        Ok(())
    }

    fn visit_u64<E>(self, _: u64) -> Result<(), E> {
        Ok(())
    }

    fn visit_f64<E>(self, _: f64) -> Result<(), E> {
        Ok(())
    }

    fn visit_unit<E>(self) -> Result<(), E> {
        Ok(())
    }

    fn visit_none<E>(self) -> Result<(), E> {
        Ok(())
    }

    fn visit_str<E: de::Error>(self, s: &str) -> Result<(), E> {
        self.add(s.len())
    }

    fn visit_some<D: Deserializer<'de>>(self, d: D) -> Result<(), D::Error> {
        self.deserialize(d)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<(), A::Error> {
        while seq.next_element_seed(self)?.is_some() {}
        Ok(())
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<(), A::Error> {
        while map.next_key_seed(self)?.is_some() {
            map.next_value_seed(self)?;
        }
        Ok(())
    }

    fn visit_enum<A: EnumAccess<'de>>(self, data: A) -> Result<(), A::Error> {
        // Reading the tag as a seed charges its text, which every replay of an alias copies.
        let ((), tagged) = data.variant_seed(self)?;
        tagged.newtype_variant_seed(self)
    }
}

/// `base_url`, else the spec's only server: a spec's first server is often production.
fn base(doc: &Value, given: Option<&str>) -> Result<String, String> {
    if let Some(given) = given {
        return check_base(given).map_err(|why| format!("base_url {} {why}", one_line(given)));
    }
    let servers: Vec<&str> = doc
        .get("servers")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .map(|s| s.get("url").and_then(Value::as_str).unwrap_or_default())
        .collect();
    match servers.as_slice() {
        [one] => check_base(one).map_err(|why| {
            format!(
                "the spec's only server {} {why}; pass base_url",
                one_line(one)
            )
        }),
        [] => Err("the spec lists no server; pass base_url".to_owned()),
        many => Err(format!(
            "the spec lists {} servers ({}), and the first is often production; pass base_url with the one to use",
            many.len(),
            many.iter()
                .map(|s| one_line(s))
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

/// An absolute http(s) URL without credentials, query, fragment, braces or whitespace, minus its trailing `/`.
fn check_base(url: &str) -> Result<String, String> {
    let url = url.trim_end_matches('/');
    // `Url::parse` drops tabs and newlines, so the raw text is checked for them first.
    if url
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || matches!(c, '{' | '}'))
    {
        return Err(
            "holds whitespace, a control character or a brace (a server variable)".to_owned(),
        );
    }
    let parsed = Url::parse(url).map_err(|e| format!("is not a URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "is not an absolute http(s) URL without credentials, query or fragment".to_owned(),
        );
    }
    Ok(url.to_owned())
}

/// The file's text, how many requests it holds and how many of them carry a body.
fn render(doc: &Value, spec_name: &str, base: &str) -> Result<(String, usize, usize), String> {
    let (mut lines, mut size) = (Vec::new(), 0);
    let header = [
        format!("# Generated from {} by http-runner", one_line(spec_name)),
        format!("@baseUrl = {base}"),
    ];
    append(&mut lines, &mut size, header)?;
    let (mut requests, mut with_body) = (0, 0);
    let mut names = HashSet::new();
    let paths = doc.get("paths").and_then(Value::as_mapping);
    for (key, item) in paths.into_iter().flatten() {
        let Some(path) = key.as_str() else {
            let block = skipped("a path that is not text", "paths are read as text");
            append(&mut lines, &mut size, block)?;
            continue;
        };
        let item = match resolve(doc, item) {
            Ok(item) => item,
            Err(why) => {
                append(&mut lines, &mut size, skipped(path, &why))?;
                continue;
            }
        };
        if let Some(why) = path_problem(path) {
            append(&mut lines, &mut size, skipped(path, why))?;
            continue;
        }
        for method in METHODS {
            let Some(op) = item.get(method) else {
                continue;
            };
            let name = unique(&mut names, &operation_name(op, method, path));
            let (block, has_body) =
                operation(doc, item, op, &method.to_ascii_uppercase(), path, &name);
            append(&mut lines, &mut size, block)?;
            requests += 1;
            with_body += usize::from(has_body);
        }
    }
    lines.push(String::new());
    Ok((lines.join("\n"), requests, with_body))
}

/// Adds `block` to the file and refuses once it passes `MAX_OUTPUT_BYTES`: the spec holds a `$ref`'d example once,
/// but the file repeats it for every operation that uses it.
fn append(
    lines: &mut Vec<String>,
    size: &mut usize,
    block: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    for line in block {
        *size += line.len() + 1;
        lines.push(line);
    }
    if *size > MAX_OUTPUT_BYTES {
        return Err(format!(
            "the file would pass {MAX_OUTPUT_BYTES} bytes, because the spec repeats large examples"
        ));
    }
    Ok(())
}

/// A block that holds a comment and no request, for what the file cannot carry.
fn skipped(what: &str, why: &str) -> [String; 3] {
    [
        String::new(),
        format!("### skipped {}", one_line(what)),
        comment("skipped", why),
    ]
}

/// The path goes into the request line and the `###` line, so it may hold neither whitespace nor a token.
fn path_problem(path: &str) -> Option<&'static str> {
    if !path.starts_with('/') {
        Some("a path starts with `/`")
    } else if path.chars().any(|c| c.is_whitespace() || c.is_control()) {
        Some("the path holds whitespace or a control character")
    } else if path.contains("{{") {
        Some("the path holds `{{`, which the runner reads as a token")
    } else {
        None
    }
}

/// One request block: its comments, name, request line, `Content-Type` and body.
fn operation(
    doc: &Value,
    item: &Value,
    op: &Value,
    method: &str,
    path: &str,
    name: &str,
) -> (Vec<String>, bool) {
    let mut block = vec![String::new(), format!("### {method} {path}")];
    if let Some(summary) = op.get("summary").and_then(Value::as_str) {
        block.push(comment("summary", summary));
    }
    let params = parameters(doc, item, op);
    if !params.is_empty() {
        block.push(comment("parameters", &params.join(", ")));
    }
    let mut body = None;
    if let Some(request_body) = op.get("requestBody") {
        match request_body_of(doc, request_body) {
            Ok(b) => {
                if !b.others.is_empty() {
                    block.push(comment("other examples", &b.others.join(", ")));
                }
                body = Some(b);
            }
            Err(why) => block.push(comment("no body", &why)),
        }
    }
    block.push(format!("# @name {name}"));
    block.push(format!("{method} {{{{baseUrl}}}}{path}"));
    let has_body = body.is_some();
    if let Some(b) = body {
        block.extend([format!("Content-Type: {}", b.media), String::new(), b.text]);
    }
    (block, has_body)
}

/// Path-level parameters, then the operation's, each as `name (in)`.
fn parameters(doc: &Value, item: &Value, op: &Value) -> Vec<String> {
    let mut listed = Vec::new();
    for list in [item.get("parameters"), op.get("parameters")] {
        for param in list.and_then(Value::as_sequence).into_iter().flatten() {
            if let Ok(p) = resolve(doc, param)
                && let (Some(name), Some(place)) = (
                    p.get("name").and_then(Value::as_str),
                    p.get("in").and_then(Value::as_str),
                )
            {
                let entry = format!("{name} ({place})");
                if !listed.contains(&entry) {
                    listed.push(entry);
                }
            }
        }
    }
    listed
}

fn request_body_of(doc: &Value, request_body: &Value) -> Result<Body, String> {
    let request_body = resolve(doc, request_body)?;
    let (media, entry) = request_body
        .get("content")
        .and_then(Value::as_mapping)
        .and_then(|content| content.iter().next())
        .ok_or("the request body lists no media type")?;
    let media = media.as_str().unwrap_or_default();
    let essence = plain_media_type(media)
        .ok_or_else(|| format!("the media type {media} is not a plain type/subtype"))?;
    let (value, others) = example(doc, entry)?;
    let text = match value {
        Value::String(s) if s.len() > MAX_OUTPUT_BYTES => return Err(too_large()),
        Value::String(s) => s.clone(),
        v if is_json(essence) => pretty(v)?,
        _ => {
            return Err(format!(
                "the example is structured and {essence} is not JSON, so it is not converted"
            ));
        }
    };
    if let Some(why) = body_problem(&text) {
        return Err(format!("the example {why}"));
    }
    Ok(Body {
        media: media.to_owned(),
        text,
        others,
    })
}

fn too_large() -> String {
    format!("the example is larger than {MAX_OUTPUT_BYTES} bytes")
}

/// An example as pretty JSON, stopped at `MAX_OUTPUT_BYTES`: indentation makes a deeply nested one far larger than its source.
fn pretty(value: &Value) -> Result<String, String> {
    struct Capped(Vec<u8>);

    impl Write for Capped {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            if self.0.len() + data.len() > MAX_OUTPUT_BYTES {
                return Err(io::Error::other("over the limit"));
            }
            self.0.extend_from_slice(data);
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    let mut out = Capped(Vec::new());
    serde_json::to_writer_pretty(&mut out, value).map_err(|e| {
        if e.is_io() {
            too_large()
        } else {
            format!("the example cannot be written as JSON: {e}")
        }
    })?;
    Ok(String::from_utf8_lossy(&out.0).into_owned())
}

/// The media-level `example`, else the first of `examples`, else the schema's `example`, with the names of the other examples.
fn example<'a>(doc: &'a Value, media: &'a Value) -> Result<(&'a Value, Vec<String>), String> {
    if let Some(v) = media.get("example") {
        return Ok((v, Vec::new()));
    }
    let mut why = "the spec gives no example for it".to_owned();
    if let Some(examples) = media.get("examples").and_then(Value::as_mapping)
        && let Some(first) = examples.values().next()
    {
        let others = examples
            .keys()
            .skip(1)
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect();
        match resolve(doc, first).map(|e| (e.get("value"), e.get("externalValue"))) {
            Ok((Some(v), _)) => return Ok((v, others)),
            Ok((None, Some(_))) => {
                "the first example is an `externalValue`, which is not followed"
                    .clone_into(&mut why);
            }
            Ok(_) => "the first example has no `value`".clone_into(&mut why),
            Err(e) => why = e,
        }
    }
    if let Some(schema) = media.get("schema") {
        match resolve(doc, schema) {
            Ok(s) => {
                if let Some(v) = s.get("example") {
                    return Ok((v, Vec::new()));
                }
            }
            Err(e) => why = e,
        }
    }
    Err(why)
}

/// `type/subtype` of a media type that fits a header line and names one concrete type.
fn plain_media_type(media: &str) -> Option<&str> {
    let essence = media.split(';').next()?;
    let name = |p: &str| {
        !p.is_empty()
            && p.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"+-._".contains(&b))
    };
    let plain = essence
        .split_once('/')
        .is_some_and(|(t, s)| name(t) && name(s));
    (plain
        && media
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/+-._;= \"".contains(&b)))
    .then_some(essence)
}

fn is_json(essence: &str) -> bool {
    let essence = essence.to_ascii_lowercase();
    essence == "application/json" || essence.ends_with("+json")
}

/// What in a body would add a request, a token or a file import to the file.
fn body_problem(text: &str) -> Option<&'static str> {
    let lines = || text.split(['\r', '\n']);
    if text.trim().is_empty() {
        Some("is empty")
    } else if text.contains("{{") {
        Some("holds `{{`, which the runner reads as a token")
    } else if lines().any(|l| l.starts_with("###")) {
        Some("has a line starting with `###`, which starts another request")
    } else if lines().any(|l| {
        l.trim_start()
            .strip_prefix('<')
            .is_some_and(|r| r.starts_with(|c: char| c.is_whitespace() || c == '@'))
    }) {
        Some("has a line starting with `<` and a space or `@`, which reads as a file import")
    } else {
        None
    }
}

/// The `operationId`, else `<method>_<path>`, reduced to a name the parser accepts.
fn operation_name(op: &Value, method: &str, path: &str) -> String {
    let reduce = |s: &str| {
        s.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join("_")
    };
    op.get("operationId")
        .and_then(Value::as_str)
        .map(reduce)
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| reduce(&format!("{method} {path}")))
}

/// Names become folder names, which Windows compares without case.
fn unique(taken: &mut HashSet<String>, name: &str) -> String {
    let mut candidate = name.to_owned();
    let mut n = 2;
    while !taken.insert(candidate.to_ascii_lowercase()) {
        candidate = format!("{name}_{n}");
        n += 1;
    }
    candidate
}

/// A comment line: its text on one line, after a label so it can never read as `@name` or a variable.
fn comment(label: &str, text: &str) -> String {
    format!("# {label}: {}", one_line(text))
}

fn one_line(text: &str) -> String {
    text.split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Follows `$ref`s that start with `#/`; any other is a file or a host.
fn resolve<'a>(doc: &'a Value, mut node: &'a Value) -> Result<&'a Value, String> {
    for _ in 0..=MAX_REF_STEPS {
        let Some(target) = node.get("$ref") else {
            return Ok(node);
        };
        let target = target.as_str().unwrap_or_default();
        let pointer = target.strip_prefix("#/").ok_or_else(|| {
            format!(
                "the $ref {} is not local (`#/...`), so it is not followed",
                one_line(target)
            )
        })?;
        node = pointer
            .split('/')
            .try_fold(doc, |at, part| {
                at.get(part.replace("~1", "/").replace("~0", "~").as_str())
            })
            .ok_or_else(|| format!("the $ref {} points at nothing", one_line(target)))?;
    }
    Err(format!(
        "more than {MAX_REF_STEPS} $ref steps in a row (a cycle?)"
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::parse::{self, ParsedFile, Part, Request};

    const BASE: &str = "https://sandbox.example";
    const HEAD: &str = "openapi: 3.0.3\ninfo: {title: t, version: '1'}\n";

    /// A fresh folder named for the test, so parallel tests share nothing.
    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("http-runner-generate-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Generates from `spec` written as `<tag>/<file>` into `<tag>/out`; what it wrote must parse.
    fn gen_file(
        tag: &str,
        file: &str,
        spec: &str,
        base: Option<&str>,
    ) -> Result<(Generated, String, ParsedFile), String> {
        let dir = scratch(tag);
        fs::write(dir.join(file), spec).unwrap();
        let made = generate(&dir.join(file), &dir.join("out"), base)?;
        let text = fs::read_to_string(&made.path).unwrap();
        let parsed = parse::parse(&text).unwrap_or_else(|e| panic!("{e}\n{text}"));
        Ok((made, text, parsed))
    }

    /// `rest` follows the `OpenAPI` header and starts with `paths:`; the base URL is passed in.
    fn ok(tag: &str, rest: &str) -> (Generated, String, ParsedFile) {
        gen_file(tag, "api.yaml", &format!("{HEAD}{rest}"), Some(BASE)).unwrap()
    }

    fn refused(tag: &str, rest: &str, base: Option<&str>) -> String {
        let Err(err) = gen_file(tag, "api.yaml", &format!("{HEAD}{rest}"), base) else {
            panic!("expected a refusal");
        };
        assert!(!scratch_out(tag).exists(), "a refusal writes nothing");
        err
    }

    fn scratch_out(tag: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("http-runner-generate-{tag}-{}", std::process::id()))
            .join("out")
    }

    fn body(r: &Request) -> Option<String> {
        r.body.as_ref().map(|t| {
            t.0.iter()
                .map(|p| match p {
                    Part::Lit(s) => s.as_str(),
                    other => panic!("a token in the body: {other:?}"),
                })
                .collect()
        })
    }

    fn names(file: &ParsedFile) -> Vec<&str> {
        file.requests
            .iter()
            .map(|r| r.name.as_deref().unwrap())
            .collect()
    }

    fn one(key: &str, value: &str) -> String {
        format!("{{\n  \"{key}\": \"{value}\"\n}}")
    }

    #[test]
    fn first_example_word_for_word() {
        let (made, text, file) = ok(
            "first-example",
            r"
paths:
  /orders:
    post:
      operationId: createOrders
      requestBody:
        content:
          application/json:
            examples:
              zulu: {$ref: '#/components/examples/Zulu'}
              alpha: {$ref: '#/components/examples/Alpha'}
components:
  examples:
    Alpha:
      value: {profile: other}
    Zulu:
      value: {shipments: [{weight: 1.5, id: 7}], profile: standard}
",
        );
        let expected = "{\n  \"shipments\": [\n    {\n      \"weight\": 1.5,\n      \"id\": 7\n    }\n  ],\n  \"profile\": \"standard\"\n}";
        assert_eq!(body(&file.requests[0]).as_deref(), Some(expected));
        assert!(text.contains("# other examples: alpha\n"), "{text}");
        assert_eq!((made.requests, made.with_body), (1, 1));
    }

    #[test]
    fn example_forms() {
        let (_, _, file) = ok(
            "forms",
            r"
paths:
  /a:
    post:
      operationId: a
      requestBody:
        content:
          application/json:
            example: {from: media}
            examples: {one: {value: {from: examples}}}
            schema: {example: {from: schema}}
  /b:
    post:
      operationId: b
      requestBody:
        content:
          application/json:
            examples: {one: {value: {from: examples}}}
            schema: {example: {from: schema}}
  /c:
    post:
      operationId: c
      requestBody:
        content:
          application/json:
            schema: {$ref: '#/components/schemas/S'}
components:
  schemas:
    S: {example: {from: schema}}
",
        );
        let got: Vec<_> = file.requests.iter().map(body).collect();
        assert_eq!(
            got,
            [
                Some(one("from", "media")),
                Some(one("from", "examples")),
                Some(one("from", "schema"))
            ]
        );
    }

    #[test]
    fn request_body_ref_is_resolved() {
        let (made, _, file) = ok(
            "body-ref",
            r"
paths:
  /a:
    post:
      operationId: a
      requestBody: {$ref: '#/components/requestBodies/X'}
components:
  requestBodies:
    X:
      content:
        application/json:
          example: {from: ref}
",
        );
        assert_eq!(body(&file.requests[0]), Some(one("from", "ref")));
        assert_eq!(made.with_body, 1);
    }

    #[test]
    fn no_example_means_no_body_and_a_comment() {
        let (made, text, file) = ok(
            "no-example",
            r"
paths:
  /a:
    post: {operationId: with, requestBody: {content: {application/json: {example: {a: 1}}}}}
  /b:
    post: {operationId: without, requestBody: {content: {application/json: {schema: {type: object}}}}}
  /c:
    get: {operationId: plain}
",
        );
        assert_eq!((made.requests, made.with_body), (3, 1));
        assert_eq!(body(&file.requests[1]), None);
        assert_eq!(
            text.matches("# no body: the spec gives no example").count(),
            1
        );
    }

    #[test]
    fn external_examples_and_remote_refs_are_not_followed() {
        let (made, text, file) = ok(
            "external",
            r"
paths:
  /a:
    post:
      operationId: external
      requestBody:
        content:
          application/json:
            examples: {one: {externalValue: 'https://x.example/a.json'}}
  /b:
    post:
      operationId: remote
      requestBody:
        $ref: 'https://x.example/a.yaml'
",
        );
        assert_eq!((made.requests, made.with_body), (2, 0));
        assert!(file.requests.iter().all(|r| r.body.is_none()));
        assert!(text.contains("externalValue"), "{text}");
        assert!(text.contains("is not local"), "{text}");
    }

    #[test]
    fn ref_cycle_is_not_followed() {
        let (made, text, _) = ok(
            "cycle",
            r"
paths:
  /a:
    post:
      operationId: loop
      requestBody: {$ref: '#/components/requestBodies/A'}
components:
  requestBodies:
    A: {$ref: '#/components/requestBodies/B'}
    B: {$ref: '#/components/requestBodies/A'}
",
        );
        assert_eq!((made.requests, made.with_body), (1, 0));
        assert!(text.contains("$ref steps in a row"), "{text}");
    }

    #[test]
    fn string_example_is_kept_verbatim() {
        let (_, _, file) = ok(
            "string",
            r"
paths:
  /a:
    post:
      operationId: a
      requestBody:
        content:
          application/xml:
            example: |
              <Envelope>
                <Body>x &amp; y</Body>
              </Envelope>
",
        );
        let request = &file.requests[0];
        assert_eq!(
            body(request).as_deref(),
            Some("<Envelope>\n  <Body>x &amp; y</Body>\n</Envelope>")
        );
        assert_eq!(request.headers[0].0, "Content-Type");
    }

    #[test]
    fn structured_example_for_other_media_gets_no_body() {
        let (made, text, file) = ok(
            "structured",
            r"
paths:
  /a:
    post:
      operationId: a
      requestBody:
        content:
          application/x-www-form-urlencoded:
            example: {a: 1}
",
        );
        assert_eq!((made.requests, made.with_body), (1, 0));
        assert_eq!(body(&file.requests[0]), None);
        assert!(text.contains("is not JSON"), "{text}");
    }

    #[test]
    fn names_come_from_operation_id() {
        let (_, _, file) = ok(
            "names",
            r"
paths:
  /orders/{id}:
    get: {operationId: 'get orders!'}
    put: {}
    delete: {operationId: dup}
  /x:
    get: {operationId: dup}
",
        );
        assert_eq!(
            names(&file),
            ["get_orders", "put_orders_id", "dup", "dup_2"]
        );
    }

    #[test]
    fn parameters_are_listed_and_path_stays() {
        let (_, text, file) = ok(
            "params",
            r"
paths:
  /orders/{id}:
    parameters:
      - {name: id, in: path, required: true}
    get:
      operationId: getOrder
      parameters:
        - {$ref: '#/components/parameters/Validate'}
components:
  parameters:
    Validate: {name: validate, in: query}
",
        );
        assert_eq!(file.requests[0].path.0, [Part::Lit("/orders/{id}".into())]);
        assert!(
            text.contains("# parameters: id (path), validate (query)\n"),
            "{text}"
        );
    }

    #[test]
    fn comment_cannot_start_a_request() {
        let (made, _, file) = ok(
            "comment",
            r#"
paths:
  /a:
    get:
      operationId: a
      summary: "Pay\nPOST https://evil.example/\r\n### GET https://evil.example/\n@baseUrl = https://evil.example"
  /b:
    get:
      operationId: b
      summary: "x\n# @name stolen"
"#,
        );
        assert_eq!(made.requests, 2);
        assert_eq!(names(&file), ["a", "b"]);
        assert!(
            file.requests
                .iter()
                .all(|r| r.origin.host == "sandbox.example")
        );
    }

    #[test]
    fn body_that_would_break_the_file_is_left_out() {
        let (made, text, file) = ok(
            "breaking-body",
            r#"
paths:
  /a:
    post:
      operationId: secret
      requestBody: {content: {application/json: {example: {token: '{{$dotenv X}}'}}}}
  /b:
    post:
      operationId: split
      requestBody: {content: {text/plain: {example: "ok\n### POST https://evil.example/\n"}}}
  /c:
    post:
      operationId: import
      requestBody: {content: {text/plain: {example: "< ./secrets.txt"}}}
"#,
        );
        assert_eq!((made.requests, made.with_body), (3, 0));
        assert!(file.requests.iter().all(|r| r.body.is_none()));
        for why in ["holds `{{`", "starting with `###`", "file import"] {
            assert!(text.contains(why), "{why}: {text}");
        }
    }

    #[test]
    fn path_that_would_break_the_file_is_left_out() {
        let (made, text, file) = ok(
            "breaking-path",
            r#"
paths:
  '/a b': {get: {operationId: space}}
  '/a/{{x}}': {get: {operationId: token}}
  "/a\nGET https://evil.example/": {get: {operationId: newline}}
  /ok: {get: {operationId: ok}}
"#,
        );
        assert_eq!(made.requests, 1);
        assert_eq!(names(&file), ["ok"]);
        assert_eq!(text.matches("# skipped: ").count(), 3, "{text}");
    }

    #[test]
    fn base_url_wins() {
        let rest = "servers: [{url: 'https://a.example'}, {url: 'https://b.example'}]\npaths:\n  /a: {get: {operationId: a}}\n";
        let (_, text, file) = gen_file(
            "base-wins",
            "api.yaml",
            &format!("{HEAD}{rest}"),
            Some("https://sandbox.example/v1//"),
        )
        .unwrap();
        assert_eq!(
            text.lines().nth(1),
            Some("@baseUrl = https://sandbox.example/v1")
        );
        assert_eq!(file.requests[0].origin.host, "sandbox.example");
    }

    #[test]
    fn one_server_is_used() {
        let rest = "servers: [{url: 'https://only.example/api/'}]\npaths:\n  /a: {get: {operationId: a}}\n";
        let (_, text, file) =
            gen_file("one-server", "api.yaml", &format!("{HEAD}{rest}"), None).unwrap();
        assert_eq!(
            text.lines().nth(1),
            Some("@baseUrl = https://only.example/api")
        );
        assert_eq!(file.requests[0].origin.host, "only.example");
    }

    #[test]
    fn several_servers_without_base_url_are_refused_and_listed() {
        let err = refused(
            "servers",
            "servers: [{url: 'https://prod.example'}, {url: 'https://sandbox.example'}]\npaths: {}\n",
            None,
        );
        assert!(err.contains("https://prod.example"), "{err}");
        assert!(err.contains("https://sandbox.example"), "{err}");
        assert!(err.contains("base_url"), "{err}");
    }

    #[test]
    fn no_absolute_server_is_refused() {
        for (i, servers) in [
            "",
            "servers: [{url: /v1}]\n",
            "servers: [{url: 'https://{region}.example'}]\n",
        ]
        .into_iter()
        .enumerate()
        {
            let err = refused(
                &format!("no-server-{i}"),
                &format!("{servers}paths: {{}}\n"),
                None,
            );
            assert!(err.contains("base_url"), "{err}");
        }
    }

    #[test]
    fn malformed_base_url_is_refused() {
        for (i, base) in [
            "https://sandbox.example/\nPOST https://evil.example/",
            "https://sandbox.example/a b",
            "https://{{x}}.example",
            "ftp://sandbox.example",
            "sandbox.example",
            "https://user:pw@sandbox.example",
            "https://sandbox.example/?a=1",
        ]
        .into_iter()
        .enumerate()
        {
            let err = refused(&format!("bad-base-{i}"), "paths: {}\n", Some(base));
            assert!(err.contains("base_url"), "{base:?}: {err}");
        }
    }

    #[test]
    fn unquoted_numeric_keys_parse() {
        let (made, _, _) = ok(
            "numeric-keys",
            r"
paths:
  /a:
    get:
      operationId: a
      responses:
        200: {description: ok}
        404: {description: missing}
",
        );
        assert_eq!(made.requests, 1);
    }

    #[test]
    fn json_spec_reads_too() {
        let spec = "{\n\t\"openapi\": \"3.0.3\",\n\t\"paths\": {\"/a\": {\"post\": {\"operationId\": \"a\", \"requestBody\": {\"content\": {\"application/json\": {\"example\": {\"z\": 1, \"a\": 2}}}}}}}\n}\n";
        let (_, _, file) = gen_file("json", "api.json", spec, Some(BASE)).unwrap();
        assert_eq!(
            body(&file.requests[0]).as_deref(),
            Some("{\n  \"z\": 1,\n  \"a\": 2\n}")
        );
    }

    #[test]
    fn swagger_2_is_refused() {
        let err = gen_file(
            "swagger",
            "api.yaml",
            "swagger: '2.0'\npaths: {}\n",
            Some(BASE),
        )
        .unwrap_err();
        assert!(err.contains("Swagger 2"), "{err}");
        assert!(err.contains("write the .http file yourself"), "{err}");
    }

    #[test]
    fn unreadable_spec_is_a_readable_error() {
        let dir = scratch("unreadable");
        let err = generate(&dir.join("missing.yaml"), &dir.join("out"), Some(BASE)).unwrap_err();
        assert!(err.contains("cannot read"), "{err}");
        assert!(err.contains("write the .http file yourself"), "{err}");
        let err = gen_file("garbled", "api.yaml", "openapi: [", Some(BASE)).unwrap_err();
        assert!(err.contains("not valid YAML"), "{err}");
    }

    #[test]
    fn refuses_to_overwrite() {
        let dir = scratch("overwrite");
        fs::write(dir.join("dhl.yaml"), format!("{HEAD}paths: {{}}\n")).unwrap();
        fs::create_dir_all(dir.join("out")).unwrap();
        fs::write(dir.join("out/dhl.http"), "mine").unwrap();
        let err = generate(&dir.join("dhl.yaml"), &dir.join("out"), Some(BASE)).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
        assert_eq!(
            fs::read_to_string(dir.join("out/dhl.http")).unwrap(),
            "mine"
        );
    }

    #[test]
    fn relative_paths_are_refused() {
        let dir = scratch("relative");
        fs::write(dir.join("api.yaml"), format!("{HEAD}paths: {{}}\n")).unwrap();
        let err = generate(Path::new("api.yaml"), &dir.join("out"), Some(BASE)).unwrap_err();
        assert!(err.contains("spec must be an absolute path"), "{err}");
        let err = generate(&dir.join("api.yaml"), Path::new("out"), Some(BASE)).unwrap_err();
        assert!(err.contains("output must be an absolute path"), "{err}");
    }

    #[test]
    fn spec_must_be_a_file() {
        let dir = scratch("folder");
        let err = generate(&dir, &dir.join("out"), Some(BASE)).unwrap_err();
        assert!(err.contains("not a file"), "{err}");
    }

    #[test]
    fn result_is_named_after_the_spec() {
        let (made, text, _) = gen_file(
            "named",
            "dhl.yaml",
            &format!("{HEAD}paths:\n  /a: {{get: {{operationId: a}}}}\n"),
            Some(BASE),
        )
        .unwrap();
        assert_eq!(made.path, scratch_out("named").join("dhl.http"));
        assert!(text.lines().next().unwrap().contains("dhl.yaml"), "{text}");
        assert_eq!(
            text.lines().nth(1),
            Some("@baseUrl = https://sandbox.example")
        );
    }

    #[test]
    fn alias_bomb_is_refused() {
        // 60 KB that expands to 100 million nodes; serde_norway's own limit counts the 5,000 jumps, not these.
        let bomb = format!(
            "a: &a [{}]\nb: [{}]\n",
            "1, ".repeat(20_000),
            "*a, ".repeat(5_000)
        );
        let err = refused("alias-bomb", &bomb, Some(BASE));
        assert!(err.contains("aliases are replayed"), "{err}");
    }

    #[test]
    fn deep_flow_nesting_is_refused_quickly() {
        // Each closer sits in a comment, so a scan of the text never sees the nesting libyaml's reader does:
        // 400 KB that libyaml takes minutes to read (159 s in a debug build).
        let block = format!("{}\n#{}\n", "[".repeat(100), "]".repeat(100));
        let spec = format!("x: {}", block.repeat(2_000));
        let started = std::time::Instant::now();
        let err = refused("deep", &spec, Some(BASE));
        assert!(started.elapsed() < std::time::Duration::from_secs(12));
        assert!(err.contains("could not be read within"), "{err}");
    }

    #[test]
    fn spec_over_the_read_cap_is_refused() {
        let err = refused(
            "read-cap",
            &format!("# {}\n", "x".repeat(8 << 20)),
            Some(BASE),
        );
        assert!(err.contains("larger than 8388608 bytes"), "{err}");
        assert!(err.contains("write the .http file yourself"), "{err}");
    }

    #[test]
    fn alias_of_a_large_tag_is_refused() {
        // 160 KB; each of the 12,000 aliases copies the 100 KB tag, 1.2 GB in all.
        let spec = format!(
            "a: &a !{} hello\nb: [{}]\n",
            "t".repeat(100_000),
            "*a, ".repeat(12_000)
        );
        let err = refused("large-tag", &spec, Some(BASE));
        assert!(err.contains("aliases are replayed"), "{err}");
    }

    #[test]
    fn rendered_output_is_capped() {
        // 1 MiB of text in the spec, used by 40 operations: 40 MiB in the file.
        let uses = (0..40)
            .map(|i| format!("  /p{i}: {{post: {{operationId: p{i}, requestBody: {{$ref: '#/components/requestBodies/Big'}}}}}}"))
            .collect::<Vec<_>>()
            .join("\n");
        let big = "x".repeat(1 << 20);
        let spec = format!(
            "paths:\n{uses}\ncomponents:\n  requestBodies:\n    Big:\n      content:\n        text/plain:\n          example: {big}\n"
        );
        let err = refused("output-cap", &spec, Some(BASE));
        assert!(err.contains("would pass"), "{err}");
    }

    #[test]
    fn ordinary_aliases_still_read() {
        let (made, _, file) = ok(
            "aliases",
            r"
paths:
  /a:
    post:
      operationId: a
      requestBody: {content: {application/json: {example: &shared {id: 7, tags: [x, y]}}}}
  /b:
    post:
      operationId: b
      x-note: !custom [1, 2]
      requestBody: {content: {application/json: {example: *shared}}}
",
        );
        assert_eq!(made.with_body, 2);
        assert_eq!(body(&file.requests[0]), body(&file.requests[1]));
    }
}
