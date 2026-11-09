//! Runs one named request of a `.http` file and the requests it references, and masks what comes back.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use reqwest::{Client, Method, StatusCode};

use crate::extract::{credential_values, from_body};
use crate::login_page::{Ask, HostFields, Outcome, Pages};
use crate::mask::{Masker, Place, escape, maskable};
use crate::parse::{ParsedFile, Part, Request, Source, Text, parse};
use crate::replies::{self, Exchange};
use crate::store::Store;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const PAGE_WAIT: Duration = Duration::from_secs(50);
const MAX_RESULT: usize = 40_000;
const CALL_AGAIN: &str = "call `run` again";

/// What every run shares.
pub struct Ctx {
    pub http: Client,
    pub store: Arc<Store>,
    pub pages: Pages,
    pub deadline: Duration,
}

impl Ctx {
    /// # Errors
    ///
    /// Returns why the HTTP client cannot be built.
    pub fn new(store: Arc<Store>, pages: Pages) -> Result<Self, String> {
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("cannot start the HTTP client: {}", e.without_url()))?;
        let deadline = Duration::from_secs(55);
        Ok(Self {
            http,
            store,
            pages,
            deadline,
        })
    }
}

pub struct RunArgs {
    pub file: PathBuf,
    pub request: String,
    pub retype_login: bool,
}

/// Runs `args.request` and returns readable text, whatever happens.
pub async fn run(ctx: &Ctx, args: RunArgs) -> String {
    let mut masker = Masker::new();
    match go(ctx, &args, &mut masker).await {
        Ok(result) => result,
        Err(why) => masker.apply(&why),
    }
}

async fn go(ctx: &Ctx, args: &RunArgs, masker: &mut Masker) -> Result<String, String> {
    let started = Instant::now();
    let path = args.file.display();
    if !args.file.is_absolute() {
        return Err(format!("`file` must be an absolute path, not {path}"));
    }
    let text =
        std::fs::read_to_string(&args.file).map_err(|e| format!("cannot read {path}: {e}"))?;
    let file = parse(&text).map_err(|e| format!("{path} cannot be run: {e}"))?;
    let chain = order(&file, &args.request)?;
    if let Some(r) = chain
        .iter()
        .find(|r| !r.origin.https && !matches!(r.origin.host.as_str(), "localhost" | "127.0.0.1"))
    {
        return Err(format!(
            "`{}` (line {}) was refused: `{}` needs https; plain http is only for localhost and 127.0.0.1",
            name(r),
            r.line,
            r.origin.host
        ));
    }
    let hosts = hosts(&chain);
    add_typed(ctx, &hosts, masker)?;
    login(ctx, &hosts, args.retype_login, started).await?;
    let typed = add_typed(ctx, &hosts, masker)?;
    let sending = Sending {
        ctx,
        file: &args.file,
        started,
        masker,
        typed,
        masked: masked_sources(&file),
        replies: HashMap::new(),
        ran: Vec::new(),
    };
    Ok(sending.send(&chain).await)
}

fn name(request: &Request) -> &str {
    request.name.as_deref().unwrap_or_default()
}

fn texts(r: &Request) -> impl Iterator<Item = &Text> {
    let basic = r.basic.iter().flat_map(|b| [&b.user, &b.password]);
    std::iter::once(&r.path)
        .chain(r.headers.iter().map(|(_, value)| value))
        .chain(basic)
        .chain(r.body.iter())
}

fn parts(r: &Request) -> impl Iterator<Item = &Part> {
    texts(r).flat_map(|t| &t.0)
}

/// `target` and everything it references, each after the requests it depends on.
fn order<'a>(file: &'a ParsedFile, target: &str) -> Result<Vec<&'a Request>, String> {
    if !file
        .requests
        .iter()
        .any(|r| r.name.as_deref() == Some(target))
    {
        let known: Vec<&str> = file
            .requests
            .iter()
            .map(name)
            .filter(|n| !n.is_empty())
            .collect();
        return Err(format!(
            "no request is named `{target}`; the file names: {}",
            known.join(", ")
        ));
    }
    let mut done = Vec::new();
    visit(file, target, &mut Vec::new(), &mut done)?;
    Ok(done)
}

