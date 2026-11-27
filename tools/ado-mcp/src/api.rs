//! The Azure DevOps client: the crate's clients behind our own reqwest client, PAT auth, timeouts, and errors that
//! fit on one line. `/vsts/info` and `connectionData`, which the crate doesn't cover, are sent by hand.

use std::collections::HashMap;
use std::error::Error as _;
use std::fmt;
use std::future::Future;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, PoisonError};
use std::time::Duration;

use anyhow::Result;
use async_trait::async_trait;
use azure_core::error::ErrorKind;
use azure_core::http::headers::{
    CONTENT_TYPE as AZ_CONTENT_TYPE, RETRY_AFTER as AZ_RETRY_AFTER, USER_AGENT,
};
use azure_core::http::policies::{Policy, PolicyResult};
use azure_core::http::{AsyncRawResponse, Context, Request, RetryOptions, Transport};
use azure_devops_rust_api::{
    Credential, build, git, ims, pipelines, policy, search, test, wiki, wit,
};
use base64::Engine as _;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, RETRY_AFTER};
use reqwest::{Client, Method};
use serde::de::DeserializeOwned;
use serde_json::Value;
use url::Url;

use crate::config::Config;

/// `connectionData`.
pub(crate) const V71_P1: &str = "7.1-preview.1";
/// What the crate sends, for the calls sent by hand: `pr_list status=all` and `pipeline_cancel`.
pub(crate) const V71_PREVIEW: &str = "7.1-preview";

const TIMEOUT: Duration = Duration::from_mins(1);
const PAT_LINE: &str = "Azure DevOps rejected the PAT (expired or wrong); set a new one with /plugin configure mcp-azure";
const OUTSIDE: &str = "refusing to send the PAT to a URL outside the configured collection";
const USER_AGENT_VALUE: &str = concat!("ado-mcp/", env!("CARGO_PKG_VERSION"));

/// What went wrong, already worded for the model. Never holds the PAT or the `Authorization` value.
#[derive(Debug, Clone)]
pub(crate) struct ApiError {
    pub status: Option<u16>,
    /// A `TFnnnnnn` code from the server's message.
    pub tf: Option<String>,
    pub msg: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.msg)
    }
}

impl std::error::Error for ApiError {}

impl ApiError {
    pub(crate) fn local(msg: impl Into<String>) -> Self {
        Self {
            status: None,
            tf: None,
            msg: msg.into(),
        }
    }

    /// A body our own serde struct can't read; names the field, like the crate's own error.
    pub(crate) fn unreadable(e: &serde_json::Error) -> Self {
        Self::local(format!("unexpected answer from the server: {e}"))
    }

    /// Words a 404 as `not found: {label}`; other errors stay as they are.
    #[must_use]
    pub fn with_what(mut self, label: &str) -> Self {
        if self.status == Some(404) {
            self.msg = format!("not found: {label}");
        }
        self
    }

    /// The line for a failed crate call.
    pub(crate) fn from_az(e: &azure_core::Error) -> Self {
        // The guard's own errors, and the network errors under the crate's wrapping.
        let mut cur = e.source();
        while let Some(s) = cur {
            if let Some(a) = s.downcast_ref::<ApiError>() {
                return a.clone();
            }
            if let Some(r) = s.downcast_ref::<reqwest::Error>() {
                return net_err(r);
            }
            cur = s.source();
        }
        match e.kind() {
            // The guard words every other status; this is a 429 that `Api::az` didn't wait out.
            ErrorKind::HttpResponse {
                status,
                raw_response,
                ..
            } => {
                let raw = raw_response.as_deref();
                let ct = raw
                    .and_then(|r| r.headers().get_optional_str(&AZ_CONTENT_TYPE))
                    .unwrap_or("none");
                let body = raw.map(|r| String::from_utf8_lossy(r.body()).into_owned());
                status_error(u16::from(*status), ct, &body.unwrap_or_default(), "")
            }
            ErrorKind::DataConversion => {
                Self::local(format!("unexpected answer from the server: {e}"))
            }
            _ => Self::local(e.to_string()),
        }
    }
}

/// A raw body (a crate call's `.send()`) read into our own type, where the crate's model doesn't fit the server.
///
/// # Errors
/// When the body doesn't fit `T`.
pub(crate) fn json<T: DeserializeOwned>(raw: &[u8]) -> Result<T, ApiError> {
    serde_json::from_slice(raw).map_err(|e| ApiError::unreadable(&e))
}

/// Keeps the PAT on `ADO_ORG_URL` and words HTTP failures while the request URL is still at hand.
#[derive(Debug)]
struct Guard {
    org: String,
}

/// `path` with every run of `/` cut to one.
fn squeeze(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        if !(c == '/' && out.ends_with('/')) {
            out.push(c);
        }
    }
    out
}

