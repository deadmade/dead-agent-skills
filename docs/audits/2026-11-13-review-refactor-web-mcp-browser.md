# Review: refactor-web-mcp-browser

branch: refactor-web-mcp-browser ← main (merge-base ccab8df), 24 files, +389 −192, 7 commits (tip ec188ae), nothing uncommitted except `docs/features/` run files.

Verdict: ready (0 to fix before merge, 8 worth doing, all low).
Lenses: correctness (sonnet, neutral brief: the built-in `code-review` needs a clean tree and `docs/features/` is untracked), lean+spec (opus), tests (`flows:pr-test-analyzer`), docs (sonnet), risk (opus); skipped security (the diff moves existing file, process and network code unchanged and adds no parsing, auth or secret handling).
Checks (measured on ec188ae, tree clean but for untracked `docs/features/`): `cargo build --locked -p web-mcp --bin fake-agent-browser`, `cargo test --workspace --locked`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, `cargo fmt --all -- --check`: green. `node scripts/test.mjs repo node`: `repo` passed; `node` failed with 3 symlink-EPERM installer tests and `scripts/test.test.mjs` ("the mods suite ..."), identical on the base `ccab8df` in a scratch worktree (installer system tests: 7 pass 3 fail on both; mods test fails on both): pre-existing.

## Findings

| #   | severity | where | finding | evidence | fix (recommended) | bucket |
| --- | -------- | ----- | ------- | -------- | ----------------- | ------ |
| 1 | low | `docs/components/browser-core.md:38` | Says `rest`, `resting`, `consent_seen`, `set_consent_seen` join the name under the search folder; the consent marks join under the held profile slot (search folder only before a slot is held). | confirmed: `profile.rs:220-226` (`consent_mark`), test `consent_mark_is_per_slot` | Reword: rest marks under the search folder, consent marks under the held slot. | worth doing |
| 2 | low | `docs/components/browser-core.md:18-21` | "names none of" search or fetch holds for imports only: the crate keeps `FETCH_PREFIX`, the reserved `search-`/`web-mcp-search-`/`web-mcp-fetch-`/`window` session names and `search.is_none()` tab handling; a second consumer's session keys get remapped or rejected and "What a consumer must do" doesn't say so. | confirmed: `browser.rs:21,37-42,195-201,751` | Say "imports none of its modules"; add a bullet on the reserved session names. | worth doing |
| 3 | low | `docs/components/browser-core.md:25-32` | API list omits `Window::new`, `SearchRun`'s public field `ready_js` and `BrowserError`'s variants while claiming "what web-mcp uses, and nothing else". | confirmed: `window.rs:26`, `browser.rs:55-61,103` | Add the three. | worth doing |
| 4 | low | `scripts/release.test.mjs:51` | The real-`Cargo.lock` assertion loops over the three servers only; browser-core (a member) is missing from that list. | confirmed: `release.test.mjs:51` vs `:64`; covered indirectly by the `replaceAll` check at :54 | Add `'browser-core'`. | worth doing |
| 5 | low | `tools/web-mcp/tests/browser.rs:552` | The `search-` reservation sits in browser-core (`browser.rs:37`) and the name in web-mcp (`search.rs:175`); no test would fail if the reservation were dropped. | confirmed: the `bad` list at `tests/browser.rs:552-570` lacks `search-` and `web-mcp-search-` | Add `"search-google"` and `"web-mcp-search-x"` to the `bad` list. | worth doing |
| 6 | low | `tools/browser-core/src/profile.rs:143-147` | `#[cfg(test)] fn dir()` has one caller, a test in the same module that can read the private field. | confirmed: `profile.rs:809` | Delete the method, use `p.dir` at :809. | worth doing |
| 7 | low | `tools/browser-core/Cargo.toml:30` | The tokio dev-dependency lists `macros` (already a dependency) and `rt-multi-thread` (no test uses it). | confirmed: grep of `tools/browser-core/src` for multi_thread/flavor finds nothing | `features = ["test-util"]`. | worth doing |
| 8 | low | `docs/solutions/chrome-version-opens-a-window-on-windows.md:8` | Cites `version()` in `profile.rs`; no such function exists, the probe is `starts` (it did not exist on the base either). | confirmed: `profile.rs:404,459`; `git show ccab8df:tools/web-mcp/src/profile.rs` | Replace `version()` with `starts`. | worth doing |

Picks: 1,2,3,4,5,6,7,8
Fixed 2026-11-13: 1,2,3,4,5,6,7,8 (commit after ec188ae; a fresh fix-check agent PASSed all eight; cargo fmt, clippy, workspace tests and release.test.mjs green)

Dropped: 1 (a docs candidate about `ci.md` not naming the `libraries` map: `ci.md:10-11` already says to keep routing current, and the narrower gap is in the Parking lot). The final whole-branch review (opus-class, before this review) found no Critical or Important issue; its minor findings were fixed in `ec188ae` or are in the Parking lot.

## Tasks

Tasks 1-6 of `docs/features/refactor-web-mcp-browser/plan.md`, all `files clean`: see that run's flow.md.

## Rulings

See `docs/features/refactor-web-mcp-browser/flow.md` (Rulings).

## Parking lot

See `docs/features/refactor-web-mcp-browser/flow.md` (Parking lot).

## Deviations

See `docs/features/refactor-web-mcp-browser/flow.md` (Deviations): one, decided.

## Skipped

- security lens: the diff moves existing code unchanged and adds no input parsing, auth or secret handling.
- built-in `code-review` for the correctness lens: needs a clean tree; `docs/features/` is untracked, so the neutral brief ran.
- `nix build` / nix checks, treefmt/prettier on the new Markdown and TOML: no nix here.
- the cookie-extension download path (`profile.rs`, 2 MiB cap, sha-256): no test reaches it.

## Run verdict

worked as a whole: yes; clean: yes (the user, 2026-11-13)
