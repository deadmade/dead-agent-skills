# Upgrade all dependencies, second pass: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every dependency this repo owns and Dependabot does not cover (npm devDependencies, the Nix inputs, the locks and pins of four Rust crates, two hand-vendored JS libraries) to its newest release, on top of current `origin/main`, with the suites `AGENTS.md` names green.

**Architecture:** Branch `deps/update` from `origin/main` (`a9d0ec8`), one commit per ecosystem so any can be dropped alone. No source code changes are planned: manifests, lockfiles, one lock file for Nix, and replaced vendored files with their notices.

**Tech Stack:** npm 11 / Node 26, Cargo 1.99 on a `rust-version = "1.97"` floor, Nix flake inputs, files copied from npm tarballs.

**Spec:** [flow.md](flow.md), sections **Request** and **Findings** (what Dependabot covers, the inventory, release notes, impact). The first pass, built on a stale base, is [stale-base-plan.md](stale-base-plan.md).

## Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

## Global Constraints

- Never bump a project version: every merge to `main` releases a patch on its own, and `check-repo` fails on drift.
- Lockfiles come from the package managers (`npm install`, `cargo update`), never by hand. Exact pins stay exact (`=`) in every manifest; `dom_query`-style ranges keep their style.
- `ado-mcp`: `reqwest` must stay the one `azure_core` uses; after the lock refresh `cargo tree -d -i reqwest` lists `reqwest v0.13.5` and no second version.
- Vendored JS (`crates/flow-cockpit/app/shell/vendor/`): a new version replaces the files whole, copied unchanged from the npm tarball, which must match the registry's `dist.integrity`; nothing is edited by hand, and `THIRD_PARTY.md` is updated with the real versions, tarball hashes and bundle contents.
- Downloaded tarballs are untrusted: each goes into its own new, empty directory under the session scratchpad and is extracted there; scripts live elsewhere and receive paths as arguments. "scratchpad" in this plan is `/tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/7cc7a523-b4b2-4058-9cfb-5335866847dc/scratchpad/` (it holds `mcp-snapshot.mjs`, `wm2-before.json`, the baseline logs and the stale-base trial copies).
- Not touched: `.github/workflows/*` (Dependabot's open PR #99 owns the Actions), `tools/installer/assets/*.json` pins and `plugins/**` vendored packs (weekly `sync.yml`), `uv.lock` and `headroom-ai` (Dependabot), `.claude-plugin/` and `.agents/plugins/` (generated; `npm test` compares them with a fresh build), `rust-version`.
- Commit messages are one sentence with no co-author lines. Stage with `git add -u` plus new paths by name, never `git add -A`. `.web/`, `tools/installer/**/*.js` (gitignored build output) and `docs/features/upgrade-all/` stay unstaged. No push, no PR.
- A task whose lock diff names a package its step didn't expect, or whose fix would touch a file not listed under **Files**, stops and reports. If a task asks you to pass a new signal through types, schemas, pipelines, or similar layers, stop and look for a more direct path.
- Rust code, if a compiler error forces any: load rust-skills `rust-best-practices` first. None is expected.

## Review Focus

Failure modes the bumps imply that no existing test names, most likely first:

1. `rmcp` 3.8 changes what `ado-mcp` tells Claude: its `initialize` instructions, a tool's schema or description. Expected: identical. Task 5 diffs both against a snapshot taken before any change.
2. The `ado-mcp` lock refresh puts a second `reqwest` into the tree. Expected: one, 0.13.5. Task 5.
3. `oxc` 0.157 changes the JavaScript `strip.rs` emits for a view, so a default view stops loading. Expected: `strip.rs`'s 6 tests and `extensions/tests/views.test.ts` pass. Task 6.
4. `mermaid` 12.3.0 draws a diagram differently, or its bundle no longer matches what `THIRD_PARTY.md` says it carries. Expected: the bundle matches the registry hash and the notice; the drawing itself cannot be tested here (jsdom has no SVG layout, headless browsers are broken on this machine). Task 8, its own commit so it can be dropped alone.
5. The `flake.lock` bump breaks `nix develop` or one of the four `nix build`s. Expected: it evaluates. A full `nix build .#flow-cockpit` is a long run; Task 2 only evaluates, Task 6 builds the flow cockpit's crate inside `nix develop`.

---

### Task 1: npm devDependencies

**Files:**
- Modify: `package.json` (the `devDependencies` block), `package-lock.json`

**Interfaces:**
- Consumes: branch `deps/update` on `origin/main`, `node_modules` from `npm ci`.
- Produces: `@types/node` 26.6.6 and `jsdom` 30.1.3, both exact.

- [ ] **Step 1: Bump** with `npm install --save-exact @types/node@26.6.6 jsdom@30.1.3`. `git diff package.json` shows exactly those two lines; `git diff --stat` lists `package.json` and `package-lock.json`. In the lock, only `@types/node`, `jsdom` and packages `jsdom` itself depends on may move; any other package stops the task.
- [ ] **Step 2: Verify.** From the repo root: `npm run typecheck`, `npm test`, `node --test 'crates/flow-cockpit/app/shell/*.test.mjs' 'crates/flow-cockpit/extensions/tests/*.test.ts'`, `npx tsc -p crates/flow-cockpit/app/shell`, `npx tsc -p crates/flow-cockpit/extensions`. Expect exit 0 for each and the same test counts as the baseline in flow.md.
- [ ] **Step 3: Commit.** `git add -u`, then `git commit -m "Bump @types/node and jsdom."`

### Task 2: The Nix inputs

**Files:**
- Modify: `flake.lock`

**Interfaces:**
- Consumes: Task 1's commit.
- Produces: the user's own `flake.lock` bump of 2026-11-03 (nixpkgs 2026-11-01, git-hooks.nix 2026-11-03), taken from `deps/update-stale-base` commit `af1a3cd`. It is newer than `origin/main`'s (2026-10-30 and 2026-10-13), and the flake's inputs are the same three nodes (`flake-compat`, `git-hooks`, `nixpkgs`).

- [ ] **Step 1: Take the file** with `git checkout af1a3cd -- flake.lock`. `git diff --cached --stat` lists `flake.lock` alone, 12 changed lines.
- [ ] **Step 2: Verify.** `nix flake check --no-build` (exit 0: every derivation, `devShells` and `formatter` evaluate).
- [ ] **Step 3: Commit.** `git commit -m "Bump the Nix inputs."`

### Task 3: tui-review's locked dependencies

**Files:**
- Modify: `crates/tui-review/Cargo.lock`

**Interfaces:**
- Consumes: Task 2's commit.
- Produces: the lock with the 17 compatible bumps (`cc`, `crc32fast`, `encoding_rs`, `gix-config`, `gix-hashtable`, `gix-ignore`, `gix-imara-diff`, `gix-macros`, `gix-parallel`, `gix-sec`, `gix-utils`, `jiff`, `jiff-core`, `jiff-static`, `log`, `rustix`, `smallvec`). `Cargo.toml` does not change.

- [ ] **Step 1: `cargo update`** in `crates/tui-review`. The packages it reports are exactly those 17; nothing added or removed; `git diff --stat` lists `Cargo.lock` only.
- [ ] **Step 2: Verify as `crates.yml` does** (in `crates/tui-review`): `cargo clippy --all-targets -- -D warnings`; `cargo test`; `cargo test --release --test perf -- --ignored --nocapture` (budgets pass). Then the mod tests: `cargo run --release -- gen --out <scratchpad>/tui-review-fixture`, `node ../../plugins/shared/tui-review/tests/make-fixture.mjs <scratchpad>/tui-review-fixture`, then in `plugins/shared/tui-review`: `claude plugin validate .` and `claude plugin test .`. All exit 0; test counts equal the baseline.
- [ ] **Step 3: Commit.** `git add -u`, then `git commit -m "Refresh tui-review's locked dependencies."`

### Task 4: web-mcp: zip, model2vec-rs and the lock

**Files:**
- Modify: `crates/web-mcp/Cargo.toml` (the `zip` and `model2vec-rs` lines), `crates/web-mcp/Cargo.lock`

**Interfaces:**
- Consumes: Task 3's commit; the snapshot `scratchpad/wm2-before.json` (taken 2026-11-03 from the unmodified debug binary: `initialize` and four tools, no instructions).
- Produces: `zip` =9.3.0, `model2vec-rs` 0.4.0, and 35 locked packages moved. New crate `utf_types` 1.0.0; removed `matrixmultiply`, `ndarray`, `num-complex`, `num-integer`, `rawpointer`.

- [ ] **Step 1: Edit `Cargo.toml`:** `zip = { version = "=9.3.0", … }` and `model2vec-rs = { version = "0.4.0", optional = true }`, features unchanged. `cargo update`. The lock diff names the 35 packages from the trial (flow.md **Inventory**: the 33 compatible ones, `zip`, `model2vec-rs`), adds `utf_types`, removes the five.
- [ ] **Step 2: Verify** (in `crates/web-mcp`): `cargo build --bins` (the fake agent-browser is a `[[bin]]`), then `cargo clippy --all-targets -- -D warnings`, `cargo test`, and `cargo check --features h4 --example h4`. All exit 0; test counts equal the baseline. `cargo test --bin web-mcp -- symlink_or_escape_entries_are_refused bad_extension_hash_is_refused` passes (the zip safety tests).
- [ ] **Step 3: Diff the tool list.** `node scratchpad/mcp-snapshot.mjs crates/web-mcp/target/debug/web-mcp CLAUDE_PROJECT_DIR=<empty scratchpad dir>` into `wm2-after.json`; `diff` it with `wm2-before.json`. Expected: no output (and the binary is newer than `Cargo.lock`).
- [ ] **Step 4: Commit.** `git add -u`, then `git commit -m "Bump zip and model2vec-rs and refresh web-mcp's locked dependencies."`

### Task 5: ado-mcp: rmcp and the lock

**Files:**
- Modify: `crates/ado-mcp/Cargo.toml` (the `rmcp` line), `crates/ado-mcp/Cargo.lock`

**Interfaces:**
- Consumes: Task 4's commit. Before editing, a snapshot `scratchpad/ado-before.json` taken with `node scratchpad/mcp-snapshot.mjs crates/ado-mcp/target/debug/ado-mcp ADO_ORG_URL=http://127.0.0.1:9 ADO_PAT=x ADO_PROJECT_DIR=<empty scratchpad dir>` from the unmodified binary (it holds `initialize` with the instructions text, and every tool's schema).
- Produces: `rmcp` =3.8.0 with `rmcp-macros` 3.8.0, and 50 locked packages moved, among them `tokio` 1.54.1, `rustls-webpki` 0.103.16, `aws-lc-rs` 1.19.0, `aws-lc-sys` 0.47.0. New crates: `ar_archive_writer`, `object`, `pest_stack_guard`, `utf_types`; none removed.