#[async_trait]
impl Policy for Guard {
    async fn send(
        &self,
        ctx: &Context,
        request: &mut Request,
        next: &[Arc<dyn Policy>],
    ) -> PolicyResult {
        let url = request.url_mut();
        // The crate joins `{endpoint}/{org}/{project}`: a collection at the server root, or no project, gives a `//`.
        if url.path().contains("//") {
            let path = squeeze(url.path());
            url.set_path(&path);
        }
        let Some(rel) = url.as_str().strip_prefix(&self.org) else {
            return Err(az_err(ApiError::local(OUTSIDE)));
        };
        let rel = rel.split('?').next().unwrap_or_default().to_owned();
        request.insert_header(USER_AGENT, USER_AGENT_VALUE);
        let resp = next[0].send(ctx, request, &next[1..]).await?;
        let status = u16::from(resp.status());
        let ct = resp
            .headers()
            .get_optional_str(&AZ_CONTENT_TYPE)
            .unwrap_or("none")
            .to_owned();
        // A 429 goes on to `Api::az`, which waits for it once.
        if status == 429 {
            return Ok(resp);
        }
        if (200..300).contains(&status) && !ct.contains("html") {
            let Some(dir) = capture_dir() else {
                return Ok(resp);
            };
            let (status, headers, body) = resp.deconstruct();
            let body = body.collect().await?;
            let method = request.method();
            capture(&dir, &self.org, method.as_str(), request.url(), &ct, &body);
            return Ok(AsyncRawResponse::from_bytes(status, headers, body));
        }
        let body = resp.deconstruct().2.collect().await?;
        Err(az_err(status_error(
            status,
            &ct,
            &String::from_utf8_lossy(&body),
            &rel,
        )))
    }
}

fn az_err(e: ApiError) -> azure_core::Error {
    azure_core::Error::new(ErrorKind::Other, e)
}