fn visit<'a>(
    file: &'a ParsedFile,
    target: &str,
    path: &mut Vec<String>,
    done: &mut Vec<&'a Request>,
) -> Result<(), String> {
    if done.iter().any(|r| name(r) == target) {
        return Ok(());
    }
    if path.iter().any(|p| p == target) {
        return Err(format!(
            "these requests reference each other in a cycle: `{}` and `{target}`",
            path.join("`, `")
        ));
    }
    let Some(request) = file.requests.iter().find(|r| name(r) == target) else {
        return Err(format!("no request is named `{target}`"));
    };
    path.push(target.to_string());
    for part in parts(request) {
        if let Part::Reply { request: from, .. } = part {
            if !file.requests.iter().any(|r| name(r) == from) {
                return Err(format!(
                    "`{}` (line {}) references `{from}`, which no request is named",
                    name(request),
                    request.line
                ));
            }
            visit(file, from, path, done)?;
        }
    }
    path.pop();
    done.push(request);
    Ok(())
}

/// Each host of the chain, once, with every secret name its requests use.
fn hosts(chain: &[&Request]) -> Vec<HostFields> {
    let mut hosts: Vec<HostFields> = Vec::new();
    for request in chain {
        let index = hosts
            .iter()
            .position(|h| h.host == request.origin.host)
            .unwrap_or_else(|| {
                hosts.push(HostFields {
                    host: request.origin.host.clone(),
                    names: Vec::new(),
                });
                hosts.len() - 1
            });
        for part in parts(request) {
            if let Part::Secret(secret) = part
                && !hosts[index].names.contains(secret)
            {
                hosts[index].names.push(secret.clone());
            }
        }
    }
    hosts
}

/// The store as sending began: requests fill from this alone, so what is sent is what is masked.
#[derive(Default)]
struct Typed {
    /// Every value of each host, for the check on reply values.
    values: HashMap<String, Vec<String>>,
    /// The value for each `(host, name)` the chain uses.
    secrets: HashMap<(String, String), String>,
}

/// Adds every saved value of `hosts` to `masker` and returns them.
fn add_typed(ctx: &Ctx, hosts: &[HostFields], masker: &mut Masker) -> Result<Typed, String> {
    let mut typed = Typed::default();
    for host in hosts {
        let mut values = ctx.store.values(&host.host)?;
        for secret in &host.names {
            if let Some(value) = ctx.store.get(&host.host, secret)? {
                values.push(value.clone());
                typed
                    .secrets
                    .insert((host.host.clone(), secret.clone()), value);
            }
        }
        for value in &values {
            masker.add(value);
        }
        typed.values.insert(host.host.clone(), values);
    }
    Ok(typed)
}

/// The hosts not yet confirmed or lacking a value, each with only the names it lacks.
fn lacking(store: &Store, hosts: &[HostFields]) -> Result<Vec<HostFields>, String> {
    let mut out = Vec::new();
    for h in hosts {
        let names = store.missing(&h.host, &h.names)?;
        if !names.is_empty() || !store.is_confirmed(&h.host)? {
            out.push(HostFields {
                host: h.host.clone(),
                names,
            });
        }
    }
    Ok(out)
}

