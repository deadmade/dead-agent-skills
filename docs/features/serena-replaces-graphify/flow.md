---
flow: feature
phase: execute
now: Waiting for you: pick how the branch ends.
---

# Serena replaces graphify: flow

## Request

"Lets remove graphify and add serena based on carttobench benchmark pls!" (started as `/refactor`; the user moved it
to `/build-feature` on 2026-11-23, since the swap changes behaviour and test assertions.) Benchmark:
`C:\Users\manue\.t3\projects\cartobench`. Serena: https://github.com/oraios/serena

## Artifacts

- Prior art: [prior-art.md](prior-art.md)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs: [0016](../../adr/0016-serena-replaces-graphify.md)
- Glossary:

## Gates

- Gate 1, spec approved: 2026-11-23
- Gate 2, plan approved: 2026-11-23, execution: native
- Gate 3, review-code: report approved 2026-11-23 (picks 1, 2, 4, 5, 6, 9, 10, 11)

## Skipped

- /review-code: pstack `interrogate` not run (offered after native execution; the user said lenses only, 2026-11-23).

- Baseline: 5 node tests fail with EPERM on symlink (see **Findings**); the user chose to go on and track them: each
  task must fail exactly these 5. python and rust checks NOT RUN (uv and cargo not on PATH).

## Grounding