/// The request timeout; `ADO_TIMEOUT_MS` overrides it in debug builds (a test hook).
fn timeout() -> Duration {
    #[cfg(debug_assertions)]
    if let Some(ms) = std::env::var("ADO_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse().ok())
    {
        return Duration::from_millis(ms);
    }
    TIMEOUT
}

fn throttled() -> ApiError {
    ApiError {
        status: Some(429),
        tf: None,
        msg: "the server is throttling requests; try again in a minute".into(),
    }
}

/// Sleeps for a `Retry-After` in seconds (1 when missing, at most 30).
async fn wait(retry_after: Option<&str>) {
    let secs = retry_after
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(1);
    tokio::time::sleep(Duration::from_secs(secs.min(30))).await;
}

/// One client per area of the crate, all sending through our client. Cheap to clone.
pub(crate) struct Api {
    client: Client,
    org_url: Url,
    /// The collection's name: the crate's `organization` in every call.
    pub org: String,
    pub git: git::Client,
    pub build: build::Client,
    pub pipelines: pipelines::Client,
    pub policy: policy::Client,
    pub wit: wit::Client,
    pub core: azure_devops_rust_api::core::Client,
    pub ims: ims::Client,
    pub search: search::Client,
    pub wiki: wiki::Client,
    pub test: test::Client,
}

impl Api {
    /// # Errors
    /// When the HTTP client can't be built.
    pub fn new(cfg: &Config) -> Result<Self> {
        let basic = base64::engine::general_purpose::STANDARD.encode(format!(":{}", cfg.pat));
        let mut auth = HeaderValue::from_str(&format!("Basic {basic}"))?;
        auth.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(reqwest::header::AUTHORIZATION, auth);
        headers.insert(
            "X-TFS-FedAuthRedirect",
            HeaderValue::from_static("Suppress"),
        );
        let client = Client::builder()
            .user_agent(USER_AGENT_VALUE)
            .default_headers(headers)
            .connect_timeout(Duration::from_secs(10))
            .timeout(timeout())
            // A redirect would carry the PAT to wherever it points.
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        // `https://server/tfs/Coll/` is the endpoint `https://server/tfs` and the organization `Coll`.
        let org = cfg
            .org_url
            .path_segments()
            .and_then(|mut s| s.rfind(|s| !s.is_empty()))
            .unwrap_or_default()
            .to_owned();
        let mut base = cfg.org_url.clone();
        if let Ok(mut s) = base.path_segments_mut() {
            s.pop_if_empty().pop();
        }
        let cred = Credential::from_pat(cfg.pat.clone());
        let transport = Transport::new(Arc::new(client.clone()));
        let guard: Arc<dyn Policy> = Arc::new(Guard {
            org: cfg.org_url.to_string(),
        });
        macro_rules! area {
            ($area:path) => {{
                use $area as a;
                a::ClientBuilder::new(cred.clone())
                    .endpoint(base.clone())
                    .transport(transport.clone())
                    // azure_core would resend writes on a 5xx or a dropped connection.
                    .retry(RetryOptions::none())
                    .per_try_policies(vec![Arc::clone(&guard)])
                    .build()
            }};
        }
        Ok(Self {
            git: area!(git),
            build: area!(build),
            pipelines: area!(pipelines),
            policy: area!(policy),
            wit: area!(wit),
            core: area!(azure_devops_rust_api::core),
            ims: area!(ims),
            search: area!(search),
            wiki: area!(wiki),
            test: area!(test),
            client,
            org_url: cfg.org_url.clone(),
            org,
        })
    }

    /// Runs a crate call (`f` builds it afresh each time), once more after a 429.
    ///
    /// # Errors
    /// See [`ApiError::from_az`].
    pub async fn az<T, F, Fut>(&self, f: F) -> Result<T, ApiError>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = azure_core::Result<T>>,
    {
        let mut throttled_once = false;
        loop {
            let e = match f().await {
                Ok(v) => return Ok(v),
                Err(e) => e,
            };
            if let ErrorKind::HttpResponse {
                status,
                raw_response,
                ..
            } = e.kind()
                && u16::from(*status) == 429
            {
                if throttled_once {
                    return Err(throttled());
                }
                throttled_once = true;
                let ra = raw_response
                    .as_deref()
                    .and_then(|r| r.headers().get_optional_str(&AZ_RETRY_AFTER));
                wait(ra).await;
                continue;
            }
            return Err(ApiError::from_az(&e));
        }
    }

    /// `path` is joined onto the collection URL; `query` and `api-version` (unless `ver` is empty) follow.
    ///
    /// # Errors
    /// For anything the server answers with, see [`ApiError`]; also when the answer isn't JSON.
    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
        ver: &str,
    ) -> Result<T, ApiError> {
        self.send(Method::GET, path, query, ver, &Value::Null, false)
            .await
    }

    /// A request with a JSON body (none for `Value::Null`); `json_patch` sends it as `application/json-patch+json`.
    ///
    /// # Errors
    /// See [`Api::get`].
    pub async fn send<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        ver: &str,
        body: &Value,
        json_patch: bool,
    ) -> Result<T, ApiError> {
        let body = (!body.is_null()).then_some((body, json_patch));
        let (status, ct, text) = self.exec(method, path, query, ver, body).await?;
        // 204 and friends have no body.
        let text = if text.trim().is_empty() {
            "null"
        } else {
            &text
        };
        serde_json::from_str(text).map_err(|_| unexpected(status, &ct))
    }

    fn url(&self, path: &str, query: &[(&str, String)], ver: &str) -> Result<Url, ApiError> {
        // `join` also takes an absolute URL, and `/x` or `../x` climb out of the collection: check the result.
        let mut url = self
            .org_url
            .join(path)
            .map_err(|_| ApiError::local(format!("not a usable path: {path}")))?;
        if !url.as_str().starts_with(self.org_url.as_str()) {
            return Err(ApiError::local(OUTSIDE));
        }
        let ver = (!ver.is_empty()).then_some(("api-version", ver));
        let pairs: Vec<(&str, &str)> = query
            .iter()
            .map(|(k, v)| (*k, v.as_str()))
            .chain(ver)
            .collect();
        // An empty `query_pairs_mut` would still leave a `?`.
        if !pairs.is_empty() {
            url.query_pairs_mut().extend_pairs(pairs);
        }
        Ok(url)
    }

    /// Sends the request (once more after a 429) and returns `(status, content-type, body)` of a 2xx answer.
    async fn exec(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        ver: &str,
        body: Option<(&Value, bool)>,
    ) -> Result<(u16, String, String), ApiError> {
        let url = self.url(path, query, ver)?;
        let mut throttled_once = false;
        loop {
            let mut req = self
                .client
                .request(method.clone(), url.clone())
                .header(ACCEPT, "application/json");
            if let Some((json, patch)) = body {
                let ct = if patch {
                    "application/json-patch+json"
                } else {
                    "application/json"
                };
                req = req.header(CONTENT_TYPE, ct).body(json.to_string());
            }
            let resp = req.send().await.map_err(|e| net_err(&e))?;
            let status = resp.status().as_u16();
            if status == 429 {
                if throttled_once {
                    return Err(throttled());
                }
                throttled_once = true;
                wait(
                    resp.headers()
                        .get(RETRY_AFTER)
                        .and_then(|v| v.to_str().ok()),
                )
                .await;
                continue;
            }
            let ct = resp
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("none")
                .to_owned();
            let text = resp.text().await.map_err(|e| net_err(&e))?;
            return if (200..300).contains(&status) && !(status == 203 && ct.contains("html")) {
                // A U+FFFD is a body reqwest couldn't decode as text, so it can't be masked (see `capture`).
                if let Some(dir) = capture_dir()
                    && !text.contains('\u{FFFD}')
                {
                    capture(
                        &dir,
                        self.org_url.as_str(),
                        method.as_str(),
                        &url,
                        &ct,
                        text.as_bytes(),
                    );
                }
                Ok((status, ct, text))
            } else {
                Err(status_error(status, &ct, &text, path))
            };
        }
    }
}

