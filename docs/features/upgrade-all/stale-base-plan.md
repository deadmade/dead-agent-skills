# Upgrade all dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every dependency this repo owns (npm, both Rust crates, the Actions pin, the Nix inputs) to its newest release that resolves on Rust 1.97 and Node 26, with the existing suites green and the one deliberate behavior change pinned by a test.

**Architecture:** One branch, `deps/update`, one commit per ecosystem so any of them can be dropped on its own. The only code change is one new test in `crates/web-mcp/src/extract.rs`, written to fail on `dom_smoothie` 0.18.2 before the bump. Everything else is manifests, lockfiles and one action pin.

**Tech Stack:** npm 11 / Node 26, Cargo 1.99 on a `rust-version = "1.97"` floor, GitHub Actions, Nix flake inputs.

**Spec:** [flow.md](flow.md), sections **Request** and **Findings** (inventory, release notes, impact). There is no separate spec: the request is "update everything".

## Before you write

Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

## Global Constraints

- Lockfiles come from the package managers (`npm install`, `cargo update`), never by hand. Project version fields stay as they are: `scripts/release.mjs` owns every version bump.
- Exact pins stay exact: `rmcp`, `zip` and `dom_smoothie` keep their `=` in `crates/web-mcp/Cargo.toml`; `dom_query` and `model2vec-rs` keep their current range style.
- `rust-version = "1.97"`, edition 2024, and the clippy settings (`pedantic`, `-D warnings`) do not change.
- An Actions pin is the full commit SHA plus a `# vX.Y.Z` comment, as in every workflow today.
- Do not touch vendored paths (`plugins/flows/packs/`, `plugins/flows/agents/`, `plugins/opt-in/**/skills|library`, `THIRD_PARTY.md` content) or `docs/features/*` other than this folder.
- Commit messages are one sentence with no co-author lines. Stage with `git add -u` plus new paths by name, never `git add -A`. `.web/` (web-mcp's archive of fetched pages), `tools/` and `docs/features/upgrade-all/` stay unstaged. No push, no PR.
- A task whose lockfile diff names a package its step didn't expect, or whose fix would touch a file not listed under **Files**, stops and reports. If a task asks you to pass a new signal through types, schemas, pipelines, or similar layers, stop and look for a more direct path.
- Rust code in Task 4: load rust-skills `rust-best-practices` first.

## Review Focus

Failure modes the bumps imply that no existing test names, most likely first:

1. A `<pre>` code block inside a utility-class wrapper (`class="scroll-mt-2 overflow-hidden"`) vanishes from extracted markdown. Expected: the code is kept. Pinned by Task 4's new test.
2. The Consent-O-Matic archive contains a symlink entry or a `../` path. Expected: `unpack` refuses it. Pinned by the existing `symlink_or_escape_entries_are_refused` (`profile.rs:600`); Task 3 runs it by name.
3. `rmcp` 3.8 changes the schema or description of a tool Claude sees. Expected: `tools/list` identical. Task 3 diffs it against the snapshot taken before any change.
4. `unicode-width` 0.2.3 shifts a column in tui-review's rendering. Expected: the 24 crate tests, the release perf budgets and the mod tests all pass. Task 2.
5. `examples/h4.rs` stops compiling against `model2vec-rs` 0.4. Expected: `cargo check --features h4 --example h4` passes. Task 5.

---

### Task 1: npm, the rust-cache pin and the Nix inputs

**Files:**
- Modify: `package.json:29`, `package-lock.json`
- Modify: `.github/workflows/web-mcp.yml:31`, `.github/workflows/tui-review.yml:31`, `.github/workflows/build-web-mcp.yml:37`, `.github/workflows/build-tui-review.yml:37`
- Modify: `flake.lock` (already changed in the working tree before this plan; carried, not redone)

**Interfaces:**
- Consumes: nothing.
- Produces: branch `deps/update` and the first commit.

- [ ] **Step 1: Create the branch** with `git switch -c deps/update` from `main`. The uncommitted `flake.lock` edit and the untracked folders come along. Run `git status --short`: expect ` M flake.lock`, `?? tools/`, `?? docs/features/upgrade-all/`, and `?? .web/` if present.
- [ ] **Step 2: Bump `@types/node`** with `npm install --save-exact @types/node@26.6.6`. `package.json` line 29 reads `"@types/node": "26.6.6"`; `git diff --stat` lists only `package.json` and `package-lock.json` besides `flake.lock`.
- [ ] **Step 3: Move the four rust-cache pins** from `6323deb102c322ba6fcbdcafc7e3dddab59af2b6 # v2.9.2` to `d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3`. Run `grep -rn "rust-cache@" .github/workflows`: four lines, all `d1527c8f…`, none `6323deb1…`.
- [ ] **Step 4: Verify.** Run `npm run typecheck` (expect exit 0), `npm test` (expect exit 0, the installer suite and `check-repo` included), and `nix flake check --no-build` (expect exit 0: the carried lock still evaluates).
- [ ] **Step 5: Commit.** `git add -u`, then `git commit -m "Bump @types/node, the rust-cache action and the Nix inputs."`

### Task 2: tui-review's locked dependencies

**Files:**
- Modify: `crates/tui-review/Cargo.lock`

**Interfaces:**
- Consumes: the branch from Task 1.
- Produces: a lock with the 18 compatible bumps. `crates/tui-review/Cargo.toml` does not change: no direct dependency is held back.

- [ ] **Step 1: Run `cargo update`** in `crates/tui-review`. The packages it reports are exactly the 18 from the dry run (`cc`, `crc32fast`, `encoding_rs`, `gix-config`, `gix-hashtable`, `gix-ignore`, `gix-imara-diff`, `gix-macros`, `gix-parallel`, `gix-sec`, `gix-utils`, `jiff`, `jiff-core`, `jiff-static`, `log`, `rustix`, `smallvec`, `unicode-width`). `git diff --stat` lists `Cargo.lock` only.
- [ ] **Step 2: Verify as CI does** (from `crates/tui-review`): `cargo clippy --all-targets -- -D warnings` (exit 0), `cargo test` (24 passed, 1 ignored), `cargo test --release --test perf -- --ignored --nocapture` (budgets pass). Then the mod tests: `cargo run --release -- gen --out /tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/7cc7a523-b4b2-4058-9cfb-5335866847dc/scratchpad/tui-review-fixture`, `node ../../plugins/shared/tui-review/tests/make-fixture.mjs /tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/7cc7a523-b4b2-4058-9cfb-5335866847dc/scratchpad/tui-review-fixture`, then in `plugins/shared/tui-review`: `claude plugin validate .` and `claude plugin test .` (both exit 0).
- [ ] **Step 3: Commit.** `git add -u`, then `git commit -m "Refresh tui-review's locked dependencies."`

### Task 3: web-mcp: rmcp, zip and the compatible bumps

**Files:**
- Modify: `crates/web-mcp/Cargo.toml` (the `rmcp` and `zip` lines)
- Modify: `crates/web-mcp/Cargo.lock`

**Interfaces:**
- Consumes: the branch.
- Produces: `rmcp` =3.8.0 with `rmcp-macros` 3.8.0, `zip` =9.3.0, the other compatible bumps. `dom_smoothie`, `dom_query` and `model2vec-rs` stay put (their manifest constraints hold them).

- [ ] **Step 1: Confirm the "before" snapshot** exists: `/tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/7cc7a523-b4b2-4058-9cfb-5335866847dc/scratchpad/tools-before.json` (captured 2026-11-03 from the unmodified debug binary: 4 tools, 7560 bytes). It was produced by `node /tmp/claude-1000/-home-deadmade-projects-dead-claude-skills/7cc7a523-b4b2-4058-9cfb-5335866847dc/scratchpad/tools-list.mjs <binary> <empty dir>`.
- [ ] **Step 2: Edit `Cargo.toml`:** `rmcp = { version = "=3.8.0", … }` and `zip = { version = "=9.3.0", … }`, features unchanged. Run `cargo update`. `cargo tree -i rmcp-macros` shows 3.8.0, `cargo tree -i zip` shows 9.3.0, `cargo tree -i dom_query` still shows 0.28.0.
- [ ] **Step 3: Verify.** `cargo clippy --all-targets -- -D warnings` (exit 0). `cargo test` (251 passed, 4 ignored, the same counts as the baseline). `cargo test symlink_or_escape_entries_are_refused bad_extension_hash_is_refused` (2 passed).
- [ ] **Step 4: Diff the tool schemas.** Run the same script against the rebuilt `target/debug/web-mcp` into `…/scratchpad/tools-after.json`, then `diff tools-before.json tools-after.json`. Expected: no output. Any difference is a finding to read, not to wave through.
- [ ] **Step 5: Commit.** `git add -u`, then `git commit -m "Bump rmcp and zip and refresh web-mcp's locked dependencies."`

### Task 4: web-mcp: dom_smoothie and dom_query

**Files:**
- Modify: `crates/web-mcp/src/extract.rs` (the `tests` module only)
- Modify: `crates/web-mcp/Cargo.toml` (the `dom_smoothie` and `dom_query` lines)
- Modify: `crates/web-mcp/Cargo.lock`
- Modify only if the compiler requires it, and then only mechanically: `crates/web-mcp/src/extract.rs` (non-test code), `crates/web-mcp/src/engines/*.rs`. None is expected: the changelogs list no removals.

**Interfaces:**
- Consumes: Task 3's lock.
- Produces: `dom_smoothie` =0.19.0, `dom_query` 0.29 (with `html5ever` 0.40.1, `selectors` 0.41, `cssparser` 0.38), and test `code_block_in_a_utility_class_wrapper_survives`.

- [ ] **Step 1: Write the failing test** in `extract.rs`'s `tests` module: `fn code_block_in_a_utility_class_wrapper_survives()`. Its HTML is one `<article>` with an `<h1>`, two prose paragraphs of at least 400 characters each, and between them `<div class="scroll-mt-2 overflow-hidden"><pre><code>let doc = Document::from(html);\nlet n = doc.select("p").length();</code></pre></div>`. It calls `extract_html(html, &base())` and asserts `page.markdown.contains("let doc = Document::from(html);")` and `page.markdown.contains("doc.select(\"p\").length()")`, printing `page.markdown` as the failure message.
- [ ] **Step 2: Run it on 0.18.2 and see it fail.** `cargo test code_block_in_a_utility_class_wrapper_survives`. Expected: FAIL, the code missing from the markdown. If it passes, the markup does not reach upstream bug #226: change the wrapper's classes or its position among the paragraphs until it fails on 0.18.2. If no markup makes it fail, stop and report: a test that passes on both versions pins nothing.
- [ ] **Step 3: Bump.** `dom_smoothie = "=0.19.0"` and `dom_query = "0.29"` in `Cargo.toml`, then `cargo update -p dom_smoothie -p dom_query`. The lock diff holds `dom_smoothie`, `dom_query`, `html5ever`, `markup5ever`, `selectors`, `cssparser`, `servo_arc`, `bit-set`, `bit-vec`, `phf_codegen`, `string_cache`, `string_cache_codegen`, `web_atoms` and nothing else. If another package appears, stop and report.
- [ ] **Step 4: Run the test again and see it pass.** Same command. Expected: PASS.
- [ ] **Step 5: Full suite.** `cargo clippy --all-targets -- -D warnings` (exit 0) and `cargo test` (252 passed, 4 ignored: the baseline plus the new test). The engine parser tests (`bing`, `brave`, `duckduckgo`, `scholar` against captured pages; `google` and `semanticscholar` inline-HTML tests) and `article_keeps_body_drops_nav`, `images_only_from_main_content`, `app_shell_is_near_empty` all pass.
- [ ] **Step 6: Commit.** `git add -u`, then `git commit -m "Bump dom_smoothie and dom_query and test that code blocks in utility-class wrappers survive extraction."`

### Task 5: web-mcp: model2vec-rs for the h4 experiment

**Files:**
- Modify: `crates/web-mcp/Cargo.toml` (the `model2vec-rs` line)
- Modify: `crates/web-mcp/Cargo.lock`
- Modify only if the compiler requires it, and then only mechanically: `crates/web-mcp/examples/h4.rs`

**Interfaces:**
- Consumes: Task 4's lock.
- Produces: `model2vec-rs` 0.4.0. The shipped binary does not link it.

- [ ] **Step 1: Bump.** `model2vec-rs = { version = "0.4.0", optional = true }`, then `cargo update -p model2vec-rs`. The lock diff holds `model2vec-rs` and, as removals, `ndarray`, `matrixmultiply`, `num-complex`, `num-integer`, `rawpointer`; nothing else.
- [ ] **Step 2: Verify.** `cargo check --features h4 --example h4` (exit 0). `cargo clippy --all-targets -- -D warnings` and `cargo test` again (exit 0; 252 passed, 4 ignored): the default build must not have changed.
- [ ] **Step 3: Commit.** `git add -u`, then `git commit -m "Bump model2vec-rs for the h4 experiment."`

---

## Self-review

- **Coverage:** every row of flow.md's inventory has a task: npm, Actions and Nix in 1, tui-review in 2, rmcp/zip/compatible in 3, dom_* in 4, model2vec in 5. Vendored upstreams and `agent-browser.json` are out of scope by the weekly syncs; said in flow.md.
- **Consistency:** test counts follow from the baseline (251 + 1 new = 252); the lock package lists in Tasks 2, 4 and 5 match the dry-run and the trial resolve.
- **Proportion:** this is a lockfile job. The only code is one test, so the plan carries its markup and assertions, not its body.
- **Known cost, not a task:** the second copy of `html5ever`'s support crates after Task 4 (compile time, some binary size). Holding Task 4 back is the way to avoid it; `htmd` is the dependency that has to catch up.
