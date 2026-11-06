---
flow: feature
phase: brainstorm
---

# Symposium evaluation: flow

## Request

Hey, could we analyze this repo and evaluate if it could be usefull for us https://github.com/symposium-dev/symposium

## Artifacts

- Spec:
- Plan:
- ADRs:
- Glossary:

## Gates

- Gate 1, spec approved:
- Gate 2, plan approved: <date>, execution: subagent-driven | native

## Skipped

<!-- Phases the user chose to skip, and why. -->

## Grounding

<!-- What the code looks like where this lands: modules, entry points, conventions, file:line. -->

The "how" step ran as explorers plus this summary, without a separate explainer agent (flow-rules **Agents**: fewer agents).

### Packaging path (explorer report; four citations spot-checked, all held)

- Neutral sources `plugins/<group>/<name>/{plugin.json,hooks/hooks.json}` plus `plugins/catalog.json` →
  `tools/harness-compiler/` (`load.ts` builds the plugin list, `emit/build.ts` plans every target before writing,
  `targets/{claude-code,codex}.ts` emit) → checked-in `.claude-plugin/` and `.agents/plugins/`, each with a
  marketplace and 11 packages. `check` diffs a fresh build against the checkout.
- Installer: Claude path adds the `release` branch as a marketplace and runs `claude plugin install`
  (`tools/installer/steps/plugins.ts`); Codex path copies `.agents` to `$CODEX_HOME/dead-agent-skills/` and runs
  `codex plugin|mcp …` (`steps/codex.ts`). `core/agents.ts` holds host metadata.
- Where a third-party format or registry could enter today: (a) a catalog entry with `source: {source: "url"}`, only
  Atlassian uses it, and the Codex marketplace emitter ignores non-local sources
  (`tools/harness-compiler/src/targets/codex.ts:83-87`); (b) a manifest dependency with a `marketplace`; (c) a new
  `targets/<id>.ts`; (d) an `upstream-sync` adapter that vendors upstream into `plugins/`.
- Adding a third host is more than one `targets/` file: `TARGETS` (`targets/index.ts:6`), `TARGET_IDS`, installer
  `AGENTS`/`AgentId`, the runtime adapter map and its hard-coded five shared events (`runtime/run.mjs:72`), `hosts/<id>.md`,
  and an installer step (`portableSelection` is hard-wired to `'codex'`, `tools/installer/core/catalog.ts:60`).
- MCP is asymmetric: Claude gets `.mcp.json` from the neutral `mcpServers`; Codex gets none from the compiler, its
  `codex mcp add` commands are hard-coded in `steps/codex.ts` and `templates/codex.ts`. Codex has no dependency
  install, and its hook map covers 4 of 15 neutral events.

### Skill selection, vendoring and hooks (explorer report; Stack packs, the fallback line and the runner's handlers spot-checked)

- Stack packs (`plugins/flows/references/flow-rules.md:201`): four rows map a file or kind of project to one named
  skill (`*.csproj`, `Cargo.toml`, SQL migrations, a web frontend). Detection is prose the conductor's model follows:
  repo-root files only, no dependency-manifest inspection, no code. Only `test-audit/SKILL.md:21` cites it by name.
  A missing plugin means "go on without it" (`flow-rules.md:226`).
- Users pick language and database plugins by hand in the installer (`tools/installer/core/options.ts:39-60`);
  nothing is chosen from the project.
- Vendoring: a `Source` in `tools/upstream-sync/src/sources.ts` plus an adapter in `src/adapters/`; weekly `sync.yml`
  sparse-clones upstream, copies skill folders with LICENSE/NOTICE, writes an `UPSTREAM` sha stamp, rebuilds the
  harness distributions, opens a PR, and opens an issue per new upstream skill. Checklist: `docs/vendor-a-pack.md`.
- `paths:` frontmatter does not gate plugin skills in Claude Code (AGENTS.md, ADR 0001), which is why csharp-skills
  uses six router skills over an unscanned `library/`. Applicability is left to the flows prose and the model.
- Hooks: the shared runner (`tools/harness-compiler/src/runtime/run.mjs`) has exactly two handlers, `notifications`
  and `rules`, and accepts five events. It is not a general plugin point. The SessionStart payload is `rules.md`
  (global coding rules), not skills.
- Nothing in the repo reads a per-repo skills file or a project's dependency manifest. Entry points for such a source:
  the Stack packs table (the one place that decides what applies), a new `Source` plus adapter, a new runner handler,
  or a `plugin.json` `mcpServers` entry.
- Adding a Stack packs row today means edits in `flow-rules.md`, `resource-index.md`, `options.ts`, `catalog.json`
  and an adapter; there is no data-driven path.

## Prior art

<!-- Approaches found, who uses them, key sources. -->