- [ ] **Step 1: Edit `Cargo.toml`:** `rmcp = { version = "=3.8.0", features = ["server", "transport-io", "macros"] }`. `cargo update`. The lock names 50 packages and adds exactly the four crates above. `cargo tree -d -i reqwest` lists `reqwest v0.13.5` and no second version.
- [ ] **Step 2: Verify** (in `crates/ado-mcp`): `cargo clippy --all-targets -- -D warnings` and `cargo test` (exit 0; counts equal the baseline). `aws-lc-sys` 0.47 compiles C here: a build failure is a finding, not a skip.
- [ ] **Step 3: Diff the snapshots.** Run the same script against the rebuilt binary into `ado-after.json`; `diff ado-before.json ado-after.json`. Expected: no output.
- [ ] **Step 4: Commit.** `git add -u`, then `git commit -m "Bump rmcp and refresh ado-mcp's locked dependencies."`

### Task 6: flow-cockpit: oxc and the lock

**Files:**
- Modify: `crates/flow-cockpit/app/Cargo.toml` (the seven `oxc_*` lines), `crates/flow-cockpit/Cargo.lock`

**Interfaces:**
- Consumes: Task 5's commit.
- Produces: `oxc_allocator`, `oxc_ast`, `oxc_codegen`, `oxc_parser`, `oxc_semantic`, `oxc_span`, `oxc_transformer`, all =0.157.0; 35 locked packages moved: 18 `oxc_*` crates (those seven plus `oxc_ast_macros`, `oxc_ast_visit`, `oxc_compat`, `oxc_data_structures`, `oxc_diagnostics`, `oxc_ecmascript`, `oxc_estree`, `oxc_regular_expression`, `oxc_str`, `oxc_syntax`, `oxc_traverse`), the 16 compatible ones (`cc`, `crc32fast`, `hmac-sha1-compact`, `jiff`, `jiff-core`, `jiff-static`, `js-sys`, `log`, `utf8_iter`, `wasm-bindgen` and its four siblings, `web-sys`), plus `utf_types` and `zmij_ecma` added and `dragonbox_ecma` removed.

