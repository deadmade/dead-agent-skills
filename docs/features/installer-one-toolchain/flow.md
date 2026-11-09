---
flow: feature
phase: done
now: Done: the branch is pushed for a pull request; the user runs the push and `gh pr create`.
---

# Installer: one toolchain: flow

## Request

Hey, im a but unhappy of our installer. We currently vendor 3/4 eco systems. We got rust exces, we got plain js/ts, with the mermaid stuff we pull npm into it, we got uv, we got maybe plain python as well. Is there a way to unifiy this shit and not have different ecosystems in the installer etc?

## Artifacts

- Prior art: [prior-art.md](prior-art.md)
- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs: [0012](../../adr/0012-installer-runs-its-own-copy-of-every-tool.md) (0011 is taken in the working tree by api-mcp; recheck the number when committed)
- Glossary: `GLOSSARY.md`, new section **Installer** (Tool, Tool manifest, Our copy)

## Gates

- Gate 1, spec approved: 2026-11-09. Reopened 2026-11-09: the line 'prompts and summary lines unchanged' amended at Plan review (decision 7: one summary format, a declined download is a failure line, sudo prompt after the download). Approved 2026-11-09 with the plan-review decisions.
- Gate 2, plan approved: 2026-11-09, re-grounded on main after #133; method: subagent-driven.
- Gate 3, review-code report: 2026-11-09 (audit file docs/audits/2026-11-09-review-installer-one-toolchain.md); picks: 1-10, 12, 14.

## Skipped

Accepted at Decide, 2026-11-09:
- The copyedit was not re-run on small plan, spec and ADR edits; the audit file was not copyedited.
- The correctness lens ran the neutral brief (the tree had uncommitted work).
- `claude-md-improver` was not used.
- The SDD workspace `.superpowers/sdd/plan/` is left in place (gitignored; dcg blocks `rm -rf`).
- Not run: the new code on Windows (CI covers it).

## Grounding

Measured by reading the code (not run). The installer itself is already one ecosystem: Node 26 stdlib, no runtime npm
deps, shipped as `installer.tgz` (`AGENTS.md` Layout; `package.json` `devDependencies` only). What it *provisions*
is mixed, through four download mechanisms:

