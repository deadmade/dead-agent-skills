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

## Checks

ado-mcp: `cargo test --locked -p ado-mcp` from the root. A test that times concurrency makes one fast call first and
bounds the slow one against it (`view_concurrent` in `tests/pr.rs`, `tests/wi.rs`): under the full parallel run on
Windows, process start and git subprocesses outweigh a fixed wall-clock bound.