- [ ] **Step 1: Edit `crates/flow-cockpit/app/Cargo.toml`:** each `oxc_* = "=0.156.0"` becomes `"=0.157.0"`. `cargo update` in `crates/flow-cockpit`. The lock names exactly the set above.
- [ ] **Step 2: Verify inside the dev shell** (the app links GTK and WebKit): `nix develop -c bash -c 'cd crates/flow-cockpit && cargo test && cargo clippy --workspace --all-targets -- -D warnings'`. Expect exit 0 and the same counts as the baseline of `flow-cockpit-core`, plus the app's tests: `strip.rs`'s 6 and `bindings_are_current` among them. If `nix develop` cannot realize the shell here, stop and report; do not skip.
- [ ] **Step 3: Commit.** `git add -u`, then `git commit -m "Bump oxc and refresh the flow cockpit's locked dependencies."`

### Task 7: flow-cockpit's vendored marked

**Files:**
- Modify: `crates/flow-cockpit/app/shell/vendor/marked.esm.js`, `crates/flow-cockpit/app/shell/vendor/marked.esm.d.ts`, `THIRD_PARTY.md` (the marked entry of the flow-cockpit section)
- Modify only if the new tarball's license text differs from what is vendored: `vendor/LICENSE-marked`

**Interfaces:**
- Consumes: Task 6's commit.
- Produces: `marked` 18.1.3 (`lib/marked.esm.js`, and `lib/marked.d.ts` as `marked.esm.d.ts`) from its own tarball, and a `THIRD_PARTY.md` that says so.

