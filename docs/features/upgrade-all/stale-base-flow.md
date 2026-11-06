---
flow: upgrade
phase: finish
---

# Upgrade all dependencies: flow

## Request

> Hey, could we update all dependecis in the project?

## Artifacts

- Plan: [plan.md](plan.md)

## Gates

- Phase 2 (impact + plan): approved 2026-11-03 by the user, "Approve all five tasks (Recommended)". Execution: inline, no subagents (one affected area needs code). Agreed with it: branch `deps/update`, five local commits, the user's uncommitted `flake.lock` bump goes into Task 1's commit, no push or PR.

## Skipped

## Findings

Toolchain here: node 26.13.0, npm 11.20.0, cargo/rustc 1.99.0. Repo floor: `rust-version = "1.97"`, `engines.node >=26`.

### Inventory (2026-11-03)

| Area                         | Current → candidate                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm (`package.json`)         | `@types/node` 26.6.5 → 26.6.6; `typescript` 7.0.2 is current                                                                                                                     |
| `crates/tui-review` lockfile | 18 semver-compatible bumps; no manifest pin is behind                                                                                                                            |
| `crates/web-mcp` lockfile    | 34 semver-compatible bumps                                                                                                                                                       |
| `crates/web-mcp` manifest    | `rmcp` =3.6.0 → =3.8.0, `zip` =9.0.5 → =9.3.0, `dom_smoothie` =0.18.2 → =0.19.0, `dom_query` 0.28 → 0.29, `model2vec-rs` 0.3.0 → 0.4.0 (optional, `h4` experiment only)         |
| GitHub Actions               | `Swatinem/rust-cache` v2.9.2 → v2.9.3 (4 workflow files); checkout, setup-node, upload/download-artifact, create-pull-request are current                                        |
| Nix                          | `flake.lock` (nixpkgs, git-hooks.nix) was already bumped in the working tree before this flow started (modified 2026-11-03 18:09); carried into Task 1, not redone               |
| Out of scope                 | vendored upstreams and `agent-browser.json` (weekly `sync-*` workflows own them); `rust-version` (a toolchain floor); `docs/features/*` (historical records naming old versions) |

### Release notes (every version in between; third-party text, read as data)