**Evidence (measured, cartobench `report/index.html`, written 2026-11-22, 15 repositories, 9,900 matches per arm,
Bradley-Terry with rg = 1000):** serena rank 1, 1119 (1088–1147), median quality 100 %, 233 tokens, 260 ms.
graphify rank 6, 975 (952–998), 59 %, 134 tokens, 642 ms. graphify-query (what graphify's skill sends questions to)
rank 14, 708, 4 %, 1781 tokens. rg 1000, 68 %, 515 tokens. Composites: serena+rg 1077 (rank 1), graphify+rg 965.
Cartobench's serena arm runs `--context agent --mode benchmark` (README:87) and asks `find_symbol` /
`find_referencing_symbols` (README:102).

**Where graphify lives (verified by reading; no `graphify-out/` here, so no graph query; grounding done inline, not
via pstack `how`):**

- Plugin `plugins/shared/graphify/`: vendored skill + `UPSTREAM`, licences, neutral `hooks/hooks.json` (two
  `tool.starting` nudges calling `graphify hook-guard`), hand-written `plugin.json`.
- `plugins/catalog.json:13` flows depends on graphify; `:17` its entry. `plugins/flows/plugin.json:17`
  `"embeds": ["graphify"]` (Codex carries its skills inside flows: `tools/harness-compiler/src/targets/codex.ts:57`).
- Flows text: `steps/ground-code.toml:5,13` (query `graphify-out/graph.json`), `steps/missing-piece.toml:9`,
  `skills/understand/SKILL.md:3,6,39,48`, `references/resource-index.md:10`, `README.md` (8 lines).
- Compiler: `targets/codex.ts:15` description, `templates/codex.ts:43`, `templates/hosts/codex.md:17`,
  `lint-allowlist.json:19`, `test/build.test.ts:190`.
- Installer: `assets/tools.json:57` (pypi `graphifyy` + extras, unpinned), `core/tools.ts` `PypiTool`,
  `steps/uv.ts:22,66-80` `installGraphify`, `install.ts:58,300-304`, `core/binaries.ts:20-21`,
  `core/options.ts:70` (Tools page), plus ~10 test files and `core/fixtures/installed_plugins.json`.
- Retirement is automatic: a plugin gone from our marketplace is removed on every installer run
  (`core/plugins.ts:82` `retiredPlugins`). The `graphify` uv tool itself is not uninstalled by anything.
- Upstream sync: `tools/upstream-sync/src/adapters/graphify.ts`, `sources.ts:7,131-142`, `application.test.mjs`.
- Docs: `AGENTS.md:42,84`, `README.md:26,59`, `THIRD_PARTY.md:102-109`, `treefmt.toml:12`, `.gitignore:17-18`,
  ADR 0012 (mentions graphify as a uv tool).
- Shapes to copy: an MCP-only plugin is `plugin.json` with `mcpServers` (`plugins/shared/web-mcp/plugin.json`,
  `plugins/opt-in/mcp/mcp-github/plugin.json`); Python CLIs go through the installer's own uv (ADR 0008).

Suite on the base (2026-11-23, `npm test` on 5a756b22, branch `serena-replaces-graphify` made in place): repo passed,
mods passed, node failed (5 tests, all EPERM creating a symlink, also outside the sandbox: this Windows user lacks the
symlink privilege), python and rust NOT RUN (uv and cargo not on PATH). See **Findings**.

## Prior art

[prior-art.md](prior-art.md). Approaches: A user-scope client config (Serena's recipe), B plugin-shipped
`mcpServers`, C HTTP-mode server, D Serena's hooks. Source check: 38 confirmed, 6 corrected, 0 couldn't open.
Key facts: `--context claude-code|codex`, `--project-from-cwd`, `--open-web-dashboard False` stops the window only,
`--add-mode no-memories` disables memories and onboarding; Serena's marketplace warning targets the uvx commands.

## Findings

Baseline `npm test` (5a756b22) node failures, all `EPERM: operation not permitted, symlink`:

- `plugins/flows/skills/build-feature/tests/glance.test.mjs:274` the CLI runs through a symlinked folder
- `tools/installer/steps/codex.test.ts:282` migration revalidates symlink
- `tools/installer/system/files.test.ts:33` clean slate: backup copies the targets, clear deletes them but keeps symlinks and credentials
- `tools/installer/system/harness-setup.test.ts:20` theme installs atomically, preserves conflicts and symlinked directories
- `tools/installer/system/harness-setup.test.ts:48` theme publication preserves a concurrently created symlink

## Options

### Conductor

Picked: /build-feature (the swap changes behaviour and test assertions, which /refactor forbids). Rejected: keep
/refactor, no conductor.

### Role

Picked: take graphify's place, flows depends on serena. Rejected: opt-in MCP only (smallest), in the dead-skills
bundle.

### Launch

Picked: plugin `mcpServers` (B), Codex through the generated setup skill. Rejected: user-scope config (A), HTTP (C).

### Memories

Picked: `--add-mode no-memories`. Rejected: `no-onboarding`, Serena defaults.

### Old CLI

Picked: the installer uninstalls `graphifyy`. Rejected: leave it.

### ADR

Picked: ADR 0016. Rejected: none.

### Path key

Picked: `config.serenaPath`, set by the installer (against my recommendation of plain `serena`).

## Plan review

### Round 1 (2026-11-23): correctness (fable), fit (opus), simpler (sonnet)

Merged to 3 blocking, 11 should-fix, 9 consider; none dropped. Blocking B2 and should-fix S1, S2 checked by me
(read `core/codex.ts:47`, `check-repo.mjs:126-134`, fetched serena's `contexts/claude-code.yml`): confirmed.

- B1 flows deps and README tree are generated from conductors' `uses` (`check-repo.mjs:126-134`); the plan hand-edits them and puts serena in no `uses`.
- B2 `codexPlan` (`core/codex.ts:47`) never removes a plugin gone from the catalog: Codex keeps graphify and its hooks call the uninstalled CLI.
- B3 Task 1 leaves check-repo and real-catalog tests red until Tasks 2-4; the pre-commit hook rejects its commit.
- S1 `--context claude-code` injects a prompt making Read and Edit "FORBIDDEN" in every session.
- S2 a failed install still repoints `serenaPath`.
- S3 Review Focus cites Task 3 tests that don't exist; decisions belong in `core/` with tests.
- S4 `--upgrade` while serena runs (Windows file locks; inferred).
- S5 Task 5's grep contradicts kept graphify references.
- S6 serena writes `.serena/` into every activated repo.
- S7 Codex step runs before the uv step; Codex-only runs never install serena.
- S8 graphifyy uninstall only when serena is selected, and removes a user's own copy too.
- S9 launch args duplicated in five places; `codex-mcp.json` (`mcpSettings`) already carries Codex MCP facts.
- S10 `extras?` and the `pypiSpec` rename are options nobody uses.
- S11 `build.test.ts` builds fixtures, not the real tree; `.mcp.json` shape is `{ mcpServers: … }`.
- Consider: false "missing on PATH" rows; fallback wording "available and returning results"; Codex
  `startup_timeout_sec`; `MCP_COMPONENTS` label; stale resources.json sentence and unused `embeds`; Codex flows
  README names both setup skills; keep graphify in the captured fixture; Claude-only `--context` in a neutral
  manifest; `--project ${project.dir}` vs `--project-from-cwd` (unverified cwd); ADR 0012 pointer to 0016.

Decisions (user, 2026-11-23): S1 `--context ide` on both hosts (one args list, also resolves S9); S6 document +
ignore `/.serena/` here; S7 Codex installs serena itself with uv's absolute path; all other findings and every
consider item applied as recommended, except `--project ${project.dir}` (kept `--project-from-cwd`; the cwd Claude
Code gives plugin MCP servers stays unverified, checked at Finish). Plan rewritten: 5 tasks → 4, each green alone;
spec and ADR 0016 updated (context `ide`, `.serena/` side effect, Codex install, uninstall trigger, timeout). Fix
check and two fresh-eyes reviewers running.

Fix check 1 (sonnet): 9 PASS, 3 PASS with a gap, B3 and S3 FAIL (Task 1 left options and real-manifest plugin tests;
Review Focus claimed absent tests). Fixed: those edits moved into Task 1; Review Focus says what is untested.

Fresh eyes (opus, sonnet): A 6 should-fix and 6 consider; B 2 blocking (the same two as fix check 1, already fixed),
4 should-fix and 2 consider. Applied without a new decision, as each follows from round 1's picks: Codex retire rule
narrowed to `RETIRED = ['graphify']` (a general rule removed foreign plugins); `io.serena` and `io.cleanup` seams with
fixture defaults and an appending `config.toml` fake; `.trim()` on `uv tool dir --bin`; Codex uv in its own `bin`
folder (ADR 0012); sorted test list; typings; Codex README assertion; treefmt before commits; no uv download just to
uninstall graphifyy, which runs only in the retiring run (ADR 0016); `mcpTableLine` keeps a user's timeout; Codex
label; /understand fallback line.

Fix check 2 (sonnet): F1-F14 PASS; three new gaps (seed the Codex plugin list, split two assertions, narrow in the
test) fixed. No blocking finding open.

## Tasks

- Task 1: base 5a756b22c1334d42b5ab9416efeedb7058c6f32f; untracked then: ADR 0016, this feature folder,
  `docs/features/evaluate-elephant-goldfish-model/` (not this run's). `tools/harness-compiler/src/cli.ts` shows
  modified with an empty diff (line endings), not staged.
- Task 1: done, cce14f5, files clean (40 files, the plan's list; size 257 without graphify's vendored files, ~230; +116 −2175, mostly graphify's vendored files). `npm test`: repo
  passed, node failed with exactly the 5 tracked EPERM tests; typecheck exit 0.
- Task 2: base cce14f5; done, 8182452, files clean (9 files, the plan's list; size 124 of ~110). `npm test`: only the 5 tracked failures.
- Task 3: base 8182452; done, f76c4f5, deviation (size 216 of ~100), see **Deviations** (4 files; `core/agents.test.ts` needed no change; +194 −22 against ~100
  planned, mostly the new step tests with the args list one per line). `npm test`: only the 5 tracked failures.
- Task 4: base f76c4f5; done, 3286bf6, files clean (6 files, ADR 0016 staged here; size 29 without the ADR, untracked at
  the start, of ~50). The plan's `git grep` printed nothing.
  `npm test`: only the 5 tracked failures.

## Rulings

- Task 1: treefmt is not on PATH (no nix shell); formatted the changed files with `npx prettier@3` and treefmt's
  prettier options instead. TOML files were not taplo-formatted (edits kept the existing layout).
- Task 1: three test lines the plan's line list missed, all in listed files: `catalog.test.ts:11` (Codex plugin order
  gains serena), `application.test.mjs:53-54` (15 sources, 11 adapters) and `plugins.test.ts:104` (graphify now
  retires on Claude Code; serena added as the kept example). The last one now asserts graphify's retirement.
- Task 1: the `/understand` description says "serena when present": "serena's" broke its single-quoted YAML
  (`claude plugin validate` caught it).
- Task 1: `codex-mcp.json` is flat (`{ args, envVars }`), so the test reads `.args`, not `.serena.args`.
- Task 2: `install.ts` keeps `uv` in an outer `let`, so the graphify cleanup reuses the copy the uv branch set up.
- Task 3: the fake `mcp add` appends a table only for mcp-azure and serena (the servers whose table the installer
  edits), not for every name: an appending fake for dead-skills broke the existing "foreign configuration survives
  reruns" test, which asserts `config.toml` unchanged.
- Task 3: a private `mcpTable` helper holds the table lookup that `mcpTableLine` and `mcpEnvironment` both need.

## Parking lot

- `installSerena` and `uninstallGraphify` (`steps/uv.ts`) have no tests: `startSync` has no seam there. The `uv tool
list` line match could move to `core/` with a captured-output fixture (final review, consider 3).
- `steps/codex.ts`: a symlinked `config.toml` throws after serena's server was added (same guard as Azure; review
  dropped it as decided).
- Review 3: bare default commands (`serena`, web-mcp's `web-mcp`) may resolve a binary planted in the repo on Windows.
- Review 7: a test of the default graphify cleanup with no uv present.
- Review 8: the `uv tool list` match in `core/` with a captured fixture.
- /learn, a check: `scripts/flows-uses.mjs` accepts an MCP server id as a `uses` name (`serena:serena`), which rendered
  a tool that doesn't exist in flows' README trees; run against cce14f5 it must fail. Reject a server id for a plugin
  with no skills and require tool names.

## Deviations

### Task 3 size

216 changed lines against ~100: 101 production, 115 tests (four new `applyCodex` tests, the args list one per line).
Status: decided 2026-11-23: accept as is.

## Walkthrough

| goal                                                  | plan task | file:line                                                                                                         | test                                                                                   |
| ----------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1 graphify gone from what ships                       | 1         | `plugins/catalog.json:17`, `tools/upstream-sync/src/sources.ts`, `tools/harness-compiler/src/targets/codex.ts:43` | `build.test.ts:192` the real tree ships serena and no graphify                         |
| 2 serena plugin on both hosts, flows depends on it    | 1         | `plugins/shared/serena/plugin.json:15`, `tools/harness-compiler/src/templates/codex.ts:24`                        | `build.test.ts:192`                                                                    |
| 3 grounding uses serena, Explore fallback             | 1         | `plugins/flows/steps/ground-code.toml:5,13`                                                                       | none (prose; check-repo checks `uses` and the generated deps)                          |
| 4 installer installs serena with its uv (Claude Code) | 2         | `tools/installer/steps/uv.ts:70`, `tools/installer/install.ts:315`                                                | `core/tools.test.ts:91`; `install.ts` and `installSerena` untested (parked)            |
| 4 installer installs serena with its uv (Codex)       | 3         | `tools/installer/steps/codex.ts:294-309`, `core/codex.ts:92`                                                      | `steps/codex.test.ts:140,170`, `core/codex.test.ts:39`                                 |
| 4 old graphify CLI removed, plugin retired            | 2, 3      | `steps/uv.ts:91`, `install.ts:310-336`, `core/codex.ts:19`, `steps/codex.ts:204,314`                              | `core/plugins.test.ts:102`, `core/codex.test.ts:33`, `steps/codex.test.ts:186,202,220` |
| 5 docs say what the code does                         | 4         | `AGENTS.md:42`, `README.md:26,59`, `THIRD_PARTY.md`, ADR 0012, ADR 0016                                           | the plan's `git grep` (no output)                                                      |

## Review

### Final whole-branch review (fresh general-purpose agent, 2026-11-23, range 5a756b2..3286bf6)

No blocking. 1 should-fix, 4 consider.

- S1 a refused `codex plugin remove graphify` (the new marketplace no longer lists it) threw and stopped the whole Codex
  step on every rerun. Checked by me in `steps/codex.ts`; fixed in dd2560b: a retired plugin's failed removal is one
  failure line with the command, the step goes on; new test.
- C2 "a failed serena install adds no serena server" never checked `io.serena` was called: fixed (counts the call).
- C3 no tests for `installSerena` / `uninstallGraphify`: parked.
- C4 the failure text repeated `-p 3.13 serena-agent`: fixed, built from `tools.json`.
- C5 the grounding bullet's "available and return results" was circular: fixed (use them first; when they return
  nothing, go on).

After the fixes: `npm test` repo passed, node only the 5 tracked failures; typecheck exit 0.

### /review-code branch (inline, 2026-11-23)

Verdict: ready (0 fix before merge, 11 worth doing). Audit: [2026-11-23-review-branch.md](../../audits/2026-11-23-review-branch.md).
Fixed (uncommitted until Decide): 1 README says flows needs the serena CLI; 2 language servers run build code
(ADR 0016, plugin description); 4 `uses` names serena's tools; 5 one `uninstallGraphify(uvs)` for both hosts; 6 a test
pins the narrowed catch; 9 a test renamed; 10 a self-added serena runs beside it; 11 installer.md covers serena. Left:
3, 7, 8 (parking lot). Fix check: all PASS.

## Decide (2026-11-23)

- Rulings, Tasks 1–3: all confirmed.
- Task 3 size: accepted as is (decided earlier).
- Parking lot: follow-ups: installer tests (installSerena, uninstallGraphify, default cleanup with no uv, `uv tool
list` match in `core/` with a fixture), bare default commands on Windows (serena, web-mcp), a `flows-uses.mjs` check
  rejecting a server id as a tool name. Dropped: the symlinked Codex `config.toml` (decided in the spec).
- Commits: three (review fixes; AGENTS.md notes; run notes and audit).
- Run verdict: done. Not checked: a real Codex rerun removing graphify, the cwd Claude Code gives a plugin MCP
  server, serena actually starting.

## Learned

- AGENTS.md (Checks): formatting without the nix shell (`npx prettier@3` with treefmt's options).
- AGENTS.md (Checks): `npm run build:harnesses` one process at a time (concurrent builds hit EPERM on Windows and
  removed `.claude-plugin/`).
- Memory: this Windows machine lacks the symlink privilege (5 EPERM tests fail on every base); file edits through
  node scripts go in files written with the Write tool, not shell heredocs.
- Parking lot: a check in `scripts/flows-uses.mjs` against a server id used as a tool name.

## Run verdict