Researched by a background agent from a shallow clone of symposium-dev/symposium (never built or run), fetched
2026-11-03. Three claims that carry the recommendation were re-fetched by the main session and held:
[README](https://raw.githubusercontent.com/symposium-dev/symposium/main/README.md),
[Agent Plugins spec 1.0.0](https://agent-plugins.org/specification),
[Symposium's agent-plugins RFD](https://raw.githubusercontent.com/symposium-dev/symposium/main/md/rfds/agent-plugins/README.md).

**What Symposium is.** A Rust-only Cargo subcommand (`cargo agents`). It reads `cargo metadata`, evaluates plugin
predicates (`depends-on`, `path_exists`, `shell`, `env`) against the workspace's direct dependencies, and writes the
matching skills, hooks and MCP servers into seven agents (Antigravity, Claude Code, Copilot, Codex, Kiro, OpenCode,
Goose; the last two get no hooks) in each host's own file layout (`.claude/skills/`, `.agents/skills/`, hooks merged
into the host's settings). Crate authors ship skills in their crate. MIT OR Apache-2.0, led by Niko Matsakis (BDFL
per its governance doc), v0.5.1 released 2026-10-01, pre-1.0 with breaking minors, 426 stars, 57 open issues.

**Trust surface (agent report, README items re-checked).** `auto-update` defaults to `on` (runs `cargo install` and
re-execs); hook scope defaults to global (registers in the home directory); the default registry
`symposium-dev/recommendations` is trusted without asking and lists about 8 plugins; plugins can run hook scripts and
`install_commands` shell. Open issue #200 (user-filed, unanswered) claims unverified crate downloads and prompt
injection through auto-updated skills; the maintainers' tenet is "avoid exposing users to fresh risk". Silent-failure
issues: #290, #291, #369. Session-start sync race: #344.

**Overlap with us.**

| Area                  | Symposium                                          | Us                                           | Verdict                                              |
| --------------------- | -------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Packaging             | loose files per host, no authored-once packages    | neutral `plugins/` compiled to native packs  | ignore; its RFD proposes compiling, not begun        |
| Selection             | core strength: dependency-graph predicates         | prose Stack packs table, repo-root files    | borrow the predicate idea; consuming it is Rust-only |
| Hooks                 | one binary translates 5 events at runtime          | compile-time event map                       | borrow its host delivery table as a check            |
| MCP                   | predicate-gated, written to host config            | in packages or by the installer              | ignore                                               |
| Host setup            | `init` writes global hooks                         | npx installer owns settings, plugins, MCP    | do not run both: both write host settings            |

**Comparables.**

- Agent Plugins spec 1.0.0 ([spec](https://agent-plugins.org/specification)): a `plugin.json` (closed schema) plus
  `skills/` and `mcp.json`. Hooks, commands, agents, rules and LSP are deliberately out ("too client-specific",
  Design Decisions); client features go under reverse-domain `extensions`. Steering committee on the home page:
  Amazon, Cursor, Microsoft, OpenAI, Vercel. Symposium's RFD says Codex CLI and Copilot CLI read it natively
  (their claim; not verified by us).
- Microsoft APM ([README](https://github.com/microsoft/apm)): `apm.yml` plus lockfile; `apm install` deploys skills,
  hooks and MCP to about 10 hosts. Closest functional rival to our installer. Not read by the main session.
- vercel-labs/skills ([commands](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)): skills only;
  `experimental_sync` pulls skills that npm dependencies ship (the npm analogue of Symposium's idea). Telemetry on by
  default. Not read by the main session.
- Agent Skills spec ([agentskills.io](https://agentskills.io/specification)): the shared `SKILL.md` format.

**Not checked:** Symposium's runtime behaviour, the contents and licences of the registry's plugins, whether Codex or
Copilot natively read Agent Plugins, security records of APM and vercel skills.

**Follow-up (2026-11-03), after the user said they expected Symposium to provide documentation for Rust crates.**
Fetched this session:

- The default registry [symposium-dev/recommendations](https://github.com/symposium-dev/recommendations) lists seven
  plugin folders (`assert-struct`, `codspeed`, `dial9`, `error-battery-pack`, `rtk`, `rust`, `toasty`), 51 commits,
  20 stars. None is a crate this repo's Rust crates depend on (`rmcp`, `reqwest`, `azure_devops_rust_api`, and so on).
  Folder names only; their contents were not read. Other crates are covered only if their authors ship skills.
- [`cargo agents crate-info`](https://symposium.dev/reference/cargo-agents-crate-info.html) is agent-facing: it fetches
  a crate's source and returns the extracted source path plus the crate's available skills. It supplies source and
  author-written skills, not generated API documentation.
- Context7, already in the dead-skills bundle, resolves `rmcp` (`/websites/rs_rmcp_rmcp`, 5655 snippets, High
  reputation) and `reqwest` (`/websites/rs_reqwest`, 7638 snippets, High; `/seanmonstar/reqwest` lists v0.12.9 and
  v0.13.x). Resolution only; answer quality was not tested.

## Options

<!-- Each decision: options offered, recommendation, what the user picked. -->

## Plan review

<!-- Round N: findings, the user's decision on each, what changed. -->

## Tasks

<!-- One line per task: `Task <N>: base <sha>`, untracked at start: <files or none>, then `files clean` or
`deviation` (see Deviations). -->

## Rulings

<!-- Calls the build made on its own (not deviation-class), one line each, as they are made. -->

## Deviations

<!-- Decisions that go to the user: what, why the plan doesn't hold, options with a recommendation, the
user's decision. -->

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict

<!-- The user's, at Finish: worked as a whole: yes | no; clean: yes | no. -->