/// Returns once every host is confirmed and every value saved; any other end is the run's result.
async fn login(
    ctx: &Ctx,
    hosts: &[HostFields],
    retype: bool,
    started: Instant,
) -> Result<(), String> {
    let ask = if retype {
        hosts.to_vec()
    } else {
        lacking(&ctx.store, hosts)?
    };
    if ask.is_empty() {
        return Ok(());
    }
    let shown = ask
        .iter()
        .map(|h| h.host.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let wait = PAGE_WAIT.min(ctx.deadline.saturating_sub(started.elapsed()));
    match ctx.pages.ask(Ask { hosts: ask }, wait).await {
        Outcome::Saved if lacking(&ctx.store, hosts)?.is_empty() => Ok(()),
        Outcome::Saved => Err(format!(
            "The login page for {shown} was saved, but a value is still missing. Nothing was sent; {CALL_AGAIN}."
        )),
        Outcome::StillOpen if retype => Err(format!(
            "The login page for {shown} is open and waiting for the user. Nothing was sent. Keep `retype_login` on and {CALL_AGAIN} now: that call waits on this page. Without `retype_login` the run skips the page and sends the rejected login again."
        )),
        Outcome::StillOpen => Err(format!(
            "The login page for {shown} is open and waiting for the user. Nothing was sent. Once the user has saved it, {CALL_AGAIN}, without `retype_login`."
        )),
        Outcome::Replaced => Err(format!(
            "The login page for {shown} was replaced by another call's page. Nothing was sent; {CALL_AGAIN}."
        )),
        Outcome::Failed(why) => Err(format!(
            "The login page for {shown} could not finish: {why}. Nothing was sent; ask the user to run this where a browser can open, or to try again."
        )),
    }
}

/// Every `(request, source)` of the file whose value goes out in a header, a Basic field or a SOAP
/// `Header` element. Decided from the whole file, so a login run alone still masks its token.
fn masked_sources(file: &ParsedFile) -> Vec<(String, Source)> {
    let mut found = Vec::new();
    let mut take = |part: &Part| {
        if let Part::Reply { request, source } = part {
            found.push((request.clone(), source.clone()));
        }
    };
    for r in &file.requests {
        let basic = r.basic.iter().flat_map(|b| [&b.user, &b.password]);
        let sent = r.headers.iter().map(|(_, value)| value).chain(basic);
        sent.flat_map(|t| &t.0).for_each(&mut take);
        let mut depth = 0;
        for part in r.body.iter().flat_map(|t| &t.0) {
            match part {
                Part::Lit(lit) => depth = header_depth(lit, depth),
                reply if depth > 0 => take(reply),
                _ => {}
            }
        }
    }
    found
}

/// How many `Header` elements, prefixed or not, are open after `lit`, given `depth` before it.
fn header_depth(lit: &str, mut depth: usize) -> usize {
    for tag in lit.split('<').skip(1) {
        let (closing, tag) = tag.strip_prefix('/').map_or((false, tag), |t| (true, t));
        let name = tag
            .split([' ', '\t', '\n', '>', '/'])
            .next()
            .unwrap_or_default();
        if name.rsplit(':').next() != Some("Header") {
            continue;
        }
        if closing {
            depth = depth.saturating_sub(1);
        } else if !tag.split('>').next().unwrap_or_default().ends_with('/') {
            depth += 1;
        }
    }
    depth
}

struct Reply {
    headers: Vec<(String, String)>,
    body: String,
}

fn read(reply: &Reply, source: &Source) -> Result<String, String> {
    match source {
        Source::Body(path) => from_body(&reply.body, path),
        Source::Header(name) => reply
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.clone())
            .ok_or_else(|| format!("the reply has no header `{name}`")),
    }
}

/// What a request becomes once its tokens are filled in.
struct Outgoing {
    method: Method,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

struct Sending<'a> {
    ctx: &'a Ctx,
    file: &'a Path,
    started: Instant,
    masker: &'a mut Masker,
    typed: Typed,
    masked: Vec<(String, Source)>,
    replies: HashMap<String, Reply>,
    ran: Vec<String>,
}