- [ ] **Step 1: Fetch.** In a new empty scratchpad directory: `npm pack marked@18.1.3 --json --pack-destination <dir>`. The `integrity` it prints equals `npm view marked@18.1.3 dist.integrity`. Extract the tarball into its own new directory.
- [ ] **Step 2: Replace** the two vendored files with the extracted ones, byte for byte. Diff the extracted `LICENSE.md` against `LICENSE-marked`; replace only if they differ. `git diff --stat` lists the two files (and the license only if it differed).
- [ ] **Step 3: Notice.** In `THIRD_PARTY.md` change marked's version to 18.1.3 and its tarball `sha512` to the registry's `dist.integrity`. Nothing else in that file changes.
- [ ] **Step 4: Verify.** The views tests and both `tsc -p` checks from Task 1, `npm test` (the repo checks read `THIRD_PARTY.md`), exit 0 and baseline counts. `git diff --stat` lists only the files above.
- [ ] **Step 5: Commit.** `git add -u`, then `git commit -m "Bump marked in the flow cockpit's vendored libraries."`

### Task 8: flow-cockpit's vendored mermaid

This is the one bump whose result cannot be tested here, so it is a commit of its own: dropping it later is one `git rebase --onto` or a revert, and nothing else depends on it.

**Files:**
- Modify: `crates/flow-cockpit/app/shell/vendor/mermaid.min.js`, `THIRD_PARTY.md` (the mermaid entry of the flow-cockpit section)
- Modify only if the new tarball's license text differs from what is vendored: `vendor/LICENSE-mermaid`

**Interfaces:**
- Consumes: Task 7's commit.
- Produces: `mermaid` 12.3.0 (`dist/mermaid.min.js`) from its own tarball, and a `THIRD_PARTY.md` that says so.

- [ ] **Step 1: Fetch.** In a new empty scratchpad directory: `npm pack mermaid@12.3.0 --json --pack-destination <dir>`. The `integrity` it prints equals `npm view mermaid@12.3.0 dist.integrity`. Extract the tarball into its own new directory.
- [ ] **Step 2: Replace** `mermaid.min.js` with the extracted file, byte for byte. Diff the extracted `LICENSE` against `LICENSE-mermaid`; replace only if they differ.
- [ ] **Step 3: Read the new bundle.** From `mermaid.min.js`'s license banners and mermaid 12.3.0's `package.json` `dependencies` (licenses as the registry gives them for the versions the ranges allow, as the current notice does), work out what the bundle carries now: DOMPurify's banner version (expected 3.4.17), whether `uuid` is gone, elkjs's version and license. Write these into `THIRD_PARTY.md`: mermaid 12.3.0, its tarball `sha512` (the `dist.integrity`) and the rewritten bundle sentence. Nothing else in that file changes.
- [ ] **Step 4: Verify.** The views tests and both `tsc -p` checks from Task 1, `npm test`, exit 0 and baseline counts. `git diff --stat` lists only the files above. The drawing itself is not verified here; the final report says so.
- [ ] **Step 5: Commit.** `git add -u`, then `git commit -m "Bump mermaid in the flow cockpit's vendored libraries."`

---

## Self-review

- **Coverage:** every row of flow.md's inventory has a task: npm in 1, Nix in 2, tui-review in 3, web-mcp in 4, ado-mcp in 5, flow-cockpit Rust in 6, vendored marked in 7, vendored mermaid in 8. Left out on purpose, with the owner named: Actions (Dependabot PR #99), `uv.lock` and `headroom-ai` (Dependabot, already current), installer and pack pins (`sync.yml`), and transitive pins nothing here controls.
- **Consistency:** lock package counts come from resolve-only trials in a scratch unpack of `origin/main` (50 for ado-mcp, 35 for flow-cockpit, 35 for web-mcp); tui-review's 17 and the npm pair from dry-runs. Commit order follows the task order, and each task consumes the previous commit.
- **No new tests:** nothing here relies on behavior a test doesn't already pin or a bump newly adds. The one behavior change the first pass cared about (`dom_smoothie` keeps `<pre>` in utility-class wrappers) already landed upstream; its regression test is still available as `816c471` on `deps/update-stale-base` if wanted.
- **Known costs, not tasks:** `mermaid` 12.3.0 is hours old and cannot be rendered here, so Task 8 proves the bytes and the notice, not the pictures. The flake bump is evaluated, not built.
