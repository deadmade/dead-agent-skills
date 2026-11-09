# http-runner Implementation Plan

<!-- glance -->

```
Plan: http-runner · 10 tasks · ~2710 lines · 51 files
 1  [1 The crate and the `.htt…]
 2  [2 Reading values from rep… ←1]  [3 The login store ←1]  [4 Escaping and masking ←1]
     [7 Generating a `.http` fi… ←1]
 3  [5 The login page ←3]
 4  [6 Running a request ←1,2,3,4,5]
 5  [8 The MCP server ←6,7]
 6  [9 Plugin, skill, installe… ←8]
 7  [10 The live checks ←9]

#   does                                                          files  adds                            size
1   Adds the crate with every dependency the later tasks need, …  9      `tools/http-runner` crate; `p…  ~450
2   Reads one value out of a JSON or XML reply.                   2      `extract::from_body`            ~130
3   Keeps what the user typed, per host, in a per-user file out…  2      `store::Store`; environment v…  ~160
4   Escapes a value for where it is inserted, and removes every…  2      `mask::{Masker, Place, escape…  ~190
5   Opens a local page in the user's browser, shows the hosts a…  5      `login_page::{Pages, Ask, Hos…  ~350
6   Runs a named request and the requests it depends on, gets a…  5      `run::{Ctx, RunArgs, run}`; `…  ~520
7   Reads a local OpenAPI 3 file and writes one `.http` file wi…  2      `generate::{generate, Generat…  ~380
8   Exposes `run` and `generate` as MCP tools, and proves the t…  5      `tools::Server`; debug-only e…  ~260
9   Ships the server as an opt-in plugin for Claude Code and Co…  18     plugin `http-runner`; skill `…  ~180
10  Proves it on the real DHL sandbox and measures whether an a…  1      `docs/features/carrier-api-in…  ~90
```

<!-- /glance -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local MCP server that generates and runs `.http` files for an agent, so the agent reads a carrier's real replies and the user types only a login.

**Architecture:** One Rust binary with two fixed tools. `parse` turns a `.http` file into typed requests; `run` resolves a chain, gets logins through `store` and `login_page`, sends with `reqwest`, masks with `mask`, and saves through `replies`. `generate` reads a local OpenAPI file and writes a `.http` file from the spec's own examples.

**Tech Stack:** Rust 1.97 (edition 2024), rmcp 3.9.0 (the workspace's pin), reqwest 0.13.5 with rustls and ring, jsonpath-rust 1.0.12, serde_norway 0.9.42, sxd-xpath 0.4.2 with sxd-document 0.3, TypeScript for the installer.

**Spec:** [spec.md](spec.md)

**Base:** a worktree on a new branch `http-runner`, cut from `origin/main`. Local `main` lags `origin/main`, and the AGENTS.md on local `main` describes the older installer layout, so read AGENTS.md from the worktree. Three things exist only in the main checkout, `/home/deadmade/projects/dead-claude-skills`, because none is on `origin/main`:

- this run's folder, `docs/features/carrier-api-integration/`: copy it into the worktree before Task 1;
- the DPD schemas, `docs/features/api-mcp/fixtures/dpd/`: read them there, for the replies in Task 6;
- the `## http-runner` section of `GLOSSARY.md`: Task 9 copies it into the worktree's file.

In the worktree, before Task 1, run `npm ci` and then `nix develop` once from its root; without them its first commit fails. From then on, the run uses the worktree's copy of `flow.md`, and no commit includes it. Run the tasks in sequence, because several edit `lib.rs`. The branch merges as one PR, because CI builds the Nix package from Task 1's routing but the package arrives only in Task 9.

## Global Constraints

- Secrets: resolved in `store` and `run` at send time; never seen by `parse`, `replies`, the tool result, or logs (masking in `run`).
- Destination: resolved in `store` (a value belongs to one host) and checked in `run`; never decided in `parse` (which only reads the host from the file), `tools` or `replies`.
- `.http` syntax: resolved in `parse`; never seen by `run`, `store`, `replies` or `tools`, which take parsed requests.
- Asking the human: resolved in `login_page`; never seen by `parse`, `replies` or `tools`.
- Generating from OpenAPI: resolved in `generate`; never seen by `parse`, `run`, `store`, `login_page` or `replies`, which only ever see a `.http` file.
- REST versus SOAP: resolved nowhere; a body is text, and XPath or JSONPath is chosen by the reference the file contains.
- Add no interface for one implementation, no helper for one caller, and no option nobody sets.
- Skills to load: rust-skills `rust-best-practices` for every Rust task; hallmark `hallmark` for the page in Task 5 only.
- Every dependency version lives in the root `[workspace.dependencies]`; members use `workspace = true`. `Cargo.lock` must hold one `reqwest` entry (AGENTS.md): `grep -c '^name = "reqwest"' Cargo.lock` prints 1.
- TLS as in web-mcp: `reqwest` features `rustls-no-provider`, `rustls` features `ring,std,tls12`, and `rustls::crypto::ring::default_provider().install_default()` first in `main`, and in `tests/common/mod.rs`, because tests through `lib.rs` never run `main`.
- Test-only hooks exist in debug builds only (`cfg!(debug_assertions)`), as web-mcp's do.
- Before each commit, run `treefmt` on the files you changed (never a folder). Commit messages are one sentence with no co-author line. Stage named paths only; never `git add -A`.
- After Task 1's commit, every cargo command uses `--locked`.

## Review Focus

1. A password holding `&`, `<` or `"` in a SOAP body: the carrier receives it escaped and no form of it appears in the result (Task 4 `escapes_and_masks_each_form`, Task 6 `xml_special_password`).
2. A value crossing hosts: a reply value used as the URL's host is refused by parse (Task 1 `refuses_token_in_host`), and a reply echoing another host's typed value is not sent (Task 6 `reply_value_equal_to_another_hosts_login_is_not_sent`).
3. Text in a spec trying to become a request: it stays inside comments, and a body that would break the file is left out (Task 7 `comment_cannot_start_a_request`, `body_that_would_break_the_file_is_left_out`).
4. Another web page posting to the login page, or a rebinding `Host`: refused, nothing saved (Task 5 `refuses_bad_host_and_origin`, `refuses_missing_token`).
5. A slow carrier under Codex's 60-second limit: the call returns a readable result inside 55 seconds, says what may have completed, and asks for a repeat only when nothing was sent (Task 6 `deadline_after_send_says_it_may_have_completed`, `deadline_before_send_says_call_again`).
6. A login reply: its token is masked in the saved file as well as in the result, including when the login is run alone, and a secret across the 40,000-character cut leaves no prefix (Task 6 `login_reply_is_saved_masked`, `login_run_alone_is_masked`, `secret_at_the_cut_boundary_leaves_no_prefix`).
7. A connection error on a URL holding a secret: the error text carries neither the URL nor the secret (Task 6 `transport_error_holds_no_secret`).

## Test seams

- `parse::parse`: catches every format rule and refusal. Misses differences from REST Client's real behaviour.
- `extract::from_body`: catches JSONPath and XPath results on real reply shapes. Misses what a live carrier sends.
- `mask::Masker` and `mask::escape`: catch each encoded form. Miss leaks through a path that never calls them.
- `store::Store`: catches per-host isolation and file handling. Misses another process of the same user reading the file.
- `generate::generate`: catches what lands in the file, and that `parse` reads it. Misses specs shaped unlike the tests.
- `login_page::Pages` over real loopback HTTP: catches token, `Host`, `Origin` and field checks. Misses whether a browser really opens.
- `run::run` through `lib.rs`, against the fake carrier in `tests/common/mod.rs`: catches the whole run, masking and saving. Misses real carriers.
- The `http-runner` binary over stdio: catches the tool layer, including what reaches the model and stderr. Misses real clients.
- `tools/installer/core/*.test.ts`, `steps/*.test.ts`, `scripts/*.test.mjs`: catch registration. Miss a real install.
- The live checks in Task 10: catch real DHL behaviour and whether an agent succeeds. They need the user's sandbox key.

---

### Task 1: The crate and the `.http` parser

**Does:** Adds the crate with every dependency the later tasks need, routes it in CI, and turns a `.http` file into typed requests, refusing anything outside the supported format.
**Depends on:** none
**Adds:** `tools/http-runner` crate; `parse::{parse, ParsedFile, Request, Origin, Text, Part, Source, BasicAuth, ParseError}`; binary `--version`; dependencies `jsonpath-rust`, `serde_norway`, `sxd-xpath`, `sxd-document`, `getrandom`
**Size:** ~450

**Files:**

- Modify: `Cargo.toml`
- Modify: `Cargo.lock`
- Modify: `scripts/ci-changes.mjs`
- Modify: `scripts/ci-changes.test.mjs`
- Modify: `scripts/release.test.mjs`
- Create: `tools/http-runner/Cargo.toml`
- Create: `tools/http-runner/src/main.rs`
- Create: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/parse.rs`

**Interfaces:**

- Produces:
  - `pub fn parse(text: &str) -> Result<ParsedFile, ParseError>`; `ParseError { line: usize, message: String }`
  - `ParsedFile { requests: Vec<Request> }`
  - `Request { name: Option<String>, line: usize, method: String, origin: Origin, path: Text, headers: Vec<(String, Text)>, basic: Option<BasicAuth>, body: Option<Text> }`
  - `Origin { https: bool, host: String, port: Option<u16> }`, with `host` lowercased; `BasicAuth { user: Text, password: Text }`
  - `Text(Vec<Part>)`; `Part::{Lit(String), Secret(String), Reply { request: String, source: Source }, Guid, Datetime, Timestamp}`; `Source::{Body(String), Header(String)}`

- [ ] **Step 1: Write the failing tests** in `parse.rs`'s test module. Each asserts on the parsed values:
  - `optional_version_and_trailing_separator`: `"POST https://a.example/x\nContent-Type: text/xml\n\n<a/>\n\n###\n"` gives one request with body `<a/>`.
  - `comment_only_blocks_are_skipped`: a `### note` block holding only comments gives no request, and the next block parses.
  - `crlf_file_parses_like_lf`: a file with CRLF line endings, holding headers, a body and `###`, gives the same requests as its LF copy.
  - `names_in_both_comment_forms`: `# @name a` and `// @name b`.
  - `request_name_is_restricted`: `# @name ../../x` returns a `ParseError`; a name holds only letters, digits, `_` and `-`.
  - `file_variables_expand_in_later_lines`, with `@baseUrl = https://a.example` used in the URL.
  - `tokens_become_parts`: `{{$dotenv P}}` → `Secret("P")`; `{{login.response.body.//authToken}}` → `Reply { "login", Body("//authToken") }`; `{{login.response.headers.X-T}}` → `Source::Header`; `{{$guid}}`, `{{$datetime iso8601}}`, `{{$timestamp}}`.
  - `tokens_in_comments_are_ignored`: `# {{$prompt x}}` is no error.
  - `basic_forms`: `Authorization: Basic {{$dotenv U}} {{$dotenv P}}` and `Basic u:p` fill `basic` and leave no `Authorization` header.
  - `xml_body_is_text`.
  - `hosts_are_lowercased`: `GET https://API.Example/x` has host `api.example`.
  - `refuses_host_header`: a `Host:` line returns a `ParseError` naming its line.
  - `refuses_token_in_host`: `GET https://{{$dotenv H}}/x` and `GET https://{{a.response.body.$.h}}/x` return `ParseError` naming line 1.
  - `refuses_unsupported`: `{{$prompt x}}`, `{{$aadToken}}`, a body line `< ./f.xml` each return a `ParseError` with the line and the construct's text.

- [ ] **Step 2: Run them to see them fail.** `cargo test -p http-runner parse` fails: crate missing.
- [ ] **Step 3: Add the crate.** Add `"tools/http-runner"` to `members`, and give the crate `[package]` fields and `[lints] workspace = true` as in `tools/ado-mcp/Cargo.toml`. Add to `[workspace.dependencies]`: `jsonpath-rust = "=1.0.12"`, `serde_norway = "=0.9.42"`, `sxd-xpath = "=0.4.2"`, `sxd-document = "0.3"`, and `getrandom` at the newest version `Cargo.lock` already holds. Declare now every dependency the later tasks use, so that no later task adds one: `base64`, `getrandom`, `jiff`, `jsonpath-rust`, `reqwest`, `rmcp`, `rustls`, `serde`, `serde_json`, `serde_norway`, `sxd-document`, `sxd-xpath`, `tokio`, `url`. Copy the feature lists of `reqwest` and `rustls` from `tools/web-mcp/Cargo.toml` and of `rmcp` and `tokio` from `tools/ado-mcp/Cargo.toml`. Use `rmcp::schemars`; add no direct `schemars`. `main.rs` prints `http-runner <version>` for `--version` before anything else.
- [ ] **Step 4: Route the crate in CI.** In `scripts/ci-changes.mjs`, add the crate to `crates` and both `roots`. In `scripts/ci-changes.test.mjs`, add it to the crate lists and add a row for `plugins/opt-in/mcp/http-runner/`. In `scripts/release.test.mjs`, add the third name to both lists.
- [ ] **Step 5: Implement `parse`.** Treat CRLF and LF line endings alike. A line starting with `###` ends the block, and the rest of that line is a comment. Skip a block with no request line. Drop comment lines before reading tokens. Expand file variables at parse time, so later stages never see them. For a Basic header, read the `{{...}}` tokens first and split user from password only on a literal space or colon between them, because a token itself holds a space.
- [ ] **Step 6: Run the tests.** `cargo test -p http-runner parse` passes, `python3 scripts/check_cargo_workspace.py` prints no violation, and `node --test scripts/ci-changes.test.mjs scripts/release.test.mjs scripts/repo-facts.test.mjs` passes.
- [ ] **Step 7: Commit** the listed files.

### Task 2: Reading values from replies

**Does:** Reads one value out of a JSON or XML reply.
**Depends on:** Task 1
**Adds:** `extract::from_body`
**Size:** ~130

**Files:**

- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/extract.rs`

**Interfaces:**

- Produces: `pub fn from_body(body: &str, path: &str) -> Result<String, String>`. A path starting with `$` is JSONPath; any other is XPath 1.0 with no namespace map.

- [ ] **Step 1: Write the failing tests** on this reply: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:getAuthResponse xmlns:ns2="http://dpd.com/common/service/types/LoginService/2.0"><return><authToken>T1</authToken></return></ns2:getAuthResponse></soap:Body></soap:Envelope>`
  - `xpath_bare_name_on_unqualified_element`: `//authToken` → `T1`.
  - `xpath_local_name_reaches_namespaced`: `//*[local-name()='getAuthResponse']/return/authToken` → `T1`.
  - `xpath_no_match_is_an_error`: the error text contains the path.
  - `xpath_prefixed_name_is_an_error_not_a_panic`: `//ns2:authToken` returns an error that points to `local-name()`; `//self::authToken` is not refused.
  - `several_matches_take_the_first`: in XPath and JSONPath.
  - `jsonpath_string_and_number`: `$.token` and `$.n` on `{"token":"T","n":5}` → `T`, `5`.
  - `jsonpath_object_comes_back_as_json`: `$.o` on `{"o":{"a":1}}` → `{"a":1}`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement `from_body`** on `sxd-xpath` with `sxd-document` and on `jsonpath-rust`. An element yields its text content, an attribute its value. Refuse a prefixed name test before evaluating (a `:` outside quotes that is not part of `::`), because `sxd-xpath` panics on a prefix it has no namespace for.
- [ ] **Step 4: Run** `cargo test --locked -p http-runner extract` and the `Cargo.lock` reqwest check: tests pass and it prints 1.
- [ ] **Step 5: Commit** the listed files.

### Task 3: The login store

**Does:** Keeps what the user typed, per host, in a per-user file outside the project.
**Depends on:** Task 1
**Adds:** `store::Store`; environment variable `HTTP_RUNNER_DIR`
**Size:** ~160

**Files:**

- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/store.rs`

**Interfaces:**

- Produces:
  - `Store::open() -> Result<Store, String>` and `Store::at(dir: PathBuf) -> Store`
  - `Store::missing(&self, host: &str, names: &[String]) -> Result<Vec<String>, String>`
  - `Store::is_confirmed(&self, host: &str) -> Result<bool, String>`
  - `Store::get(&self, host: &str, name: &str) -> Result<Option<String>, String>`
  - `Store::values(&self, host: &str) -> Result<Vec<String>, String>`
  - `Store::save(&self, host: &str, values: &BTreeMap<String, String>) -> Result<(), String>`

- [ ] **Step 1: Write the failing tests**:
  - `value_belongs_to_one_host`: saved for `a.example`, `get("b.example", n)` is `None`.
  - `confirmed_with_no_values`: `save(host, &empty)` makes `is_confirmed` true.
  - `save_merges_and_overwrites`.
  - `save_keeps_another_sessions_host`: two `Store::at` handles on one folder each save a host, and both hosts are there.
  - `written_file_is_private` (unix): mode `0o600`, folder `0o700`.
  - `corrupt_file_is_an_error_not_empty`.
  - `dir_precedence`: `HTTP_RUNNER_DIR` wins, through a private `dir_from(env: impl Fn(&str) -> Option<OsString>)` so the test sets no process-wide variable.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** The folder is `HTTP_RUNNER_DIR`, else `%LOCALAPPDATA%\http-runner` on Windows, else `$XDG_DATA_HOME/http-runner`, else `~/.local/share/http-runner`; with no home folder, `open` returns an error (as `search_dir` in `tools/web-mcp/src/config.rs` does). The file is `logins.json`, `{"<host>": {"<NAME>": "<value>"}}`; a host that has a key is confirmed. `save` re-reads the file immediately before writing, writes to a temporary file in the same folder, and renames it, so two sessions lose no host and cannot leave half a file.
- [ ] **Step 4: Run** `cargo test --locked -p http-runner store`: passes.
- [ ] **Step 5: Commit** the listed files.

### Task 4: Escaping and masking

**Does:** Escapes a value for where it is inserted, and removes every form of a secret from text.
**Depends on:** Task 1
**Adds:** `mask::{Masker, Place, escape}`
**Size:** ~190

**Files:**

- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/mask.rs`

**Interfaces:**

- Produces:
  - `pub enum Place { Url, Form, Xml, Json, Other }`; `pub fn escape(value: &str, place: Place) -> String`
  - `Masker::new()`, `Masker::add(&mut self, value: &str)`, `Masker::add_basic(&mut self, user: &str, password: &str)`, `Masker::apply(&self, text: &str) -> String`

- [ ] **Step 1: Write the failing tests**:
  - `escapes_and_masks_each_form`: for `p&<"x`, `apply` removes the plain, XML-escaped, JSON-escaped and percent-encoded forms.
  - `numeric_entities_and_unicode_escapes_are_masked`: `p&#38;x1`, `p&#x26;x1` and the JSON form that writes `&` as a backslash, `u` and `0026` are all gone for the value `p&x1`.
  - `basic_header_base64_is_masked`: Base64 of `u:p4ss` is gone after `add_basic`.
  - `digits_become_nines`: `12345` → `99999`, so `{"a":12345}` stays valid JSON.
  - `digit_value_matches_on_digit_boundaries`: with `1234` added, `912345` is unchanged and `a1234b` becomes `a9999b`.
  - `other_values_become_stars`.
  - `longest_first`: with `abcd` and `abcdef` added, `abcdef` leaves no `ef`.
  - `short_values_are_ignored`: `add("abc")` changes nothing.
  - `escape_by_place`: `&` → `&amp;` (Xml), `\"` for `"` (Json), `%26` (Url, Form), unchanged (Other).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Add no new dependency beyond the workspace's `base64`; write percent-encoding by hand for the RFC 3986 unreserved set. Mask the numeric forms of the characters XML and JSON escape, in decimal and hex.
- [ ] **Step 4: Run** `cargo test --locked -p http-runner mask`: passes.
- [ ] **Step 5: Commit** the listed files.

### Task 5: The login page

**Does:** Opens a local page in the user's browser, shows the hosts and fields, and saves what is typed.
**Depends on:** Task 3
**Adds:** `login_page::{Pages, Ask, HostFields, Open, Outcome}`; test binary `fake-browser`
**Size:** ~350

**Files:**

- Modify: `tools/http-runner/Cargo.toml`
- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/login_page.rs`
- Create: `tools/http-runner/tests/bin/fake_browser.rs`
- Create: `tools/http-runner/tests/login_page.rs`

**Interfaces:**

- Consumes: `Store` (Task 3).
- Produces:
  - `HostFields { host: String, names: Vec<String> }`; `Ask { hosts: Vec<HostFields> }`
  - `pub enum Open { System, Program(Vec<OsString>) }`: the program and leading arguments that receive the address instead of a browser.
  - `Pages::new(store: Arc<Store>, open: Open, lifetime: Duration) -> Pages`
  - `Pages::ask(&self, ask: Ask, wait: Duration) -> Outcome`, async. A call whose hosts and fields the open page already covers waits on it and opens no other. Any other call closes that page, whose address then answers 404 and whose waiters get `Replaced`, and opens a new one.
  - `pub enum Outcome { Saved, StillOpen, Replaced, Failed(String) }`. `Failed` never contains the address or a child process's output.
  - Form fields are `<host>/<NAME>`, `application/x-www-form-urlencoded`.

- [ ] **Step 1: Write the failing tests** in `tests/login_page.rs`, over real loopback HTTP. `tests/bin/fake_browser.rs` is a `[[bin]]` named `fake-browser`, as web-mcp's fake is, so it runs on Windows and `CARGO_BIN_EXE_fake-browser` finds it from `tests/`. It prints its last argument to stdout and stderr, writes it to the file after `--out` (or `FAKE_BROWSER_OUT`), and with `--fail` (or `FAKE_BROWSER_FAIL`) exits 3.
  - `saves_typed_values_for_the_host`.
  - `shows_host_and_each_field`, with host and field names HTML-escaped.
  - `refuses_missing_token`: 404 and nothing saved.
  - `refuses_bad_host_and_origin`: `Host: evil.example` and `Origin: https://evil.example` each get 403 and nothing is saved.
  - `refuses_short_or_multiline_value`: fewer than four characters, or one holding CR or LF, shows the form again and saves nothing.
  - `still_open_then_saved`: `ask` with a short wait returns `StillOpen`; after the POST, a second `ask` returns `Saved` and no second address is written.
  - `different_ask_replaces_the_open_page`: an `ask` for another host gets a new address, the old one answers 404, and the earlier waiter gets `Replaced`.
  - `idle_connection_does_not_block_the_page`: a connection held open with nothing sent does not stop a real request being served.
  - `expires_after_its_lifetime`, built with a short `lifetime`: returns `Failed`, and a late POST is refused.
  - `no_browser_fails_without_the_address`: with `--fail`, `ask` returns `Failed("no browser opened")`, and the address the fake printed appears nowhere in it.
  - `one_time`: after a successful POST, the address answers 404.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Run one `std::net::TcpListener` on `127.0.0.1:0`, on its own thread. Handle each connection on a thread of its own with a read timeout of five seconds, because a browser opens idle connections in advance. The address is `http://127.0.0.1:<port>/<32 hex characters from getrandom>`. `Host` must equal `127.0.0.1:<port>`; `Origin`, when present, must equal `http://127.0.0.1:<port>`. Refuse POST bodies over 64 KB. The page names each host in large type, with `type="password"` fields, or a confirm-only form when a host has no fields.
- [ ] **Step 4: Implement opening the browser.** Use `xdg-open <url>` on Linux, found in the absolute entries of PATH, and `%SystemRoot%\System32\rundll32.exe url.dll,FileProtocolHandler <url>` on Windows, by full path and never through a shell. The child's stdin, stdout and stderr are null, because stdout is the MCP channel and the child's output may repeat the address. Poll the child for two seconds: a spawn error or a non-zero exit in that time is "no browser opened", and a child still running is not a failure, because some `xdg-open`s stay until the browser closes.
- [ ] **Step 5: Run** `cargo test --locked -p http-runner --test login_page`: passes.
- [ ] **Step 6: Commit** the listed files.

### Task 6: Running a request

**Does:** Runs a named request and the requests it depends on, gets any missing login, sends, masks and saves.
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5
**Adds:** `run::{Ctx, RunArgs, run}`; `replies::{save, Exchange}`; the fake carrier in `tests/common/mod.rs`
**Size:** ~520

**Files:**

- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/run.rs`
- Create: `tools/http-runner/src/replies.rs`
- Create: `tools/http-runner/tests/common/mod.rs`
- Create: `tools/http-runner/tests/run.rs`

**Interfaces:**

- Consumes: `parse::*`, `extract::from_body`, `Store`, `Pages`, `Masker`, `escape`.
- Produces:
  - `Ctx { http: reqwest::Client, store: Arc<Store>, pages: Pages, deadline: Duration }`; `Ctx::new(store: Arc<Store>, pages: Pages) -> Result<Ctx, String>`, with `deadline` 55 seconds.
  - `RunArgs { file: PathBuf, request: String, retype_login: bool }`
  - `pub async fn run(ctx: &Ctx, args: RunArgs) -> String`, always readable text.
  - `replies::save(http_file: &Path, request: &str, exchange: &Exchange) -> Result<PathBuf, String>`. An `Exchange` holds text that is already masked; `replies` never sees a `Masker`.

- [ ] **Step 1: Write the failing tests** in `tests/run.rs`, through `lib.rs`. `tests/common/mod.rs` holds one fake carrier on a local `TcpListener`, a temporary-folder helper, a `Store::at` seeded with confirmed hosts, and a setup call that installs the ring provider (`let _ = rustls::crypto::ring::default_provider().install_default();`, as web-mcp's tests do); it starts with `#![allow(dead_code)]`, since each test file uses part of it. `localhost` and `127.0.0.1` reach one fake carrier as two hosts. Tokens and typed values in these tests have at least four characters, because `Masker` ignores shorter ones. The carrier's SOAP replies follow `getAuth` and `storeOrders` in the DPD WSDLs, inline in the test.
  - `chain_runs_in_order_and_every_time`, `cycle_is_an_error`, `unknown_request_is_an_error`, `parse_error_names_the_line`.
  - `relative_file_is_refused`.
  - `http_only_for_loopback`: `http://a.example/` is refused unsent; `localhost` and `127.0.0.1` are sent.
  - `no_redirect_followed`: a 302 comes back as the result.
  - `http_error_and_soap_fault_are_results`.
  - `unconfirmed_host_is_not_sent`: the carrier sees no connection when the page fails; `host_without_secrets_needs_confirming` (done-check 5).
  - `no_browser_tells_agent_to_ask_the_user`.
  - `retype_login_reopens_before_sending`.
  - `replaced_page_sends_nothing`: while a `run` waits on the page, a second `run` for another host replaces it and that host is saved; the first `run` returns a result telling the agent to call again, and the carrier saw nothing for it.
  - `dpd_login_token_reaches_soap_header`: the fake carrier refuses `/ship` without the token from the XML reply; the result holds the `storeOrders` reply (done-check 2).
  - `xml_special_password`: the password `p&<"x1` arrives at the carrier XML-escaped.
  - `header_reply_value_is_masked_url_value_is_not`: a value referenced in a header, inside a `<soap:Header>` or inside an unprefixed `<Header>` is masked; one referenced in a URL path stays (`shipment_number_stays_readable`).
  - `response_header_reference_is_read_and_masked`: `{{login.response.headers.X-T}}` sent in a header reaches the carrier and is masked.
  - `secrets_absent_everywhere`: the typed value and the token, in every form, are absent from the result text and every saved file, side files included (done-check 4).
  - `login_reply_is_saved_masked`: the login's own saved file holds no token.
  - `login_run_alone_is_masked`: `run` with `request` set to the login masks its token in the result and the saved file, though nothing in that chain references it.
  - `transport_error_holds_no_secret`: a refused connection on a URL holding a typed value in its query returns a result without that value or the URL's query.
  - `value_not_sent_to_other_host` (done-check 5).
  - `reply_value_equal_to_another_hosts_login_is_not_sent`: a reply that echoes the value typed for `localhost` is referenced in a request to `127.0.0.1`; the request is not sent, and the result names the request and its line. A value containing it is refused the same way.
  - `result_cut_at_40000_chars_on_a_boundary`, with a note naming the saved file.
  - `secret_at_the_cut_boundary_leaves_no_prefix`: a secret straddling character 40,000 leaves none of its characters.
  - `long_base64_run_goes_to_its_own_file`: a run of more than 4096 base64 characters in the reply is written beside the JSON and replaced by that file's name.
  - `same_timestamp_does_not_overwrite`.
  - `deadline_before_send_says_call_again`: a short `ctx.deadline` and a page that stays open; the result tells the agent to call `run` again, and the carrier saw nothing.
  - `deadline_after_send_says_it_may_have_completed`: a login succeeds and the target stalls; the result lists the login as received and the target as in flight, says it may have completed, does not tell the agent to call again, and the login exchange is saved.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement `replies`.** Writes `http-replies/<file stem>/<request name>/<timestamp>.json` beside the `.http` file, with `{request, response}`. The timestamp holds no colon, as in `20261109T130405.123Z`, because Windows refuses one in a file name. Create the file with `create_new`, and add `-2`, `-3` and so on when the name is taken.
- [ ] **Step 4: Implement `run`** in the order of the spec's "How a run works". Refuse a relative `file`. Each request's timeout is 30 seconds. The whole call has `ctx.deadline`. The wait for the page is the smaller of 50 seconds and the deadline. After `Saved`, read the store again and send only when nothing is missing, otherwise return a result telling the agent to call again; never send on `Saved` alone. `StillOpen`, `Replaced` and `Failed` end the call with their own messages. Put every `Store::values` value of a host used in the run into the `Masker`. Before anything is sent, walk every request in the parsed file, not only the chain, and list each `(request, source)` whose value is sent in a header, in a Basic user or password, or between a `Header` element's start tag, prefixed or not, and its closing tag. When a reply arrives, add those values to the `Masker` first, then mask the whole exchange, then save it, then cut the result. Take every error from `reqwest` with `without_url()`, and pass every error text through the `Masker`. Escape a substituted value by `Place`, chosen from the `Content-Type` for a body. Before sending, refuse a reply value that equals or contains a `Store::values` value of another host in the run.
- [ ] **Step 5: Run** `cargo test --locked -p http-runner --test run`: passes.
- [ ] **Step 6: Commit** the listed files.

### Task 7: Generating a `.http` file

**Does:** Reads a local OpenAPI 3 file and writes one `.http` file with a named request per operation and the spec's first example as each body.
**Depends on:** Task 1
**Adds:** `generate::{generate, Generated}`
**Size:** ~380

**Files:**

- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/generate.rs`

**Interfaces:**

- Produces: `pub fn generate(spec: &Path, output: &Path, base_url: Option<&str>) -> Result<Generated, String>`; `Generated { path: PathBuf, requests: usize, with_body: usize }`. The error is readable text that tells the agent it can write the file itself.

- [ ] **Step 1: Write the failing tests** in `generate.rs`'s test module, on small inline specs written to a temporary folder. Every test that writes a file also passes it through `parse::parse`.
  - `first_example_word_for_word`: `examples` holding two `$ref`s into `components/examples`, in non-alphabetical order, gives the first one's `value` as pretty JSON with its keys in the spec's order, and a comment naming the others.
  - `example_forms`: media-level `example`, inline `examples.<n>.value`, and `schema.example`, in that order of preference.
  - `request_body_ref_is_resolved`: `$ref: '#/components/requestBodies/X'`.
  - `no_example_means_no_body_and_a_comment`, with `with_body` counting it out.
  - `external_examples_and_remote_refs_are_not_followed`: `externalValue` and `$ref: 'https://x.example/a.yaml'` each give no body and a comment.
  - `ref_cycle_is_not_followed`.
  - `string_example_is_kept_verbatim`: an `application/xml` string example.
  - `structured_example_for_other_media_gets_no_body`: an object under `application/x-www-form-urlencoded`.
  - `names_come_from_operation_id`: otherwise `<method>_<path>`, reduced to letters, digits, `_` and `-`; a duplicate gets `_2`.
  - `parameters_are_listed_and_path_stays`: `/orders/{id}` stays in the URL, and a comment lists `id (path)` and `validate (query)`.
  - `comment_cannot_start_a_request`: a `summary` holding a newline and `POST https://evil.example/` adds no request.
  - `body_that_would_break_the_file_is_left_out`: an example holding `{{$dotenv X}}`, and one with a line starting `###`, each give no body and a comment.
  - `path_that_would_break_the_file_is_left_out`: a path holding whitespace or `{{` gives a comment and no request.
  - `base_url_wins`, with a trailing `/` trimmed; `one_server_is_used`; `several_servers_without_base_url_are_refused_and_listed`, with both URLs in the error; `no_absolute_server_is_refused`, for none, a relative one, and one holding `{var}`; `malformed_base_url_is_refused`, for one holding a newline.
  - `unquoted_numeric_keys_parse`: `responses: {200: ...}` in YAML.
  - `json_spec_reads_too`, with tabs for indentation.
  - `swagger_2_is_refused`; `unreadable_spec_is_a_readable_error`.
  - `refuses_to_overwrite`: an existing `dhl.http` is an error and its content is unchanged.
  - `relative_paths_are_refused`, for `spec` and `output`; `spec_must_be_a_file`: a folder is an error.
  - `result_is_named_after_the_spec`: `dhl.yaml` gives `<output>/dhl.http`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Read into `serde_norway::Value`, whose maps keep the file's order: through `serde_json::from_str` when the first non-blank character is `{`, otherwise `serde_norway::from_str`. Accept only `openapi: 3.*`. Follow `$ref` only when it starts with `#/`, at most 32 steps. Operations are `get`, `put`, `post`, `delete`, `options`, `head` and `patch` under each path. The media type is the first one the request body lists. A string example is the body as it stands; a structured one is written only for a media type that is JSON, by calling `serde_json::to_string_pretty` on the `serde_norway::Value` itself. Never go through `serde_json::to_value`, which sorts the keys. Each block is `### <METHOD> <path>`, comments, `# @name <name>`, `<METHOD> {{baseUrl}}<path>`, then `Content-Type` and the body when there is one. The first line of the file names the spec, and `@baseUrl` follows it. Collapse every comment's text to one line. Check `base_url` with `url::Url::parse`. Write with `OpenOptions::create_new`, after `create_dir_all(output)`.
- [ ] **Step 4: Run** `cargo test --locked -p http-runner generate`: passes.
- [ ] **Step 5: Commit** the listed files.

### Task 8: The MCP server

**Does:** Exposes `run` and `generate` as MCP tools, and proves the tool layer through the binary.
**Depends on:** Task 6, Task 7
**Adds:** `tools::Server`; debug-only environment variables `HTTP_RUNNER_OPEN` and `HTTP_RUNNER_DEADLINE_MS`
**Size:** ~260

**Files:**

- Modify: `tools/http-runner/src/main.rs`
- Modify: `tools/http-runner/src/lib.rs`
- Create: `tools/http-runner/src/tools.rs`
- Modify: `tools/http-runner/tests/common/mod.rs`
- Create: `tools/http-runner/tests/mcp.rs`

**Interfaces:**

- Consumes: `run::*`, `generate::generate`, `login_page::{Pages, Open}`.
- Produces: `tools::Server::new() -> Result<Server, String>`. Tools `run { file, request, retype_login? }` and `generate { spec, output, base_url? }`, both taking absolute paths.

- [ ] **Step 1: Write the failing tests** in `tests/mcp.rs`, adding to `tests/common/mod.rs` a client that starts the binary over stdio as ado-mcp's does, with `HTTP_RUNNER_DIR` set to a temporary folder so no test touches a real login file. Do not repeat behaviour already covered in `tests/run.rs`.
  - `version_prints`; `tool_list_is_fixed_and_identical_after_calls`.
  - `run_through_the_tool`: `HTTP_RUNNER_OPEN=<fake-browser>`, the test fills the page from another thread while `run` waits, and the real reply comes back masked.
  - `page_address_never_in_a_result` (done-check 6), across the success, still-open and no-browser paths.
  - `secrets_and_address_absent_from_stderr`: the typed value, the token and the address the fake browser received are absent from the binary's stderr.
  - `failures_are_results_not_protocol_errors`: a parse error and a relative path each come back as tool text.
  - `generate_writes_a_file_run_can_parse`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement `tools.rs`** on the pattern of `tools/ado-mcp/src/tools.rs`, with `Server` instructions in two sentences and no `requiresUserInteraction` on either tool, because the user's only step is the login page. `generate`'s result gives the path and says how many requests have a body. `Server::new` builds `Pages` with `Open::System` and a five-minute lifetime. Debug builds read `HTTP_RUNNER_OPEN` as `Open::Program`, and `HTTP_RUNNER_DEADLINE_MS` as `Ctx.deadline`.
- [ ] **Step 4: Finish `main.rs`.** `--version`, then the ring provider, then `Server::new()?.serve(stdio())`.
- [ ] **Step 5: Run the checks.** `cargo test --locked -p http-runner`, `cargo clippy --locked -p http-runner --all-targets -- -D warnings`, `cargo fmt --all -- --check`, and the `Cargo.lock` reqwest check: tests and lints pass, and it prints 1.
- [ ] **Step 6: Commit** the listed files.

### Task 9: Plugin, skill, installer and docs

**Does:** Ships the server as an opt-in plugin for Claude Code and Codex.
**Depends on:** Task 8
**Adds:** plugin `http-runner`; skill `http-runner`; `HTTP_RUNNER` installer constant
**Size:** ~180

**Files:**

- Create: `plugins/opt-in/mcp/http-runner/plugin.json`
- Create: `plugins/opt-in/mcp/http-runner/skills/http-runner/SKILL.md`
- Modify: `plugins/catalog.json`
- Modify: `tools/installer/assets/tools.json`
- Modify: `tools/installer/steps/binaries.ts`
- Modify: `tools/installer/install.ts`
- Modify: `tools/installer/core/options.ts`
- Modify: `tools/installer/core/codex.ts`
- Modify: `tools/installer/steps/codex.ts`
- Modify: `tools/installer/core/catalog.test.ts`
- Modify: `tools/installer/core/plugins.test.ts`
- Modify: `tools/installer/steps/codex.test.ts`
- Modify: `tools/harness-compiler/src/templates/codex.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `flake.nix`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GLOSSARY.md`

**Interfaces:**

- Consumes: the `http-runner` binary and its `--version`.

- [ ] **Step 1: Update the tests first.** `catalog.test.ts`: 16 → 17, 15 → 16, and `http-runner` in the Codex list in catalog order. `plugins.test.ts`: `http-runner` in the opt-ins. `codex.test.ts`: `http-runner` between `hallmark` and `mcp-azure`.
- [ ] **Step 2: Run them to see them fail.** `npm run build:harnesses`, then `node --test tools/installer/core/catalog.test.ts tools/installer/core/plugins.test.ts tools/installer/steps/codex.test.ts`.
- [ ] **Step 3: Add the plugin.** `plugin.json` copies web-mcp's shape: config `binPath` (default `http-runner`); `mcpServers.http` has `command: "${config.binPath}"` and no env. Catalog entry: `source` the folder, `resources: ["skills"]`, `dependencies: []`, both targets.
- [ ] **Step 4: Write the skill.** Under 60 lines, harness-neutral (`harness-compiler lint`). It tells the agent: both tools take absolute paths; `generate` for OpenAPI with the sandbox as `base_url`, otherwise write the XML from the WSDL; add the login; secrets only as `{{$dotenv NAME}}`; a request with no body needs one written from the schema; run and fix from the real error; keep chains to logins and copy other values into file variables; on a rejected login use `retype_login`; after a timeout, check what the result says was in flight before repeating; build DTOs and fixtures only from `http-replies/`, and read the saved reply when a result looks shortened; never ask for a password in chat.
- [ ] **Step 5: Wire the installer.** `assets/tools.json` gains `"http-runner": {"source":"release","plugin":"http-runner","key":"binPath"}`. `steps/binaries.ts`: `export const HTTP_RUNNER`. `install.ts`: `applyBin('http-runner', HTTP_RUNNER, process.platform, process.arch)`, behind the same selection guard the other integrations have. `core/options.ts` line 64: add to the Integrations page. `core/codex.ts` line 9: add to `MCP_COMPONENTS`. `steps/codex.ts`: add the name to the availability check, and an install block on the web-mcp pattern.
- [ ] **Step 6: Wire Codex's generated setup.** In `tools/harness-compiler/src/templates/codex.ts`, add `http-runner` to `INTEGRATIONS`, add `'http-runner': 'codex mcp add dead-agent-skills-http-runner -- http-runner'` to `commands`, and add setup text saying to put the release binary on PATH or use its absolute path. Do not add it to `MCP_SETTINGS`.
- [ ] **Step 7: Wire the release and Nix.** `release.yml`: the two comments and an `http-runner-*:` notes line. `flake.nix`: both pre-commit regexes, the `workspaceSource` list and an `http-runner` package on the web-mcp pattern, with `--bin http-runner`, `checkType = "debug"` for the test hooks and `nativeCheckInputs = [pkgs.cacert]`.
- [ ] **Step 8: Update the docs.** `README.md` (options and integrations lists), `AGENTS.md` (three Rust packages, three local package entries, a `tools/http-runner/` and plugin bullet naming its test-only hooks), `GLOSSARY.md` (the `## http-runner` section from the main checkout).
- [ ] **Step 9: Run the checks.** `npm test` and `npm run typecheck` pass. `cargo build --locked -p http-runner` and `python3 scripts/check_cargo_workspace.py` pass. The skill scan passes: `npm run scan-skills`, or the scanner at its pinned version through `uvx` where `pipx` is missing.
- [ ] **Step 10: Commit** the listed files.

### Task 10: The live checks

**Does:** Proves it on the real DHL sandbox and measures whether an agent manages alone.
**Depends on:** Task 9
**Adds:** `docs/features/carrier-api-integration/agent-check.mjs`, not shipped
**Size:** ~90

**Files:**

- Create: `docs/features/carrier-api-integration/agent-check.mjs`

**Interfaces:**

- Consumes: the built plugin and binary. **Needs the user:** the DHL sandbox API key and the login typed once on the page.

- [ ] **Step 1: Load what the branch built.** The plugin is not released yet, so run `cargo build --release --locked -p http-runner` and `npm run build:harnesses`, put the worktree's `target/release` first on PATH (the default `binPath` is `http-runner`), and start each Claude agent with `--plugin-dir <worktree>/.claude-plugin/http-runner`. After a release, the installer replaces this step.
- [ ] **Step 2: Done-check 8.** Take DHL's OpenAPI file from the user, or take `parcel-de-shipping-v2_2_0.yaml` from the third-party repository `kruegge82/dhl-php-rest-sdk`, into a new empty folder. Through the tool, `generate` writes a file `parse` reads. Its `createOrders` body equals `components.examples.DHLPaket.value`. A second `generate` is refused.
- [ ] **Step 3: Done-check 1, live.** Stop and ask the user to be ready to type the login. From DHL's OpenAPI file, an agent generates a file, edits it and creates a sandbox shipment order. Expected: a 2xx reply and a file in `http-replies/`.
- [ ] **Step 4: Write `agent-check.mjs`.** It starts one headless agent in a fresh temporary project, given only the OpenAPI file and the prompt "Create a sandbox shipment with this API and write a test fixture for the reply." It passes when `http-replies/` holds a 2xx reply and a fixture outside `http-replies/` contains a value from that reply which the OpenAPI file does not contain. It starts `claude -p` with `--plugin-dir` as in Step 1 and `--allowedTools` listing `Read`, `Write`, `Edit` and the two MCP tools, expected to be `mcp__plugin_http-runner_http__run` and `mcp__plugin_http-runner_http__generate`. Confirm those names with one unscored run first, and record the exact command in flow.md.
- [ ] **Step 5: Done-check 3.** Run it five times on `claude-sonnet-5-5`. The pass mark is four of the five. Record every run in flow.md. The Codex run comes after the release, through the installer, when `codex` is on PATH; it is outside the pass mark, and flow.md says "not run" until then.
- [ ] **Step 6: Done-check 7.** Ask the user to open one agent-written file in VS Code REST Client and confirm it runs. Record the answer in flow.md.
- [ ] **Step 7: Commit** `agent-check.mjs`.