impl Sending<'_> {
    /// The returned text is final: reply text in it is masked and the saved paths are left whole.
    async fn send(mut self, chain: &[&Request]) -> String {
        let mut result = String::new();
        for (i, request) in chain.iter().enumerate() {
            let remaining = self.ctx.deadline.saturating_sub(self.started.elapsed());
            if remaining.is_zero() {
                return self.out_of_time(None, &chain[i..]);
            }
            let outgoing = match self.outgoing(request) {
                Ok(outgoing) => outgoing,
                Err(why) => return self.stopped(request, &format!("was not sent: {why}")),
            };
            let answer = match tokio::time::timeout(remaining, self.fetch(&outgoing)).await {
                Err(_) => return self.out_of_time(Some(name(request)), &chain[i + 1..]),
                Ok(Err(e)) => {
                    let reached = if e.is_connect() || e.is_builder() {
                        "It did not reach the carrier"
                    } else {
                        "It may have reached the carrier"
                    };
                    let why = format!("failed: {}. {reached}", reason(e));
                    return self.stopped(request, &why);
                }
                Ok(Ok(answer)) => answer,
            };
            let (status, mut reply) = answer;
            let found = if self.carries_masked(request) {
                credential_values(&reply.headers, &reply.body)
            } else {
                Ok(Vec::new())
            };
            let withheld = found.is_err();
            match found {
                Ok(values) => values.iter().for_each(|value| self.masker.add(value)),
                // Dropped here, so nothing later, a reference included, can reach the raw reply.
                Err(note) => {
                    reply = Reply {
                        headers: Vec::new(),
                        body: note,
                    };
                }
            }
            // A later request may use this value, so the mask must know it before anything is saved.
            for (_, source) in self.masked.iter().filter(|(from, _)| from == name(request)) {
                if let Ok(value) = read(&reply, source) {
                    self.masker.add(&value);
                }
            }
            let exchange = self.masked_exchange(&outgoing, status, &reply);
            let saved = replies::save(self.file, name(request), &exchange);
            let saved = match &saved {
                Ok(path) => path.display().to_string(),
                Err(why) => format!("not saved: {}", self.masker.apply(why)),
            };
            result = self.report(request, status, &exchange, &saved);
            if withheld {
                return with_unsent(result, &chain[i + 1..]);
            }
            if i + 1 < chain.len() {
                self.ran.push(format!(
                    "{}: received, {status}, saved to {saved}",
                    name(request)
                ));
            }
            self.replies.insert(name(request).to_string(), reply);
        }
        result
    }

    /// Whether `request` carries a typed value, or a reply value that is in the mask.
    fn carries_masked(&self, request: &Request) -> bool {
        parts(request).any(|part| match part {
            Part::Secret(_) => true,
            Part::Reply {
                request: from,
                source,
            } => self
                .replies
                .get(from)
                .and_then(|reply| read(reply, source).ok())
                .is_some_and(|value| self.masker.holds(&value)),
            _ => false,
        })
    }

    fn outgoing(&mut self, request: &Request) -> Result<Outgoing, String> {
        let scheme = if request.origin.https {
            "https"
        } else {
            "http"
        };
        let port = request
            .origin
            .port
            .map_or(String::new(), |p| format!(":{p}"));
        let path = self.fill(request, &request.path, Place::Url)?;
        let url = format!("{scheme}://{}{port}{path}", request.origin.host);
        let method = Method::from_bytes(request.method.as_bytes())
            .map_err(|_| format!("`{}` is not a method", request.method))?;
        let mut headers = Vec::new();
        for (key, value) in &request.headers {
            headers.push((key.clone(), self.fill(request, value, Place::Other)?));
        }
        if let Some(basic) = &request.basic {
            let user = self.fill(request, &basic.user, Place::Other)?;
            let password = self.fill(request, &basic.password, Place::Other)?;
            self.masker.add_basic(&user, &password);
            let token = STANDARD.encode(format!("{user}:{password}"));
            // shortcut: noted when sent, so it misses a Basic header later in the chain; note them all before sending if a carrier ever replays stored credentials.
            let host = request.origin.host.clone();
            self.typed
                .values
                .entry(host)
                .or_default()
                .push(token.clone());
            headers.push(("Authorization".into(), format!("Basic {token}")));
        }
        let place = body_place(&headers);
        let body = match &request.body {
            Some(text) => Some(self.fill(request, text, place)?),
            None => None,
        };
        Ok(Outgoing {
            method,
            url,
            headers,
            body,
        })
    }

    fn fill(&mut self, request: &Request, text: &Text, place: Place) -> Result<String, String> {
        let mut out = String::new();
        let mut digit_values = Vec::new();
        for part in &text.0 {
            let value = match part {
                Part::Lit(lit) => {
                    out.push_str(lit);
                    continue;
                }
                Part::Secret(secret) => self
                    .typed
                    .secrets
                    .get(&(request.origin.host.clone(), secret.clone()))
                    .cloned()
                    .ok_or_else(|| format!("no value is saved for `{secret}`"))?,
                Part::Reply {
                    request: from,
                    source,
                } => {
                    let value = self
                        .replies
                        .get(from)
                        .ok_or_else(|| format!("`{from}` has no reply"))
                        .and_then(|reply| read(reply, source))
                        .map_err(|why| format!("cannot read from `{from}`: {why}"))?;
                    self.refuse_foreign(request, &value)?;
                    value
                }
                Part::Guid => new_guid()?,
                Part::Datetime => jiff::Timestamp::now()
                    .strftime("%Y-%m-%dT%H:%M:%S%.3fZ")
                    .to_string(),
                Part::Timestamp => jiff::Timestamp::now().as_second().to_string(),
            };
            if matches!(part, Part::Secret(_))
                && maskable(&value)
                && value.bytes().all(|b| b.is_ascii_digit())
            {
                digit_values.push(out.len()..out.len() + value.len());
            }
            out.push_str(&escape(&value, place));
        }
        // A digit-only value matches only where no digit adjoins it, so one joined to digits needs its whole run masked.
        for span in digit_values {
            self.masker.add(digit_run(&out, span));
        }
        Ok(out)
    }

    /// A reply must not carry what the user typed for another host to this one, in any spelling.
    fn refuse_foreign(&self, request: &Request, value: &str) -> Result<(), String> {
        let others = self
            .typed
            .values
            .iter()
            .filter(|(host, _)| **host != request.origin.host);
        for typed in others.flat_map(|(_, values)| values) {
            let mut masker = Masker::new();
            masker.add(typed);
            if value.contains(typed.as_str()) || masker.apply(value) != value {
                return Err(format!(
                    "a value from a reply holds what the user typed for another host, so `{}` must not carry it to {}",
                    name(request),
                    request.origin.host
                ));
            }
        }
        Ok(())
    }

    async fn fetch(&self, out: &Outgoing) -> Result<(StatusCode, Reply), reqwest::Error> {
        let mut builder = self.ctx.http.request(out.method.clone(), &out.url);
        for (key, value) in &out.headers {
            builder = builder.header(key, value);
        }
        if let Some(body) = &out.body {
            builder = builder.body(body.clone());
        }
        let response = builder.send().await?;
        let status = response.status();
        let headers = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    String::from_utf8_lossy(v.as_bytes()).into_owned(),
                )
            })
            .collect();
        let body = response.text().await?;
        Ok((status, Reply { headers, body }))
    }

    fn masked_exchange(&self, out: &Outgoing, status: StatusCode, reply: &Reply) -> Exchange {
        let m = &*self.masker;
        let pairs = |list: &[(String, String)]| -> Vec<(String, String)> {
            list.iter().map(|(k, v)| (m.apply(k), m.apply(v))).collect()
        };
        Exchange {
            method: out.method.to_string(),
            url: m.apply(&out.url),
            request_headers: pairs(&out.headers),
            request_body: out.body.as_deref().map(|b| m.apply(b)),
            status: status.as_u16(),
            response_headers: pairs(&reply.headers),
            response_body: m.apply(&reply.body),
        }
    }

    fn ran_first(&self) -> String {
        if self.ran.is_empty() {
            return String::new();
        }
        format!("\nRan first:\n  {}\n", self.ran.join("\n  "))
    }

    fn report(
        &self,
        request: &Request,
        status: StatusCode,
        exchange: &Exchange,
        saved: &str,
    ) -> String {
        let mut text = format!("`{}`: {status}\nSaved: {saved}\n", name(request));
        text.push_str(&self.ran_first());
        text.push_str("\nHeaders:\n");
        for (key, value) in &exchange.response_headers {
            let _ = writeln!(text, "  {key}: {value}");
        }
        text.push_str("\nBody:\n");
        text.push_str(&exchange.response_body);
        match text.char_indices().nth(MAX_RESULT) {
            Some((at, _)) => {
                text.truncate(at);
                let _ = write!(
                    text,
                    "\n\n[Cut at {MAX_RESULT} characters; the whole reply is in {saved}]"
                );
                text
            }
            None => text,
        }
    }

    fn stopped(&self, request: &Request, what: &str) -> String {
        format!(
            "`{}` (line {}) {}.\n{}",
            name(request),
            request.line,
            self.masker.apply(what),
            self.ran_first()
        )
    }

    /// Tells the agent to call again only when nothing reached a carrier.
    fn out_of_time(&self, in_flight: Option<&str>, not_sent: &[&Request]) -> String {
        if self.ran.is_empty() && in_flight.is_none() {
            return format!("The call ran out of time before anything was sent; {CALL_AGAIN}.");
        }
        let mut text = String::from("The call ran out of time.\n");
        for line in &self.ran {
            let _ = writeln!(text, "{line}");
        }
        if let Some(name) = in_flight {
            let _ = writeln!(
                text,
                "{name}: in flight, no reply yet. It may have completed at the carrier; check before repeating it."
            );
        }
        for request in not_sent {
            let _ = writeln!(text, "{}: not sent", name(request));
        }
        text
    }
}