| What | Ecosystem | How the installer gets it | Code |
| --- | --- | --- | --- |
| web-mcp, ado-mcp (flow-cockpit.exe until main dropped it, #133) | our Rust, built per release in CI | release asset + sibling `.sha256` file | `core/binaries.ts:59-88` (`BIN_PLUGINS`, `binAsset`), `steps/binaries.ts` |
| agent-browser | upstream Rust binary | version + sha256 pinned in `assets/agent-browser.json` | `core/binaries.ts:175` `agentBrowserAsset` |
| uv | upstream Rust binary | version + sha256 pinned in `assets/uv.json` | `core/binaries.ts:194` `uvAsset`, `steps/uv.ts:26` |
| headroom-trim server | Python 3.13, `headroom-ai==0.42.0`, 294 lines in 3 files | installer's uv runs `uv sync --locked` + tiktoken fetch | `steps/uv.ts:74`; ADR 0008 |
| graphify CLI | upstream Python | `uv tool install --upgrade graphifyy[sql,pdf,office,watch,leiden]`: unpinned, always latest | `steps/uv.ts:106`, `core/binaries.ts:15-18` |
| dcg | upstream (its own installer) | `curl ... \| bash` / `irm ... \| iex` | `steps/dcg.ts`, `core/options.ts:18` |
| LSPs, ccstatusline | npm / rustup / dotnet / winget | only printed hints when missing (`BINARIES`); the installer runs none | `core/binaries.ts:20-36` |

- npm is never run by the installer except `npx` to re-launch itself (`install.ts:85`). Mermaid (12.3.0), marked,
  DOMPurify, xterm are vendored JS in `tools/flow-cockpit/app/shell/vendor/`, copied from npm tarballs by hand
  (`THIRD_PARTY.md`); they never reach the installer.
- Python in the repo: the headroom server, and `scripts/check_cargo_workspace.py` (CI/dev only). CI needs Node, Rust, uv
  (`test.yml:41` setup-uv) and Nix for the dev shell.
- Dependabot covers actions, root npm, cargo, uv.lock; hand-bumped: flake.lock, flow-cockpit vendor JS, installer pins
  (weekly `sync.yml`), the Cisco scanner pin.
- Platforms: Windows x64 and Linux x64 only.
- Prior records: ADR 0008 (Python via installer-managed uv; rejected PyInstaller/Nuitka, own venv, first-use download,
  Rust rewrite because headroom's protections live in its Python router).

## Prior art

Report: [prior-art.md](prior-art.md). Four approaches: (1) pinned fetcher plus one bootstrap tool (today's shape:
cargo-dist, DotSlash, uv, rustup, Claude Code's installer); (2) a runtime manager (mise, pixi, proto, Nix; Nix has no
Windows); (3) compile the minority code to one executable (Node SEA, Deno, Bun, PyInstaller; ADR 0008 rejected it);
(4) rewrite into one language (no comparable found). Gaps: Bun docs page, Trunk/devbox/aqua docs unopened.
Source check (fresh opus agent): 28 confirmed / 2 not supported / 0 couldn't open (3 of 3 `[source]` claims confirmed); report corrected. Mise's Windows x64 binary and per-platform `checksum` verified afterwards.

## Findings

## Options

### Bundler shape
Picked: A, one manifest (`assets/tools.json`) and one engine in the installer, including our own Rust binaries as `source: release` entries.
Rejected: B mise (mise.lock covers tools not app deps; compiles from source on NixOS until 2027.8.0; moves `binPath`);
C merge only the uv/agent-browser pins (kept as A's first slice); D pixi (full migration; fixes CI/dev more than the installer; stays possible later).
Rewriting Python/JS in Rust: the user ruled it out. Recommendation was A.

### graphify version
Picked: unpinned, as today; the manifest entry names the package and extras only. Rejected: pin + new PyPI sync job (more maintenance).

### Sync shape
Picked: one PR per tool, sources generated from the manifest. Rejected: one combined `tools` PR.

### Which copy runs
Picked: one rule for every tool, our copy in `~/.claude/bin` (user: "I dont plan on installing them separate"). Rejected: keeping three rules as a `use` field. Recommendation was to keep them; the user chose to unify. ADR 0012.

## Plan review

Round 1: three fresh reviewers (correctness: opus, fit: fable, simpler: sonnet); 28 findings merged to 14, none dropped, the blocking one checked by me.
- Blocking: `.github/workflows/test.yml:73-74` greps the pack for the two pin files Task 6 deletes. Decision: apply (edit test.yml in Task 6). Verified by reading the lines.
- Should-fix: `JSON.stringify` reformats arrays against prettier (two reviewers ran prettier); contract tests of `core/binaries.test.ts` not ported; source fixtures without a manifest; graphify hint quoting; repeated repo/tag/url and per-tool targets; READMEs describing the PATH rule; ADR 0012 vs the Codex step. Decisions: no arrays + stringify round-trip test; port the four tests to Task 1; keep the two literal sync sources; `tagPrefix` and one shared `targets`; fix web-mcp README 109 and flow-cockpit README 47 (the other README lines describe manual setups and stay); the ADR names the Codex exception.
- Consider: BIN_DIR cycle (moved to context.ts), one Asset type, flake has no coverage floor, uv path assertion, grep pattern `binPath\(`, dead `binVersionAt`, `toolVersion` inlined, `tools` parameter only on `resolveTool`. All applied.
- User decisions: scope "keep release binaries, trimmed" (not a github-only first slice); sync sources "keep the two literal"; "apply all eight" for the rest. graphify: asked twice; the user wondered about a uv project (advised against: bare-name `graphify` on PATH, vendored skills can't be edited), then "what speaks against manifest entry only?". Planned as manifest entry only (the plan as before, quoted hint kept), to be confirmed at Gate 2.
- Fix checks: round 1 failed two items (graphify failure hint and done line; an over-broad grep) and found two new ones (Task 2 breaking the tree at its commit by missing `steps/agent-browser.ts`; sync PR bodies naming deleted files); all four fixed. Round 2 (sonnet): P1-P5 PASS (its report was partly garbled by output compression; the verdicts read PASS, one caveat unread). Fresh-eyes round skipped: no decision changed the plan's shape.

## Tasks

Untracked at start (run folder, ADR 0012): excluded from every files check. Tracked change at start: GLOSSARY.md (Installer section).

- Task 1: base 95dd4f6a; files clean (314 of ~370; adds match). Review: approved, 2 minor (untested guard branches; blank hash instead of removed key). Commit 190f965c.
- Task 2: base 9266a800 (HEAD 190f965c); files clean (186 of ~260; adds match). Review: approved, 4 minor (one for Task 6: delete GRAPHIFY_*, graphifyToolArgs, uvAsset, uvPlan and the `assets/uv.json` read in core/binaries.test.ts). Commit 0ea94795.
- Task 3: base 9ef5c396 (HEAD 0ea94795); files clean (93 of ~110; adds: none). Review: approved, 3 minor (old tables to remove in Task 6; `--with-deps` order untested, no seam). Commit 0a65417a.
- Task 4: base 48236665 (HEAD 0a65417a); files clean (76 of ~150; adds: none). Review: approved, 3 minor (Task 6 must delete the 3 duplicated `unavailable` assertions in core/binaries.test.ts:81-83). Commit 620411fb.
- Task 5: base 45bbe0bc (HEAD 620411fb); files clean (96 of ~170; adds: none). Review: approved, 4 minor (unguarded unknown tool in syncPin, `any`, unescaped tagPrefix). Commit 76375570.
- Task 6: base 0d0bdbc5 (HEAD 76375570); files clean (~393 of ~440; adds: none). Review: approved, 3 minor (steps/uv.ts inline cast, one long AGENTS.md line). Coverage 87.78% (was 88.33%), floor 79 unchanged. Commit a8f527e8.

- Fix 1, 3-10, 12, 14 (docs, tests, deletions): base a585be4b; files clean (9 files, all on the picks). Commit 33eb9f2d.
- Fix 2 (Codex step): base 33eb9f2d; files clean (`codex.ts`, `codex.test.ts`, ADR 0012). Commit 0f65c6c9.
- Fix check (fresh sonnet agent, never an author): 1-7, 9, 10, 12, 14 PASS; 8 PARTIAL (the glossary's "Our copy" still said the Codex step looks on PATH first only for web-mcp and ado-mcp), corrected in the uncommitted GLOSSARY.md.

## Rulings

- 2026-11-09, final review: the manifest round-trip test compared tools.json byte for byte, which fails on the Windows runner's CRLF checkout — the fix strips `\r\n` in the test, not a `.gitattributes` rule — a new file would be a deviation and the sync only runs on Linux — if wrong, a Windows dev's edit of tools.json is unchecked for line endings.
- 2026-11-09, final review: `steps/uv.ts` keeps its inline cast of `TOOLS.tools.graphify` — a fix needs a new export from `core/tools.ts` (an Adds deviation) for a harmless read — if wrong, the graphify step sees the manifest type once.
- 2026-11-09, final review: the coverage floor goes from 79 to 84, not 85 — measured 87.78% on Linux, but Windows skips differ — if wrong, a Windows run under 84 fails `npm test` until the floor is relaxed (it may never be lowered, so the next step would be a test).
- 2026-11-09, final review: `syncPin` guard, the long AGENTS.md:17 line and ensureTool's `|| !asset` stay as they are — minor, no behaviour — none.

- 2026-11-09, Finish checks: the repo lint rejects `~/.claude` in plugin READMEs, so the sentence the fix wave added to the web-mcp and mcp-azure READMEs now says "its `bin` folder" — the fix wave's re-review did not run `npm test` — if wrong, none (wording only); the change is uncommitted until Decide.

- 2026-11-09, review fixes: Fix 2's test fakes `process.platform` and `process.arch` with `Object.defineProperty` inside the test only, restored in `finally` — `CodexIO` cannot fake the platform and a new seam would be an Adds deviation — if wrong, a test that fails midway could leak the fake platform into later tests (it restores in `finally`, so only a crash of the process could).
- 2026-11-09, Gate 3: findings 11, 13 and 15 were not picked — 11 changes `toolOfPlugin`'s signature, 13 bends the agreed `planTool` interface, 15 merges the two literal sync sources the plan keeps — if wrong, three small duplications stay.

## Parking lot

- A fix wave's re-review in subagent-driven-development should run the full `npm test`: the README wording the fix wave added passed its re-review and then failed the repo lint (`~/.claude` in a plugin file). Skill fix, built later through `writing-skills`.
- Re-grounded 2026-11-09 after pulling main (#130-#133): the flow cockpit left, so the manifest has no `flow-cockpit` entry and no `folder`, `linuxHint`, `platforms` or `appPath`; `steps/binaries.test.ts` was deleted, so Task 4's test moves to `core/options.test.ts`; Task 6 drops the cockpit README and refreshes the AGENTS.md lines. The cockpit also left `tools/flow-cockpit/app/` untracked on disk (generated files); it is not part of this run.
- `docs/features/api-mcp/plan.md` (lines 305-319) adds a `BIN_PLUGINS` entry and edits `core/binaries.ts`, `core/options.ts`, `steps/binaries.ts`, `steps/codex.ts`: whichever flow lands second is rewritten against the other (here, a manifest entry instead of a `BIN_PLUGINS` one).

## Deviations

### The mcp-azure README (final review)
Status: decided 2026-11-09: add it to the fix wave.
`plugins/opt-in/mcp/mcp-azure/README.md` is not on any task's Files list but still tells users a hand-built ado-mcp can sit on PATH or be set with `/plugin configure`. ADR 0012 makes the installer ignore PATH and reset `binPath` on every run. Options: fix it with the web-mcp README (recommended) or park it.

### A test for Fix 2 through the Codex step (review)
Status: decided 2026-11-09: yes, one test in `steps/codex.test.ts` through `applyCodex`'s existing io.
The plan's Test seams don't list the Codex step, but that is the only place the Fix 2 behaviour (a PATH agent-browser kept when the platform has no build) can be caught.

## Walkthrough

| goal | plan task | file:line | test |
| ---- | --------- | --------- | ---- |
| One manifest describes every tool | 1 | `tools/installer/assets/tools.json`, `core/tools.ts:43` | `core/tools.test.ts:122` (complete, byte round trip) |
| Pure resolver: right asset, never one without a hash | 1 | `core/tools.ts:51` `resolveTool` | `core/tools.test.ts:11,26,35` |
| One copy rule (ours, older downloads, equal or newer keeps, PATH ignored) | 1, 2 | `core/tools.ts:85` `planTool`, `steps/tools.ts:22` `ensureTool` | `core/tools.test.ts:65`, `steps/tools.test.ts:46,53,61` |
| uv lands at `<bin>/uv(.exe)` for headroom-trim's launcher | 1, 2 | `core/tools.ts:99` `toolPath`, `steps/uv.ts:25` | `core/tools.test.ts:78` |
| graphify stays unpinned, extras from the manifest | 2 | `core/tools.ts:120` `pypiSpec`, `steps/uv.ts:68` | `core/tools.test.ts:84` |
| agent-browser through the engine | 3 | `steps/agent-browser.ts:14` | `steps/tools.test.ts:76` |
| web-mcp and ado-mcp through the engine, same settings and messages | 4 | `steps/binaries.ts:13`, `core/options.ts:112` | `core/options.test.ts:78`, `core/tools.test.ts:11,92,107,117` |
| Weekly sync reads and bumps `tools.json`, one entry per PR | 5 | `tools/upstream-sync/src/system/context.ts:90`, `adapters/pins.ts:5`, `sources.ts` | `application.test.mjs:194,225` |
| Old pin files, tables and functions gone | 6 | `core/binaries.ts` (deleted exports), `assets/uv.json` and `assets/agent-browser.json` removed | `core/binaries.test.ts` (kept functions only) |
| CI packs `tools.json`; docs say the new rule | 6 | `.github/workflows/test.yml:73`, `AGENTS.md`, ADR 0008 and 0012, `THIRD_PARTY.md`, web-mcp and mcp-azure READMEs | none (prose) |
| No goal without code, no code without a goal | n/a | checked: every changed file is on a task's Files list, plus the user-approved mcp-azure README and the final-review fix wave (`package.json` floor 79 → 84, `core/binaries.test.ts`) | n/a |

## Review

Verdict: no blocker. Six lenses (correctness, docs, tests, lean, risk, security) found 15 issues after a verifier pass (16 of 17 merged candidates confirmed, 0 dropped); security found none; risk judged the change two-way. Audit file: [2026-11-09-review-installer-one-toolchain.md](../../audits/2026-11-09-review-installer-one-toolchain.md). Gate 3 picks 1-10, 12, 14: all fixed (33eb9f2d, 0f65c6c9) and read PASS by a fresh fix check. Left open: 11, 13, 15 (low). After the fixes: `npm test` exit 0 (installer 221 run / 218 pass / 3 skipped, line coverage 87.77%, floor 84; harness-compiler 82 pass; upstream-sync 227 and 58 pass), `npm run typecheck` clean.

## Learned

Nothing written. One Parking-lot line (the SDD fix-wave re-review should run `npm test`). The other lessons are already kept: the sync's one-at-a-time rule is in AGENTS.md (Fix 4), the guard, dcg and local-main traps are in memory, the CRLF and coverage-floor rulings are in the code.

## Run verdict

Good (2026-11-09).