fn net_err(e: &reqwest::Error) -> ApiError {
    // A connect timeout is both; it is the host that can't be reached, not a slow answer.
    if e.is_timeout() && !e.is_connect() {
        return ApiError::local(format!(
            "the server didn't answer in {} s",
            timeout().as_secs()
        ));
    }
    let mut cause = e.to_string();
    let mut cur = e.source();
    while let Some(s) = cur {
        cause = s.to_string();
        cur = s.source();
    }
    let host = e.url().and_then(Url::host_str).unwrap_or("the server");
    let mut msg = format!("can't reach {host}: {cause}");
    if is_cert_error(e) {
        msg.push_str(
            " (the certificate isn't trusted; ado-mcp uses the Windows certificate store)",
        );
    }
    ApiError::local(msg)
}

/// Whether a rustls certificate error sits anywhere in `e`'s `source()` chain.
fn is_cert_error(e: &(dyn std::error::Error + 'static)) -> bool {
    let mut cur = Some(e);
    while let Some(s) = cur {
        // `io::Error::source` skips the error it wraps, so look inside it too.
        let inner = s
            .downcast_ref::<std::io::Error>()
            .and_then(std::io::Error::get_ref)
            .map_or(s, |i| i as &(dyn std::error::Error + 'static));
        if matches!(
            inner.downcast_ref::<rustls::Error>(),
            Some(rustls::Error::InvalidCertificate(_))
        ) {
            return true;
        }
        cur = s.source();
    }
    false
}

fn unexpected(status: u16, ct: &str) -> ApiError {
    ApiError {
        status: Some(status),
        tf: None,
        msg: format!("unexpected answer from the server ({status}, {ct})"),
    }
}

/// The segment after `_apis/` decides which PAT scope was missing.
fn scope(path: &str) -> Option<&'static str> {
    let area = path
        .split_once("_apis/")
        .and_then(|(_, r)| r.split(['/', '?']).next());
    match area {
        Some("git" | "policy") => Some("Code"),
        Some("wit") => Some("Work Items"),
        Some("build" | "pipelines") => Some("Build"),
        Some("projects" | "identities" | "connectionData") => Some("Project and Team (Read)"),
        Some("search") => Some("Code, Work Items or Wiki (Read)"),
        Some("wiki") => Some("Wiki (Read)"),
        Some("test") => Some("Test Management (Read)"),
        _ => None,
    }
}

/// The first `TF` followed by six digits.
fn find_tf(s: &str) -> Option<String> {
    s.match_indices("TF").find_map(|(i, _)| {
        let digits = s.get(i + 2..i + 8)?;
        digits
            .bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| format!("TF{digits}"))
    })
}

/// The server's message on one line of at most 300 characters (`…` marks a cut).
fn one_line(message: &str) -> String {
    let mut line = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if let Some((at, _)) = line.char_indices().nth(300) {
        line.truncate(at);
        line.push('…');
    }
    line
}

fn status_error(status: u16, ct: &str, body: &str, path: &str) -> ApiError {
    let err = |msg: String, tf| ApiError {
        status: Some(status),
        tf,
        msg,
    };
    match status {
        401 | 203 => err(PAT_LINE.into(), None),
        403 => err(
            format!(
                "the PAT may not do this: it needs {}",
                scope(path).map_or("a broader scope".into(), |s| format!("the {s} scope"))
            ),
            None,
        ),
        404 => err(format!("not found: {path}"), None),
        500.. => err(format!("the server failed ({status}); try again"), None),
        400..500 => {
            let raw = serde_json::from_str::<Value>(body)
                .ok()
                .and_then(|v| v["message"].as_str().map(str::to_owned));
            // The code first: the cut could drop it.
            let tf = raw.as_deref().and_then(find_tf);
            let message = raw.map_or_else(|| format!("HTTP {status}"), |m| one_line(&m));
            err(format!("the server refused it: {message}"), tf)
        }
        // A redirect (not followed) or an odd 1xx/2xx/3xx.
        _ => unexpected(status, ct),
    }
}

/// `ADO_CAPTURE_DIR`, when set: every 2xx answer is written there, masked, to replace the tests' fixtures.
fn capture_dir() -> Option<PathBuf> {
    std::env::var_os("ADO_CAPTURE_DIR")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
}

/// What one capture session has masked so far, so an identity keeps its number across files.
static MASKS: LazyLock<Mutex<Masks>> = LazyLock::new(Mutex::default);

#[derive(Clone, Copy)]
enum Id {
    Name,
    Email,
    Guid,
    Descriptor,
}

#[derive(Default)]
struct Masks {
    /// ASCII-lowercased value → what replaces it.
    to: HashMap<String, String>,
    /// ASCII-lowercased identity value → the identity's number.
    users: HashMap<String, usize>,
    people: usize,
    projects: usize,
    repos: usize,
}

impl Masks {
    /// `value`, and its forms in a URL, become `mask`; the first mask a value gets stays.
    fn add(&mut self, value: &str, mask: &str) {
        if value.is_empty() {
            return;
        }
        let [a, b] = encodings(value);
        let [ma, mb] = encodings(mask);
        for (v, m) in [(value.to_owned(), mask.to_owned()), (a, ma), (b, mb)] {
            self.to.entry(v.to_ascii_lowercase()).or_insert(m);
        }
    }

    /// One identity's values: a value seen before brings its number along.
    fn user(&mut self, values: &[(Id, &str)]) {
        let values: Vec<_> = values.iter().filter(|(_, v)| !v.is_empty()).collect();
        if values.is_empty() {
            return;
        }
        let n = values
            .iter()
            .find_map(|(_, v)| self.users.get(&v.to_ascii_lowercase()).copied())
            .unwrap_or_else(|| {
                self.people += 1;
                self.people
            });
        for (kind, v) in values {
            self.users.insert(v.to_ascii_lowercase(), n);
            let mask = match kind {
                Id::Name => format!("User {n}"),
                Id::Email => format!("user{n}@example.com"),
                Id::Guid => format!("00000000-0000-0000-0000-{n:012}"),
                Id::Descriptor => format!("descriptor-{n}"),
            };
            self.add(v, &mask);
        }
    }

    /// A project or repository name; ids stay.
    fn name(&mut self, value: &str, repo: bool) {
        if value.is_empty() || is_guid(value) || self.to.contains_key(&value.to_ascii_lowercase()) {
            return;
        }
        let mask = if repo {
            self.repos += 1;
            format!("Repo{}", self.repos)
        } else {
            self.projects += 1;
            format!("Project{}", self.projects)
        };
        self.add(value, &mask);
    }

    /// Project and repository names from a path relative to the collection.
    fn path(&mut self, rel: &str) {
        let segs: Vec<String> = rel.split('/').map(decode).collect();
        for (i, seg) in segs.iter().enumerate() {
            let next = segs.get(i + 1).map_or("", String::as_str);
            let seg = seg.to_ascii_lowercase();
            if (seg == "_apis" || seg == "_git") && i > 0 {
                self.name(&segs[i - 1], false);
            }
            if seg == "projects" {
                self.name(next, false);
            }
            if seg == "_git" || seg == "repositories" {
                self.name(next, true);
            }
        }
    }

    /// Emails anywhere, and `Name <DOMAIN\user>` as work-item fields give a person.
    fn text(&mut self, s: &str) {
        if let Some((name, inner)) = s.strip_suffix('>').and_then(|r| r.rsplit_once(" <"))
            && (inner.contains('@') || inner.contains('\\'))
        {
            self.user(&[(Id::Name, name), (mail_or_name(inner), inner)]);
        }
        for e in emails(s) {
            self.user(&[(Id::Email, e)]);
        }
    }

    /// First pass: the identity values, project and repository names in an answer.
    fn collect(&mut self, v: &Value, key: &str) {
        let o = match v {
            Value::String(s) => {
                self.text(s);
                return;
            }
            Value::Array(a) => {
                for x in a {
                    self.collect(x, key);
                }
                return;
            }
            Value::Object(o) => o,
            _ => return,
        };
        let s = |k: &str| o.get(k).and_then(Value::as_str).unwrap_or_default();
        let shaped = [
            "uniqueName",
            "descriptor",
            "subjectDescriptor",
            "providerDisplayName",
            "customDisplayName",
            "imageUrl",
        ]
        .iter()
        .any(|k| o.contains_key(*k));
        // A policy type has a `displayName` and a GUID too, but its `url` isn't an identity's.
        let bare = o.contains_key("displayName")
            && is_guid(s("id"))
            && o.get("url")
                .and_then(Value::as_str)
                .is_none_or(|u| u.to_ascii_lowercase().contains("/identities/"));
        if shaped || bare {
            let mut vals = vec![
                (Id::Name, s("displayName")),
                (Id::Name, s("providerDisplayName")),
                (Id::Name, s("customDisplayName")),
                (mail_or_name(s("uniqueName")), s("uniqueName")),
                (Id::Email, s("mailAddress")),
            ];
            for k in ["descriptor", "subjectDescriptor"] {
                vals.push((Id::Descriptor, s(k)));
                // `Microsoft.TeamFoundation.Identity;S-1-5-21-…`: the SID shows up on its own too.
                vals.extend(s(k).split_once(';').map(|(_, sid)| (Id::Descriptor, sid)));
            }
            if is_guid(s("id")) {
                vals.push((Id::Guid, s("id")));
            }
            for k in ["Account", "Mail"] {
                let p = o.get("properties").and_then(|p| p[k]["$value"].as_str());
                vals.extend(p.map(|p| (mail_or_name(p), p)));
            }
            self.user(&vals);
        }
        // A git author or committer.
        if o.contains_key("email") {
            self.user(&[(Id::Name, s("name")), (Id::Email, s("email"))]);
        }
        if key == "project" || o.contains_key("visibility") {
            self.name(s("name"), false);
        }
        if key == "repository" || o.contains_key("remoteUrl") {
            self.name(s("name"), true);
        }
        for (k, x) in o {
            self.collect(x, k);
        }
    }

    /// Every value, longest first, so a name that starts another doesn't leave the rest behind.
    fn sorted(&self) -> Vec<(&str, &str)> {
        let mut m: Vec<_> = self
            .to
            .iter()
            .map(|(v, m)| (v.as_str(), m.as_str()))
            .collect();
        m.sort_by_key(|(v, _)| std::cmp::Reverse(v.len()));
        m
    }
}

/// Second pass: each value in `s` replaced where it stands as a whole word, without regard to ASCII case, in one
/// sweep (a mask is never masked again).
fn replace(s: &str, masks: &[(&str, &str)]) -> String {
    let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    'sweep: while let Some(c) = s[i..].chars().next() {
        if !word(s[..i].chars().next_back()) {
            for (v, m) in masks {
                let end = i + v.len();
                if s.get(i..end).is_some_and(|w| w.eq_ignore_ascii_case(v))
                    && !word(s[end..].chars().next())
                {
                    out.push_str(m);
                    i = end;
                    continue 'sweep;
                }
            }
        }
        out.push(c);
        i += c.len_utf8();
    }
    out
}