/// The maximal run of digits around `span`, which holds only digits.
fn digit_run(text: &str, span: Range<usize>) -> &str {
    let digit = |c: char| c.is_ascii_digit();
    let start = text[..span.start].trim_end_matches(digit).len();
    let end = text.len() - text[span.end..].trim_start_matches(digit).len();
    &text[start..end]
}

/// `result` of a withheld reply, with the requests the chain will not send after it.
fn with_unsent(mut result: String, rest: &[&Request]) -> String {
    if !rest.is_empty() {
        let names: Vec<String> = rest.iter().map(|r| format!("`{}`", name(r))).collect();
        let _ = write!(
            result,
            "\n\nNot sent, because a reference into this withheld reply cannot be read: {}.",
            names.join(", ")
        );
    }
    result
}

/// How a substituted value is escaped in a body, from its `Content-Type`.
fn body_place(headers: &[(String, String)]) -> Place {
    let media = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .and_then(|(_, v)| v.split(';').next())
        .map(|m| m.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if media.contains("json") {
        Place::Json
    } else if media.contains("xml") {
        Place::Xml
    } else if media == "application/x-www-form-urlencoded" {
        Place::Form
    } else {
        Place::Other
    }
}

/// `reqwest`'s error text names the URL, which can hold a secret; the causes say why it failed.
fn reason(error: reqwest::Error) -> String {
    let error = error.without_url();
    let mut text = error.to_string();
    let mut cause = std::error::Error::source(&error);
    while let Some(c) = cause {
        let _ = write!(text, ": {c}");
        cause = c.source();
    }
    text
}

fn new_guid() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|e| format!("cannot make a guid: {e}"))?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex = format!("{:032x}", u128::from_be_bytes(b));
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    ))
}
