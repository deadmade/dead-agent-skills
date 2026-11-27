# mcp-azure and ado-mcp

`plugins/opt-in/mcp/mcp-azure/` and `tools/ado-mcp/`.

`plugins/opt-in/mcp/mcp-azure/`: `plugin.json` (`mcpServers` and `config`) for `ado-mcp` (Rust, `tools/ado-mcp/`), a
stdio MCP server for one Azure DevOps Server collection and PAT: `pr_*`, `wi_*`, `pipeline_*`, `repo_list` and
`project_list` (both in `pipeline.rs`; no default project: outside an Azure DevOps clone the model passes `project`, but
`search` without one searches the whole collection), `search` (`search.rs`), `repo_file` (`file.rs`) and `wiki`
(`wiki.rs`), built for Windows and Linux x64 only (`crates-build.yml`). The installer asks for its settings itself
(`SELF_CONFIGURED` in `core/config.ts`), downloads the binary and saves both, `binPath` included, in one
`claude plugin configure --values-stdin` call.

- Calls go through Microsoft's `azure_devops_rust_api` (`=0.39.1`, sending `api-version=7.1-preview`) on our own reqwest
  client via `.transport()`. Its features include `search`, `wiki` and `test`, never `test_results` (its default host is
  the Services-only `vstmr`). Pins are exact (`rmcp`, `reqwest`, `azure_core` too), and `reqwest` must stay the one
  azure_core uses (`Cargo.lock` holds one `reqwest` entry). The crate compiles in aws-lc-rs (C code). Its repo was
  archived on 2026-10-26, so no fix comes from upstream: a model the server's answer doesn't fit is read from the raw
  body into our own struct (`api::json`; `Batch` and `RawComments` in `wi.rs`, `Props` beside the crate model in
  `pr.rs`).
- The crate's enums are closed (D8 in `docs/features/ado-mcp/flow.md`): one value it doesn't know in a `search`, `wiki`
  or test answer fails that whole answer. Fixtures can't show it, so `docs/features/ado-mcp/smoke.md` checks live
  answers; the fix is the D1 fallback.
- Where the crate falls short a call is sent or read by hand (`pr_list status=all`, `pr_threads`, the work-item batch,
  work-item comments, build log text, `pipeline_cancel`, `/vsts/info`, `connectionData`, `repo_file`'s items GET); why
  each is in `docs/features/ado-mcp/flow.md` (D2, D3, D5, D7), for `/vsts/info` and `connectionData` in `api.rs` (the
  crate doesn't cover them), and for `repo_file` in `file.rs` (the crate puts `path` into the URL twice). `pr_update`
  has no draft flag and `pr_complete` sends no `lastMergeSourceCommit`, because the crate's model carries neither.
- The PAT goes only to `ADO_ORG_URL`: crate calls pass the `Guard` policy, hand-sent ones `Api::url`'s check (`api.rs`),
  and redirects aren't followed.
- Writes carry `anthropic/requiresUserInteraction` through `WRITES` in `tools.rs`; a new write tool goes there. A new
  read tool needs `annotations(read_only_hint = true)` and a `READS` entry in `tests/mcp.rs`, which also catches a
  mistyped `WRITES` name that `tools.rs` would skip silently.
- Tests run the binary over stdio against a fake server (`tests/common/mod.rs`) serving `tests/fixtures/`.
  `tests/fixtures.rs` maps each fixture to the crate model its route returns, so every fixture must fit that model;
  fixtures no crate model reads are listed apart, in `HAND_WRITTEN`. Fitting the model doesn't prove the server's shape:
  build fixtures from real answers or the Server docs' samples (the comments fixture carried a `url` the server leaves
  out of mentions, D7). The inline answers in `tests/api.rs` use a non-GUID project id (`p1`), unlike the files in
  `tests/fixtures/`, so a test that a reply prints no GUID needs a GUID-shaped id, or a leak passes unseen. Test-only
  hook: `ADO_TIMEOUT_MS` (debug builds) replaces the 60 s request timeout.
- The fixtures are doc-shaped until real answers replace them. `ADO_CAPTURE_DIR` (release builds too) makes the server
  write every 2xx answer's body, masked, into that folder as `<method>-<path, / as _>-<hash of the query>.<ext>`, at the
  two places every answer passes (`Guard::send` and `Api::exec` in `api.rs`, through `capture`); the caller still gets
  the unmasked answer. To capture: start Claude Code with `ADO_CAPTURE_DIR` set, run the reads of
  `docs/features/ado-mcp/smoke.md`, read every file, then replace the matching fixtures with them and keep
  `tests/fixtures.rs` and the tests green. A failed write prints one line on stderr (the file and the OS error, never a
  body); a body that isn't UTF-8 is not written, since it can't be masked. No header is written, so the PAT never is.
- Masking is two passes over each answer. The first collects identities (objects with `uniqueName`, a descriptor,
  `providerDisplayName` or `imageUrl`, or a `displayName` with a GUID `id` and no non-identity `url`; git authors;
  `Name <DOMAIN\user>` strings; any email), the collection from `ADO_ORG_URL`, and project and repository names from
  the request path and from `project`, `repository`, `visibility` and `remoteUrl` objects. The second replaces those
  values, and their percent-encoded forms, in string values and the file name, never in keys: whole words only, ASCII
  case ignored, longest first in one sweep. Names become `User <n>`, emails `user<n>@example.com`, identity ids
  `00000000-0000-0000-0000-<n>`, descriptors and SIDs `descriptor-<n>` (one identity keeps its `<n>` for the whole
  session), projects `Project<n>`, repos `Repo<n>`, the collection `Coll` and the configured host `dev.example`. Other
  GUIDs stay. Not masked: names that appear only in free text (titles, descriptions, comments, logs) before any answer
  in the session named them, team, wiki, pipeline and branch names, AD domains outside a unique name, and host names
  other than `ADO_ORG_URL`'s. That is why every file is read before it is committed.

## Checks

ado-mcp: `cargo test --locked -p ado-mcp` from the root. A test that times concurrency makes one fast call first and
bounds the slow one against it (`view_concurrent` in `tests/pr.rs`, `tests/wi.rs`): under the full parallel run on
Windows, process start and git subprocesses outweigh a fixed wall-clock bound.