/// String values only: a key is never rewritten (a short project name could match one).
fn replace_values(v: &mut Value, masks: &[(&str, &str)]) {
    match v {
        Value::String(s) => *s = replace(s, masks),
        Value::Array(a) => a.iter_mut().for_each(|x| replace_values(x, masks)),
        Value::Object(o) => o.values_mut().for_each(|x| replace_values(x, masks)),
        _ => {}
    }
}

/// `s` as the url crate puts it into a path, and as .NET's `EscapeDataString` writes it.
fn encodings(s: &str) -> [String; 2] {
    let enc = |keep: fn(u8) -> bool| {
        s.bytes()
            .map(|b| {
                if keep(b) {
                    char::from(b).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect::<String>()
    };
    [
        enc(|b| b.is_ascii_graphic() && !b"\"#<>?`{}".contains(&b)),
        enc(|b| b.is_ascii_alphanumeric() || b"-._~".contains(&b)),
    ]
}

/// A percent-encoded path segment, decoded.
fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = b
            .get(i + 1..i + 3)
            .filter(|h| h.iter().all(u8::is_ascii_hexdigit))
            .and_then(|h| u8::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok());
        match (b[i], hex) {
            (b'%', Some(x)) => {
                out.push(x);
                i += 3;
            }
            (c, _) => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn is_guid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

/// The email-shaped words in `s`.
fn emails(s: &str) -> Vec<&str> {
    let local = |c: char| c.is_ascii_alphanumeric() || "._%+-".contains(c);
    let domain = |c: char| c.is_ascii_alphanumeric() || ".-".contains(c);
    s.match_indices('@')
        .filter_map(|(at, _)| {
            let start = s[..at]
                .char_indices()
                .rev()
                .find(|(_, c)| !local(*c))
                .map_or(0, |(i, c)| i + c.len_utf8());
            let rest = &s[at + 1..];
            let d = rest[..rest.find(|c| !domain(c)).unwrap_or(rest.len())].trim_end_matches('.');
            (start < at && d.contains('.')).then(|| &s[start..at + 1 + d.len()])
        })
        .collect()
}

fn mail_or_name(s: &str) -> Id {
    if emails(s) == [s] {
        Id::Email
    } else {
        Id::Name
    }
}

/// Writes one answer's body, masked, as `<method>-<path, / as _>-<hash of the query>.<ext>`. Headers aren't written,
/// so the PAT never is; a failure goes to stderr and leaves the answer to the caller as it was.
fn capture(dir: &Path, org: &str, method: &str, url: &Url, ct: &str, body: &[u8]) {
    // Masking works on text: a binary body can't be masked, so it isn't written.
    let Ok(text) = std::str::from_utf8(body) else {
        return;
    };
    let Ok(org) = Url::parse(org) else {
        return;
    };
    let rel = url.path().strip_prefix(org.path()).unwrap_or(url.path());
    let mut json = ct
        .contains("json")
        .then(|| serde_json::from_str::<Value>(text).ok())
        .flatten();
    let (file, ext, out) = {
        let mut masks = MASKS.lock().unwrap_or_else(PoisonError::into_inner);
        let coll = org
            .path_segments()
            .and_then(|mut s| s.rfind(|s| !s.is_empty()));
        masks.add(&decode(coll.unwrap_or_default()), "Coll");
        if let Some(host) = org.host_str() {
            if let Some(port) = org.port() {
                masks.add(&format!("{host}:{port}"), "dev.example");
            }
            masks.add(host, "dev.example");
        }
        masks.path(rel);
        match &json {
            Some(v) => masks.collect(v, ""),
            None => masks.text(text),
        }
        let sorted = masks.sorted();
        let (ext, out) = match &mut json {
            Some(v) => {
                replace_values(v, &sorted);
                (
                    "json",
                    serde_json::to_string_pretty(v).map_err(std::io::Error::other),
                )
            }
            None if ct.contains("html") => ("html", Ok(replace(text, &sorted))),
            None if ct.contains("xml") => ("xml", Ok(replace(text, &sorted))),
            None => ("txt", Ok(replace(text, &sorted))),
        };
        (replace(rel, &sorted), ext, out)
    };
    let mut h = DefaultHasher::new();
    url.query().unwrap_or_default().hash(&mut h);
    let file = file.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let path = dir.join(format!("{method}-{file}-{:08x}.{ext}", h.finish() >> 32));
    // shortcut: a blocking write on the runtime's thread, fine for a capture run by hand; spawn_blocking if capture
    // ever runs in normal use.
    if let Err(e) = out.and_then(|out| {
        std::fs::create_dir_all(dir)?;
        std::fs::write(&path, out)
    }) {
        eprintln!(
            "ado-mcp: couldn't write the capture {}: {e}",
            path.display()
        );
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn api() -> Api {
        let cfg = Config {
            org_url: Url::parse("https://ado.example/tfs/Coll/").unwrap(),
            pat: "secret-pat".into(),
            project_dir: PathBuf::new(),
        };
        Api::new(&cfg).unwrap()
    }

    #[tokio::test]
    async fn other_urls_are_refused_before_sending() {
        let api = api();
        for path in [
            "https://evil.example/tfs/Coll/_apis/projects",
            "http://ado.example/tfs/Coll/_apis/projects",
            "https://ado.example/tfs/Other/_apis/projects",
            "https://ado.example/tfs/Coll/../Other/x",
            "https://ado.example@evil.example/tfs/Coll/",
            "/tfs/Other/_apis/projects",
            "../x",
        ] {
            let e = api.get::<Value>(path, &[], V71_P1).await.unwrap_err();
            assert!(
                e.status.is_none() && e.msg.contains("outside the configured collection"),
                "{path}: {e}"
            );
            assert!(!e.msg.contains("secret-pat"));
        }
    }

    #[test]
    fn urls_under_the_collection_pass() {
        let u = api()
            .url("My Project/_apis/git", &[("$top", "1".into())], V71_P1)
            .unwrap();
        assert_eq!(
            u.as_str(),
            "https://ado.example/tfs/Coll/My%20Project/_apis/git?%24top=1&api-version=7.1-preview.1"
        );
        // `/vsts/info` takes no version.
        let u = api().url("R/vsts/info", &[], "").unwrap();
        assert_eq!(u.as_str(), "https://ado.example/tfs/Coll/R/vsts/info");
        assert!(
            api()
                .url("https://ado.example/tfs/Coll/x?a=b", &[], V71_P1)
                .is_ok()
        );
    }

    #[test]
    fn scopes_follow_the_area() {
        let f = |p, s: &str| {
            assert_eq!(
                status_error(403, "", "", p).msg,
                format!("the PAT may not do this: it needs the {s} scope")
            );
        };
        f("P/_apis/git/repositories", "Code");
        f("P/_apis/policy/evaluations", "Code");
        f("P/_apis/wit/workitems/1", "Work Items");
        f("P/_apis/build/builds", "Build");
        f("P/_apis/pipelines/1/runs", "Build");
        f("_apis/projects", "Project and Team (Read)");
        f("_apis/connectionData", "Project and Team (Read)");
        f("P/_apis/wiki/wikis/w/pages", "Wiki (Read)");
        f("P/_apis/test/runs", "Test Management (Read)");
        f("P/_apis/test/Runs/5/results", "Test Management (Read)");
    }

    #[test]
    fn unnamed_scope_reads_as_a_broader_one() {
        for p in ["P/_apis/other", "no-area"] {
            assert_eq!(
                status_error(403, "", "", p).msg,
                "the PAT may not do this: it needs a broader scope"
            );
        }
    }

    // Linux queues the SYNs of a full backlog; Windows refuses them.
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn connect_timeout_is_not_a_slow_answer() {
        // Fill a listener's accept queue, then the next connect hangs until its timeout.
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let addr = l.local_addr().unwrap();
        let mut held = Vec::new();
        while let Ok(c) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(100)) {
            held.push(c);
            assert!(held.len() < 100_000, "the queue never filled");
        }
        let url = Url::parse(&format!("http://{addr}/")).unwrap();
        let e = Client::builder()
            .connect_timeout(Duration::from_millis(100))
            .build()
            .unwrap()
            .get(url.clone())
            .send()
            .await
            .unwrap_err();
        assert!(e.is_connect() && e.is_timeout(), "{e:?}");
        let msg = net_err(&e).msg;
        assert!(msg.starts_with("can't reach 127.0.0.1: "), "{msg}");
    }

    #[test]
    fn tf_code_and_404_label() {
        let e = status_error(
            409,
            "application/json",
            r#"{"message":"TF401179: An active pull request exists."}"#,
            "x",
        );
        assert_eq!(e.tf.as_deref(), Some("TF401179"));
        assert_eq!(e.status, Some(409));
        let e = status_error(404, "", "", "P/_apis/git/repositories/r").with_what("repo r");
        assert_eq!(e.msg, "not found: repo r");
        assert_eq!(
            status_error(400, "", "<html>", "x").msg,
            "the server refused it: HTTP 400"
        );
        assert_eq!(
            find_tf("TF12 and TFabcdef and TF000123"),
            Some("TF000123".into())
        );
    }

    #[test]
    fn refused_message_is_one_short_line() {
        let msg = format!("{}\n\n  {}\r\n", "a".repeat(200), "b ".repeat(200));
        let body = serde_json::json!({"message": msg}).to_string();
        let e = status_error(400, "application/json", &body, "x");
        let rest = e.msg.strip_prefix("the server refused it: ").unwrap();
        assert!(
            !rest.contains(['\n', '\r']) && !rest.contains("  "),
            "{rest}"
        );
        assert_eq!(rest.chars().count(), 301, "{rest}");
        assert!(
            rest.starts_with(&format!("{} b b", "a".repeat(200))),
            "{rest}"
        );
        assert!(rest.ends_with('…'), "{rest}");
        // The code is read before the cut.
        let body = serde_json::json!({"message": format!("{} TF401179: exists", "a".repeat(400))});
        let e = status_error(409, "application/json", &body.to_string(), "x");
        assert_eq!(e.tf.as_deref(), Some("TF401179"));
    }

    /// Fails the test if a request gets past the guard.
    #[derive(Debug)]
    struct Unreachable;

    #[async_trait]
    impl Policy for Unreachable {
        async fn send(&self, _: &Context, r: &mut Request, _: &[Arc<dyn Policy>]) -> PolicyResult {
            panic!("sent to {}", r.url());
        }
    }

    #[tokio::test]
    async fn guard_refuses_outside_org() {
        let guard = Guard {
            org: "https://ado.example/tfs/Coll/".into(),
        };
        let next: [Arc<dyn Policy>; 1] = [Arc::new(Unreachable)];
        for url in [
            "https://evil.example/tfs/Coll/_apis/projects",
            "https://ado.example/tfs/Other/_apis/projects",
            "https://ado.example@evil.example/tfs/Coll/x",
        ] {
            let mut req = Request::new(Url::parse(url).unwrap(), azure_core::http::Method::Get);
            let e = guard
                .send(&Context::new(), &mut req, &next)
                .await
                .unwrap_err();
            assert_eq!(ApiError::from_az(&e).msg, OUTSIDE, "{url}");
        }
    }

    #[test]
    fn squeeze_cuts_double_slashes() {
        assert_eq!(squeeze("//Coll//_apis/x"), "/Coll/_apis/x");
        assert_eq!(squeeze("/tfs/Coll/P/_apis"), "/tfs/Coll/P/_apis");
    }

    #[test]
    fn certificate_errors_are_found_through_io_errors() {
        let cert = rustls::Error::InvalidCertificate(rustls::CertificateError::UnknownIssuer);
        assert!(is_cert_error(&std::io::Error::other(cert)));
        assert!(!is_cert_error(&std::io::Error::other("refused")));
    }
}
