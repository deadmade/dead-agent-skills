---
flow: fix
phase: done
now: Done: pushed to the existing Dependabot PR for dependabot/cargo/cargo-814dff296c.
---

# Cargo group bump fails to compile: flow

## Request

can we fix the upgrade?

## Artifacts

- Branch `dependabot/cargo/cargo-814dff296c`, commit `5ea2d0c4` (Dependabot: dom_query 0.30, htmd 0.6.0,
  model2vec-rs 0.5, rmcp 3.11, url 2.5.9, zip 9.8.1).
- htmd 0.6.0 source: `~/.cargo/registry/src/index.crates.io-*/htmd-0.6.0/src/{lib.rs,input.rs}`.

## Gates

- Gate 1, cause approved: 2026-11-25
- Gate 2, review-code: report: 2026-11-25

## Skipped

- Nix package build (`crates.yml`, `nix build .#<pkg>`): no Nix on this Windows machine; `cargoLock.lockFile` reads Cargo.lock directly, so no hash to update (verified, flake.nix:116/134/152). Accepted by the user 2026-11-25; CI runs it.
- cargo-audit advisory scan: not a documented check in this repo. Accepted by the user 2026-11-25.

## Grounding

- Only one `htmd` call site in the workspace: `tools/web/web-mcp/src/extract.rs:29`,
  `htmd::convert(&article.content)` inside `extract_html` (verified, grep). `article.content` is a
  `tendril::Tendril<UTF8>` from dom_smoothie's `Readability::parse`.
- Last change there: `d3682be7` (browser-core split, #173), unrelated to htmd.
- Blast radius: `extract_html` is called by `fetch.rs:319` and `fetch.rs:326` (the `fetch` tool's HTML path) and by
  `benches/extract.rs`. Its markdown output is pinned by the unit tests at `extract.rs:88`, `:103`, `:116` against
  `tests/fixtures/article.html` and `app-shell.html`.
- Upstream: htmd 0.6.0 `lib.rs:36` changed `pub fn convert(html: &str)` to
  `pub fn convert<I: ConvertInput>(input: I)`; `input.rs` implements `ConvertInput` for `&str`, `String`, `Cow`, etc.,
  not for `&Tendril` (verified, source).

## Findings

Reproduction (measured, PowerShell with vcvars64):

    cargo build --workspace --all-targets --locked
    error[E0277]: the trait bound `&tendril::tendril::Tendril<tendril::fmt::UTF8>: ConvertInput` is not satisfied
      --> tools\web\web-mcp\src\extract.rs:29:33
    29 |         markdown: htmd::convert(&article.content)
    error: could not compile `web-mcp` (bin "web-mcp") due to 1 previous error
    error: could not compile `web-mcp` (bin "web-mcp" test) due to 1 previous error
    error: could not compile `web-mcp` (bench "extract") due to 1 previous error

The same error three times (bin, test, bench); no other crate failed.

**Cause** (verified): with 0.5.6's `&str` parameter, `&Tendril` deref-coerced to `&str`. 0.6.0's generic
`I: ConvertInput` bound gets no coercion, and `&Tendril` has no impl, so type inference fails.

**Evidence** (measured, edit since reverted): changing the call to `htmd::convert(&*article.content)` makes
`cargo test --workspace --locked` pass (all suites green, incl. the `extract.rs` markdown tests) and
`cargo clippy --workspace --all-targets --locked -- -D warnings` clean. So htmd 0.6's output still meets the existing
expectations, and the other five bumps need nothing.

Side note (measured, Cargo.lock): dom_query 0.29.0 (pulled by the `dom_smoothie = "=0.19.0"` pin) and 0.30.0 (ours)
now both build.

## Options

### Fix

Picked: A, deref at the call site (`&*article.content`); check: `cargo test -p web-mcp --locked`, compile failure before, green after.

- **A (recommended):** deref at the one call site, `htmd::convert(&*article.content)`, in
  `tools/web/web-mcp/src/extract.rs`. Touches only `extract_html`; its callers and output are unchanged. Check: the
  existing `cargo test -p web-mcp --locked` (fails to compile before, passes after) stands in for a new regression
  test, since `extract.rs:88`/`:103` already pin `extract_html`'s markdown output; a new test would duplicate them.
- **B:** pin `htmd = "=0.5.6"` back in the root `Cargo.toml` and ignore it in Dependabot. Avoids a code change but
  keeps us on the old htmd and needs a `dependabot.yml` ignore entry.

## Plan review

## Tasks

Task 1: base 5ea2d0c46bc277f1d183ce22e3506c8017c9808a, untracked at start: docs/features/cargo-bump-htmd-compile/flow.md; files clean (only tools/web/web-mcp/src/extract.rs changed).

Proof (fresh agent, scratch worktree at `git stash create` 09a4047b, measured 2026-11-25): with the fix `cargo test -p web-mcp --locked` exit 0, all suites ok (171+29+20+37+1+11+23+39 passed); with extract.rs restored to 5ea2d0c4, exit 101, `error[E0277]: ... Tendril<UTF8>: ConvertInput is not satisfied --> toolswebweb-mcpsrcextract.rs:29:33`, the only error. Worktree removed, main tree unchanged.

Author runs after the fix (measured, 2026-11-25, PowerShell with vcvars64): `cargo test -p web-mcp --locked` exit 0; `cargo test --workspace --locked` exit 0, no failing suite; `cargo clippy --workspace --all-targets --locked -- -D warnings` exit 0; `cargo fmt --all -- --check` exit 0. `npm test` not run (no node input changed). MSRV: `cargo +1.97 check --workspace --all-targets --locked` exit 0 (measured); `node scripts/cargo-workspace.mjs` exit 0.

## Rulings

2026-11-25, Task 1: fix built on the Dependabot branch itself, no worktree or new branch — the fix has to land on that PR to make the bump mergeable — if wrong, the commit moves to a new branch with a cherry-pick. confirmed

## Parking lot

- MCP servers (`tools/*/src/tools.rs`): rmcp 3.11 answers resources/list and prompts/list with -32601 on tools-only servers; revisit only if a host shows the error (review finding 2). Pick: drop.

- `Cargo.toml`: dom_query is built twice (0.29 via the `dom_smoothie =0.19.0` pin, 0.30 ours); a dom_smoothie release
  on dom_query 0.30 would drop one. Pick: follow-up.

## Deviations

## Walkthrough

| goal                                                            | plan task | file:line                           | test                                                                                                |
| --------------------------------------------------------------- | --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| htmd 0.6 `convert` no longer takes `&Tendril` (the fixed cause) | Task 1    | tools/web/web-mcp/src/extract.rs:29 | `cargo test -p web-mcp --locked` (compile), plus extract.rs tests at :88, :103, :116 for the output |

## Review

Verdict: ready. Audit: [docs/audits/2026-11-25-review-cargo-bump-htmd-compile.md](../../audits/2026-11-25-review-cargo-bump-htmd-compile.md). Two low worth-doing findings (dom_query built twice; rmcp 3.11 returns -32601 for resources/prompts list on tools-only servers); Picks: none, nothing fixed.

## Learned

- Memory `windows-cargo-msvc-env.md`: the PowerShell tool here has no cargo or MSVC env on PATH; load vcvars64 (with the VS Installer folder on PATH for vswhere) before cargo. Cost a wrong turn at reproduction.
- Dropped: a solutions note for the htmd `ConvertInput` error (fixed once; the next bump won't hit it).

## Run verdict

Worked as a whole: yes; clean: yes (the user, 2026-11-25).