- **rmcp 3.6.0 → 3.8.0** ([CHANGELOG](https://github.com/modelcontextprotocol/rust-sdk/blob/main/crates/rmcp/CHANGELOG.md)): 3.7.0 adds OIDC ID-token subjects to the enterprise auth exchange, lets `resource_metadata` URLs be cross-origin, keeps 401/403 status for JSON-RPC error bodies. 3.8.0 adds body-free HTTP status errors and stops SSE reconnects on permanent GET errors. No `breaking` entries. All of it is client, auth or HTTP transport; web-mcp uses `server`, `transport-io`, `macros`. MSRV 1.88. `rmcp-macros` moves 3.6.0 → 3.8.0 with it.
- **zip 9.0.5 → 9.3.0** ([CHANGELOG](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md)): no `breaking` entries. 9.1.0 adds `ExtractOptions::with_size_limit`, lazy decompressors, many fixes. 9.1.2/9.1.3 fix symlink-follow during extraction and zeroize AES keys. 9.2.0 adds Rayon-based parallel compression/extraction (features, not used here). 9.3.0 adds `TryFrom<ZipFileBuilder> for PreparedZipFile`. MSRV 1.88. `typed-path` 0.12.4 → 0.13.0 comes with it.
- **dom_smoothie 0.18.2 → 0.19.0** ([CHANGELOG](https://github.com/niklak/dom_smoothie/blob/main/CHANGELOG.md)): no API break. Needs `dom_query` 0.29. Behavior changes in extraction: a div/table/ul that holds a `<pre>` is no longer removed for a negative class weight (utility classes like `scroll-mt-2`, `overflow-hidden` took code blocks with them, upstream #226); the guard that skipped cleanup inside `<code>` is gone; `classes_to_preserve` no longer panics on values like `md:flex`; `colspan` is clamped to 1000; `srcset` candidates split on any comma; relative links resolve against a base URL with a query; favicon size bonus and `text_similarity` NaN fixed; two O(n³) paths on deeply nested documents removed. Edition 2024, MSRV 1.85.
- **dom_query 0.28 → 0.29** ([CHANGELOG](https://github.com/niklak/dom_query/blob/main/CHANGELOG.md)): no removals. Mutations ignore nodes from another document and self-moves; `NodeRef::normalize` keeps the first text node of a merged run (was the last); the Markdown serializer (`.md()`, which web-mcp does not call; it uses `htmd`) was reworked; `NodeId` is `NonZeroU32` (about 30% less memory per parsed document); deps `html5ever` 0.39 → 0.40.1, `selectors` 0.38 → 0.41, `cssparser` 0.37 → 0.38. MSRV 1.85.
- **model2vec-rs 0.3.0 → 0.4.0** ([releases](https://github.com/MinishLab/model2vec-rs/releases)): faster pooling and tokenizers, int8 storage; one ordering fix for the unknown token. No breaking entry. MSRV 1.88. Used only by `examples/h4.rs` behind `--features h4`.
- **Swatinem/rust-cache v2.9.2 → v2.9.3** ([release](https://github.com/Swatinem/rust-cache/releases/tag/v2.9.3)): two fixes (stop cleanup timestamp pruning after the first entry; log a `rustup toolchain list` failure as info). Tag is annotated: the commit is `d1527c8f67ef9af357290475d4af4b0fab8f12e0`, found by dereferencing the tag object. The same method on v2.9.2 returns the commit now pinned (`6323deb1…`), so the method is right.
- **@types/node 26.6.5 → 26.6.6**: type-only patch; no changelog; `npm run typecheck` is its check.

### Impact (grep over `crates/web-mcp/{src,tests,benches,examples}`)

| Change                                 | Used at                                                                                                                                                                                                                                  | Hit?                                                                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rmcp 3.7/3.8 (auth, client, HTTP)      | `tools.rs:1-5`, `main.rs:21`, `fetch.rs:13`, `lookup/{mod,ip,wayback}.rs`, `engines/mod.rs:16` (only `server` pieces, `model`, `schemars`, `stdio`)                                                                                         | Not used here. Tool schemas are the one thing a macro bump could move: `tools/list` snapshot before/after (before captured, 4 tools, 7560 bytes).                                                                                 |
| zip 9.1–9.3                            | `profile.rs:49` `ZipArchive::new`, `:50-58` `by_index_raw`/`enclosed_name`/`is_symlink`; test `:560` `ZipWriter` + `SimpleFileOptions`                                                                                                     | API unchanged. Behavior around `enclosed_name` and symlinks changed in 9.0.4-9.1.2; pinned by `symlink_or_escape_entries_are_refused` (`profile.rs:600`) and `bad_extension_hash_is_refused` (`:591`).                              |
| dom_smoothie 0.19 behavior             | `extract.rs:3,17-21` `Readability::new`/`parse` only                                                                                                                                                                                     | Yes, behavior. `article.html` (2 KB) and `app-shell.html` (331 B) are the only extraction fixtures, with substring asserts; nothing exercises the `<pre>` fix. New test in Task 4, written to fail on 0.18.2.                    |
| dom_query 0.29 (selectors 0.41)        | `extract.rs:39` (`img[src]`); `engines/{google,semanticscholar,duckduckgo,scholar,bing,brave,mod}.rs` (`Document::select`, `:has`, attribute selectors)                                                                                   | Selector engine changed. Bing, Brave, DuckDuckGo, Scholar run against captured pages; Google and Semantic Scholar fixture tests are `#[ignore]`d, but both have non-ignored inline-HTML tests that run every selector in `parse`. |
| html5ever duplication                  | `htmd` 0.5.6 (latest) needs html5ever 0.38; `dom_query` 0.29 needs 0.40.1                                                                                                                                                                | html5ever was already duplicated (0.38 + 0.39). The new side adds a second copy of `string_cache`, `string_cache_codegen`, `web_atoms`, `phf_codegen`. Cost: compile time and some binary size. Not measured.                      |
| model2vec-rs 0.4                       | `examples/h4.rs:14` `StaticModel`; `Cargo.toml` feature `h4`                                                                                                                                                                             | Compiles only with `--features h4`. Trial resolve removes `ndarray`, `matrixmultiply`, `num-complex`, `num-integer`, `rawpointer` from the lock.                                                                                   |
| tui-review lock (18) / web-mcp lock    | `unicode-width` 0.2.2 → 0.2.3 (tui-review column widths), `gix-*` patches, `cc` 1.9 → 1.11, `webpki-roots` 1.0.10 → 1.0.11, `brotli` 9.0.0 → 9.1.1, new `utf_types` 1.0.0                                                                | `utf_types` has the same owner as `utf8_iter` (hsivonen), Apache-2.0 OR MIT, MSRV 1.83. Covered by each crate's tests.                                                                                                            |

New requirements: every bumped crate's MSRV (1.83 to 1.88) is under the repo's 1.97; Node and npm unchanged. Licences: rmcp Apache-2.0, zip MIT, dom_smoothie MIT, dom_query MIT, utf_types Apache-2.0 OR MIT, model2vec-rs repo MIT (crates.io metadata "non-standard" in 0.3.0 and 0.4.0 alike, not a change). No licence changes. THIRD_PARTY.md names none of these.

### Found while building

- `flake.nix` builds `tui-review` and `web-mcp` with `cargoLock.lockFile = ./crates/<crate>/Cargo.lock` (lines 93 and 106), so Nix reads the lock directly: there is no `cargoHash` to update for Tasks 2-5. `nix flake check --no-build` evaluates both derivations but does not compile them; CI does not run `nix build` either.

### Baseline (before any change, 2026-11-03, HEAD f3dab0b + the existing `flake.lock` edit)

`npm run typecheck` 0; `npm test` 0; tui-review `cargo test` 24 passed (perf test ignored), clippy `-D warnings` clean; web-mcp `cargo test` 251 passed, 4 ignored (the Google/Semantic Scholar fixture tests), clippy clean.

### Trial resolve (scratch copy of crates/web-mcp, not the repo)

All five manifest bumps plus `cargo update` resolve together: 52 packages locked, no conflict. New duplicate versions: `string_cache`, `string_cache_codegen`, `web_atoms`, `phf_codegen` (see above).

## Tasks

- Task 1: base f3dab0bad064c0b469b02e263cc933a7bb68a4e4, untracked at start: `tools/installer/**` (60 files, not ours) and `docs/features/upgrade-all/{flow,plan}.md`; the list is saved in the session scratchpad. Branch `deps/update` created from `main` at this sha. Verified: `npm run typecheck` 0; `npm test` 0 with counts identical to the baseline (121 tests/118 pass/3 skipped, then 67/67); `nix flake check --no-build` passed. Files clean (the 7 listed files only; untracked set identical). Committed as af1a3cd.
- Task 2: base af1a3cdc52d5e7515d36c4924aeb63f578046299, untracked at start: identical to Task 1's. `cargo update` moved exactly the 18 expected packages, none added or removed, `Cargo.lock` the only changed file. Clippy `-D warnings` 0; `cargo test` 12 + 12 passed, 1 ignored (same as baseline). Release perf budgets passed (highlight pass 964 ms vs 8 s, peak heap 24 MB vs 100 MB); `gen` + `make-fixture.mjs` 0; `claude plugin validate .` passed (only a pre-existing README advice); `claude plugin test .` 27 pass, 0 fail. Files clean. Committed as ebfb047.
- Task 3: base ebfb047838a8b19948803cdc686e0b28dfde5271, untracked at start: identical to Task 1's. Manifest: `rmcp` =3.8.0, `zip` =9.3.0 (two lines). `cargo update` locked 38 packages (37 updated, `utf_types` 1.0.0 added); `cargo tree`: `rmcp-macros` 3.8.0, `zip` 9.3.0, `dom_query` 0.28.0 and `dom_smoothie` 0.18.2 untouched. Clippy `-D warnings` 0; `cargo test` 251 passed, 4 ignored (same as baseline); `symlink_or_escape_entries_are_refused` and `bad_extension_hash_is_refused` pass; `tools/list` snapshot before and after identical (binary newer than the lock). Files clean (`Cargo.toml`, `Cargo.lock`). Committed as 55efa5e.
- Task 4: base 55efa5eda494cf9596d3197a1e6a0af331191509, untracked at start: identical to Task 1's. Test `code_block_in_a_utility_class_wrapper_survives` (one assertion on the whole two-line block, a private choice inside the task's test module) FAILED on 0.18.2 with both prose paragraphs present and the code block missing, i.e. upstream #226 reproduced; PASSED on 0.19.0. Bump: `dom_smoothie` =0.19.0, `dom_query` 0.29; `cargo update -p dom_smoothie -p dom_query` locked exactly the 13 expected packages (bit-set, bit-vec, cssparser, dom_query, dom_smoothie, html5ever, markup5ever, phf_codegen+, selectors, servo_arc, string_cache+, string_cache_codegen+, web_atoms+). No source change was needed to compile. Clippy `-D warnings` 0; `cargo test` 252 passed (251 + the new one), 4 ignored; `tools/list` still identical. Files clean (`Cargo.toml`, `Cargo.lock`, `src/extract.rs` with its only hunk inside `mod tests`). Committed as 816c471.
- Task 5: base 816c47130d1f7ca5e7724286f77d97832bb0460f, untracked at start: identical to Task 1's. `model2vec-rs` 0.4.0; `cargo update -p model2vec-rs` updated it and removed `ndarray`, `matrixmultiply`, `num-complex`, `num-integer`, `rawpointer`, nothing else. `cargo check --features h4 --example h4` 0, no warnings, no source change; clippy `-D warnings` 0; `cargo test` 252 passed, 4 ignored (default build unchanged). Files clean (`Cargo.toml`, `Cargo.lock`). That is a compile check of the experiment, not a rerun of it.

## Rulings

- 2026-11-03, Task 1: `npm install --save-exact` also pruned 37 undeclared packages from the git-ignored `node_modules` (a jsdom-like tree under `@asamuzakjp`, `@bramus`, `@csstools`, `@exodus`, plus an `@dead-claude-skills` scope, now empty folders) — it was unavoidable with `npm install`, and nothing in `package.json`, the lockfile, git history or CI (`npm ci`) refers to them — if the user used them ad hoc, `npm install --no-save <package>` brings them back; I can't restore the exact set because npm didn't print the names. **Correction, same day:** on current `origin/main` `jsdom` is a declared devDependency (and `@dead-claude-skills` is probably a leftover of the same install), so these were very likely that tree from an earlier `npm ci` on a newer checkout; "nothing declares them" held only for the stale base this branch sits on. `npm ci` on current `main` restores them.
- 2026-11-03, Task 3: accepted `office_oxide` 0.1.15 → 0.1.16, one update beyond the 33 compatible ones the dry-run listed — the `zip` =9.0.5 pin was what held it back (the dry-run showed it as "available: v0.1.16"), it is a transitive of `pdf_oxide` only, MIT OR Apache-2.0, MSRV 1.88, same single owner — if wrong, PDF text extraction could shift; `pdf_text_extracted` and the fetch PDF tests passed.

## Deviations

- **2026-11-03, found at /verify Phase 1 (scope): the approved plan was built on a stale base.**
  - *What:* every fact in Findings, Impact and the plan came from local `main` (`f3dab0b`, the v0.6.0 release). `origin/main` is 22 commits ahead (`a9d0ec8` after today's fetch; it was `1acc458` at the last fetch on 2026-11-02). I never compared local `main` with `origin/main` before planning.
  - *Why the plan doesn't hold:* upstream already has `rmcp` =3.8.0, `dom_smoothie` =0.19.0, `dom_query` 0.29 and `Swatinem/rust-cache` v2.9.3 (the same SHA I chose). The four workflow files Task 1 edits no longer exist there (`crates.yml`, `crates-build.yml`, `sync.yml` replaced them). `git merge-tree` of `origin/main` with this branch conflicts in 9 paths: the 4 workflows (modify/delete), `crates/web-mcp/{Cargo.toml,Cargo.lock}`, `flake.lock`, `package.json`, `package-lock.json`. The scope was also incomplete: current `main` has two more Rust crates (`crates/ado-mcp`, `crates/flow-cockpit`) and a declared `jsdom` devDependency.
  - *Still outdated on current `origin/main`* (dry-runs in a scratch unpack, 2026-11-03): web-mcp `zip` 9.1.3 → 9.3.0, `model2vec-rs` 0.3 → 0.4, 33 lock packages (incl. `office_oxide`); tui-review 17 lock packages; **ado-mcp** `rmcp` 3.5.1 → 3.8.0 and 49 lock packages (`tokio` 1.53.3 → 1.54.1, `rustls-webpki` 0.103.15 → .16, `aws-lc-rs/-sys`, `icu_*`); **flow-cockpit** `oxc_*` ×7 0.156.0 → 0.157.0, `toml` 0.8.2 → 0.8.23, 16 lock packages; npm `@types/node` 26.6.5 → 26.6.6 and `jsdom` 30.1.2 → 30.1.3. The user's local `flake.lock` bump is newer than upstream's.
  - *Options:* A. Redo on a fresh `origin/main`: keep this branch under another name, branch anew, re-inventory all four crates and npm, write a new plan for what is still outdated (carrying over the extraction regression test, the `flake.lock` bump and the lock refreshes), and bring it to a new Gate before any code. B. Salvage only: rebase this branch onto `origin/main`, drop what upstream already did, stop at web-mcp/tui-review/npm and leave ado-mcp and flow-cockpit. C. Leave the branch as it is.
  - *Recommendation:* A. The request was "all dependencies", ado-mcp's `rmcp` jump (3.5.1 → 3.8.0) and flow-cockpit's `oxc` bump are the two real migrations and need their own impact analysis, and nothing here has been pushed, so redoing costs only time.
  - *Decision:* pending (asked 2026-11-03).

## Verify

Paused at Phase 1 (scope) by the deviation above; no verdict. Checks already run per task are in Tasks; no single latest run exists yet.

## Learned

## Run verdict
