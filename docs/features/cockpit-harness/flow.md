---
flow: feature
phase: execute
now: Slice 1 (Linux, Tasks 1-13) complete, final-reviewed, and fixed. Task 14 (Windows) deferred — no hardware
  available. Finishing the branch next: Run verdict, then superpowers:finishing-a-development-branch.
---

# Cockpit harness: flow

## Request

> Hey building on feat/flow-cockpit that currently builds the cockpit I would like to look into extending it to show
> actual claude code windows in the ui. So like a proper ai harness. Would this be possible? how to do it? also a more
> or less capuslated claude would be nice so the harness is able to dictate what skills, plugins etc are running for
> this session?

## Artifacts

- Spec: [spec.md](spec.md) (builder check, grill rounds 1-2, and a plan-review reopening folded in, 2026-10-31)
- Plan: [plan.md](plan.md) (14 tasks, 2 slices, self-reviewed and plan-reviewed 2026-10-31)
- ADRs: [0007](../../adr/0007-flow-cockpit-hosts-claude-sessions.md) (supersedes part of 0005)
- Glossary: `GLOSSARY.md` § Flow cockpit (Flow cockpit redefined, Hosted session, Run bar)

## Gates

- Gate 1, spec approved: 2026-10-31, "Yes, approve the spec"
  - Reopened 2026-10-31: plan review round 1 found the session-control boundary isn't fully enforced yet (finding
    F1); spec.md's Session control boundary section now records the residual risk and how Task 4 narrows it.
    Approved to proceed on that basis (user, "apply all your recommendations").
- Gate 2, plan approved: 2026-10-31, "Approve, subagent-driven", execution: subagent-driven

## Skipped

## Grounding

Cockpit as built on feat/flow-cockpit (explorer, 2026-10-29; paths under `crates/flow-cockpit/`):

- **Watch-only by design.** `docs/features/flow-observability/spec.md:49-50` makes interacting with Claude a non-goal
  (no answering, no starting/resuming, no typing); `spec.md:61-62` anti-goal: the app never writes to a repo or to
  Claude Code's files; `spec.md:77` the user's terminal setup stays; `spec.md:81-85` rejected "a cockpit hosting Claude
  Code in embedded terminals"; ADR 0005 records the same. This feature reverses those: it needs its own ADR
  superseding the relevant part of 0005, and the glossary's "_Avoid_: harness" on Flow cockpit changes.
- **Build state.** flow-observability is in Task 11 of 13 (`flow.md` `now:`); Task 12 (repository views, trust) and
  Task 13 (Windows release, installer) not started. The cockpit README says Linux-only "for now".
- **Shell.** `app/Cargo.toml`: tauri =2.12.5, no Tauri plugins, no tokio, no pty crate. One window `main`
  (`tauri.conf.json`), CSP `default-src 'self'; script-src 'self' blob:; connect-src ipc: http://ipc.localhost`,
  capability `core:default` only. Nine `#[tauri::command(async)]` reads (`app/src/commands.rs:113-171`); backend pushes
  `changed`/`views-changed` via `emit` (`main.rs:107-108`); a 2 s poll thread (`poll.rs:437-441`) is the only index
  writer. Module comment `main.rs:1-3`: "It reads and never writes".
- **Views.** `app/shell/runtime.js` loads each view as a Blob `import()`; views are type-stripped TS extensions
  (`app/src/strip.rs`, rejects value imports), default ones in `extensions/{list,run,docs,activity}`, user ones in
  `<config_dir>/extensions`. Contract in `app/shell/api.d.ts`: slots `list|run|run-tab|doc|session`, a read-only
  `DataApi`, rendering only through `Blocks` (markdown, mermaid, taskGraph, diff, stepper, card), "a view never sets
  innerHTML". Vendored: mermaid, marked, DOMPurify. No terminal emulator.
- **Sessions in the model.** A Claude session is a transcript file, no process (`core/src/index/entries.rs:72-78`);
  linked to a run by the flow.md files its Edit/Write calls touched (`index/links.rs`). Live waiting state comes from
  the capture (`core/src/activity/capture.rs`), written by `plugins/opt-in/flow-cockpit/hooks/` (async command hooks
  on SessionStart/End, UserPromptSubmit, Stop, SubagentStart/Stop, Notification, PermissionRequest, and
  Pre/PostToolUse on AskUserQuestion) to `<state>/flow-cockpit/capture/<session_id>.jsonl`.
- **Ship.** Linux via Nix (`flake.nix:118-160`, wrapGAppsHook3, webkitgtk_4_1); CI `flow-cockpit.yml` builds on
  Windows too; no release artifact yet.

Claude Code 2.1.312, `claude --help` read in this session (2026-10-29):

- Scoping a session: `--setting-sources user,project,local` (load only the named ones), `--settings <file-or-json>`
  (adds), `--plugin-dir` / `--plugin-url` (session-only plugins), `--mcp-config` + `--strict-mcp-config`, `--agents`,
  `--allowedTools`/`--disallowedTools`/`--tools`, `--permission-mode`, `--system-prompt`/`--append-system-prompt`,
  `--disable-slash-commands` (all skills and commands off), `--model`, `--effort`, `--session-id`, `-n/--name`.
- Clean slates: `--safe-mode` ("all customizations (CLAUDE.md, skills, installed plugins, hooks, MCP servers, …)
  disabled", auth normal); `--bare` (skips hooks, plugin sync, CLAUDE.md discovery; auth strictly `ANTHROPIC_API_KEY`
  or apiKeyHelper, "OAuth and keychain are never read"); `--restricted` (ignores user/project/local settings, drops
  code-running tools).
- Headless: `-p` with `--input-format stream-json` / `--output-format stream-json`, `--include-partial-messages`,
  `--include-hook-events`, `--forward-subagent-text`, `--permission-prompts host|none` ("the SDK host or
  --permission-prompt-tool"), `--replay-user-messages`.
- Not yet known: whether `--safe-mode` + `--plugin-dir` gives "only these plugins", and how installed plugins can be
  narrowed without `--safe-mode` (`enabledPlugins` in `--settings`?). Left for prior art / a spike.

## Prior art

Agent report, 2026-10-29 (sources fetched in that run; web search partly down, so Conductor, Sculptor, CCManager and
the IDE extensions are unverified and left out):

- **A. Embedded PTY + terminal emulator (real TUI):** [Zed Terminal Threads](https://zed.dev/docs/ai/terminal-threads)
  (the CLI keeps its own auth, MCP, skills; Zed profiles don't apply), [Claude Squad](https://github.com/smtg-ai/claude-squad)
  (tmux + worktree per agent), [Nimbalyst](https://github.com/Nimbalyst/nimbalyst) (Electron, "embedded ghostty
  terminal"; hosting unverified). Blocks: [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) (xterm.js ↔
  PTY, `spawn`/`onData`/`write`), [portable-pty](https://docs.rs/portable-pty/latest/portable_pty/) (wezterm's crate,
  several Windows PTY backends). Full fidelity, mods keep working; prompts and questions seen only through hooks;
  input only as keystrokes.
- **B. Headless stream-json / Agent SDK + own chat UI:** [opcode](https://raw.githubusercontent.com/winfunc/opcode/main/src-tauri/src/commands/claude.rs)
  (Tauri 2, AGPL: `-p … --output-format stream-json` per turn, `--resume`, skips all permissions, no question UI).
  [SDK user input](https://code.claude.com/docs/en/agent-sdk/user-input): `canUseTool` handles approvals and
  `AskUserQuestion` (`updatedInput.answers`), may stay pending; [SDK TS reference](https://code.claude.com/docs/en/agent-sdk/typescript):
  `agent_id`/`parent_tool_use_id`, `task_progress`, `interrupt()`, `setPermissionMode()`, `getContextUsage()`; options
  `settings`, `plugins`, `mcpServers`, `skills`, `systemPrompt`. SDK is TS/Python only (no Rust found); from Rust it's
  the CLI's `control_request`/`control_response` stdin protocol, field-by-field version-gated. Rebuilds the chat
  surface and slash commands; plugin mods don't draw.
- **C. ACP adapter:** Zed's Claude Agent via [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)
  (Node wrapper over the SDK; [external agents](https://zed.dev/docs/ai/external-agents)). Standard protocol, but a
  Node runtime dependency and only what the adapter exposes. No Tauri app found using it.
- **No open-source app found** combining an embedded TUI, subagent dashboards and per-session config.
- **Config control** ([cli-reference](https://code.claude.com/docs/en/cli-reference), [headless bare mode](https://code.claude.com/docs/en/headless),
  [SDK claude-code-features](https://code.claude.com/docs/en/agent-sdk/claude-code-features), [settings precedence](https://code.claude.com/docs/en/settings),
  [env-vars](https://code.claude.com/docs/en/env-vars), [managed-settings](https://code.claude.com/docs/en/managed-settings)):
  restrict = `--bare` (API key only), `--safe-mode` (does `--plugin-dir` survive it? unverified), `--setting-sources`
  (managed policy and `~/.claude.json` always read), `--strict-mcp-config`, `--tools`, `--disable-slash-commands`,
  SDK `skills`; add only = `--plugin-dir`, `--mcp-config`, `--agents`, `--append-system-prompt`, `--add-dir`,
  `--settings` (merges; precedence managed > `--settings` > local > project > user); `--allowedTools` auto-approves,
  doesn't restrict. `CLAUDE_CONFIG_DIR` moves settings, history and plugins (credentials there: unverified). Managed
  settings lock things but are machine-wide files.
- **Pitfalls:** [fullscreen](https://code.claude.com/docs/en/fullscreen) uses the alternate screen and mouse tracking
  (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`, `CLAUDE_CODE_DISABLE_MOUSE=1`); [terminal-config](https://code.claude.com/docs/en/terminal-config):
  on Windows Backspace as `^H` reads as Ctrl+Backspace unless `TERM_PROGRAM=mintty`/`TERM=cygwin`;
  [legal](https://code.claude.com/docs/en/legal-and-compliance): unmodified binary, no intermediating usage, Agent SDK
  builders "should use API key authentication", third-party apps may not route requests through subscription
  credentials; an end user running the unmodified binary with their own subscription is fine. A fits cleanly; B on a
  subscription is a grey area. Can't use the Claude Code name or logo in the product's name.

## Brainstorm answers

- 2026-10-29: "yes, the first step was read only. I like the first step and want top build onto it. At the time it
  seemed to risky to do both at one. I wantet to brainstorm and map the plan since the general technologie and
  architecture already stands. Goal would be to work from the Cockpit with claude. So a fully integrated per say"
  → the cockpit becomes where the user works with Claude (not a launcher next to the terminal); builds on the
  flow-observability app.
- 2026-10-29: "I dont want to engineer a whole new ai harness and I know antropic doesnt like pölan useres to use
  other harnesses. So in some way we need to use claude code. But im open for letting us draw the conversations on
  our own as long as we dont loose features claude code has" → hard constraints: Claude Code itself runs the agent,
  on the user's plan; no feature of Claude Code may be lost. Drawing the conversation is allowed only under both.
- 2026-10-29: "would it be possible to switch between projects? So I first start a flow in dead.claude skills it
  works then go to nix config do there something and come back to claude skills?" → sessions in several projects at
  once; switching the cockpit's project keeps the others running and their terminals intact.
- 2026-10-29: asked whether a session survives closing the cockpit. "cockplit closes, claude code closes" → sessions
  are child processes of the window; no background helper; picking up again is Claude Code's own resume.
- 2026-10-29: start proposal (new session per project/worktree; "continue" on an open flow run pre-typing
  `/flows:<conductor> <slug>`; resume a listed session unless it is live elsewhere; outside sessions stay watch-only;
  closing with a working session asks first: Claude's call). User: "I would also want to select the effort and the
  model to use. I also would like to type the frist prompt to claude" → the start form has folder, model, effort and a
  first prompt. `claude --help` (2.1.312): `[prompt]` positional starts an interactive session with it, `--model`,
  `--effort low|medium|high|xhigh|max`, `-w/--worktree [name]` creates a worktree.
- 2026-10-29 (visual companion, `workspace-layouts.html`: A terminal + agents column, B grid conductor|agent|agent,
  C today's cockpit with a Session tab beside the task graph; plus the start form). Clicked A in the browser, then:
  "start form looks good. Im leaning into C but I would like to easily see what subagents and commands do" → start
  form approved as shown (project, folder/worktree, model, effort, first prompt, the command shown); layout C with
  subagents' and commands' activity easy to see. Background shell output lives in Claude Code's temp `tasks/` folder
  (this session's: `/tmp/claude-1000/<project>/<session>/tasks/<id>.output`), not a documented interface.
- 2026-10-29 (`layout-c-activity.html`: C1 terminal | "Now" column, C2 terminal | graph + timeline; no click). User:
  "its just I see that is doing something but I cant see the output" → the point is the output itself (command
  stdout/stderr, tool results, an agent's report), not a list of what is running.
- 2026-10-29 (`layout-c-output.html`: Session tab = terminal | output pane; chips pick main/agent/background
  command, "follow latest"; finished tool calls with full results, agent report at the end; background commands live,
  foreground output on finish, streaming earlier unknown). User: "I like that one. COuld we shouw somewhere on which
  task we are?" → picked; next screen `layout-c-task.html` adds a run bar (phase stepper, task segments, task in
  progress, flow.md `now:` line), task numbers on agent chips, phase/task in the left list.
- 2026-10-29: "Thats great :)" → layout settled: `layout-c-task.html`.

## Options

### Surface

Offered 2026-10-29 (sources in Prior art): A real TUI in a cockpit pane (PTY + xterm.js) with the cockpit's views
around it (M); B cockpit-drawn conversation over stream-json/SDK (L+; loses slash commands, `/rewind`, plan-mode UI,
mods; SDK apps "should use API key authentication"); C = A plus cockpit-side answering of questions/permissions via
hooks later (needs a spike). Smallest: the cockpit only opens the user's own terminal with the encapsulated command
(S). Recommended A now, C as a later slice.

- **Picked A** (user, 2026-10-29): "Lets focus on A." B rejected (fails both hard constraints); C not ruled out,
  not in scope now.

### Subagents (2026-10-29)

User: "Would we have the option to show subagent sessions similar to claude desktop?" Claude Desktop
([desktop docs, "Watch background tasks" and "Arrange your workspace"](https://code.claude.com/docs/en/desktop#watch-background-tasks),
fetched 2026-10-29): a tasks pane lists subagents, background shells and workflows; clicking one shows its output in a
subagent pane, or stops it; panes are draggable. Answered: yes for seeing (subagent transcripts on disk + the capture;
the cockpit already tails them), no thinking text (empty on disk), no typing into a subagent (Claude Code has no such
thing outside agent teams), stopping one stays in the terminal's own agent panel.

### Encapsulation (2026-10-29)

Asked what decides a session's skills and plugins (a saved setup, the flow, the project). User: "lets not do that for
now. Maybe will do that later" → out of scope for this feature; sessions start with the user's normal Claude Code
config. The launch path should not make adding it later hard (a non-goal, not an anti-goal).

## Plan review

**Round 1** (2026-10-31). Three `general-purpose` subagents reviewed the self-reviewed 15-task plan against
`spec.md`, the real `crates/flow-cockpit/` code and the ADRs, one angle each (`plugins/flows/skills/feature-flow/
references/plan-review.md`): Correctness (`anthropic/claude-fable-5-1`, session `ses_e6cb3083dffeEXdYUqatsNKbmn`), Fit
(`anthropic/claude-opus-5-5`, session `ses_e6cad0e1fffeY2aW26qHO5LB3D`), Simpler (`anthropic/claude-sonnet-5-5`,
session `ses_e6cacf369ffe4WDWlF7tNBsGPg`). 27 raw findings merged into 21 (duplicates folded; none dropped as
untraceable — every finding cites a real `file:line` or a doc section fetched in-session). User's decision on all:
**apply every recommendation** (2026-10-31, "apply all your recomendations"). The plan went from 15 tasks to 14:
dropped the pending-session stub (F10), added "Lock session control behind the app's own boundary" (F1, new Task 4)
and "A tool call's full result, and an agent's report" (F2, new Task 9), merged Ship Slice 1 into Resume (F20, new
Task 13) and Ship Slice 2 into the ConPTY spike (F20, new Task 14), and reordered background-output before chips
(F13). Task numbers below are the plan's numbers _after_ this round.

| #                  | severity   | finding                                                                                                                                                                  | changed                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1                 | blocking   | No view is actually kept off session control: `withGlobalTauri: true`, no `AppManifest`                                                                                  | New Task 4; spec.md's Session control boundary section reopened with the residual risk recorded                                                                                                                                                                                                                         |
| F2                 | blocking   | Goal 5 has no tool-result reader; Task 8's subagent-chip mechanism returned null                                                                                         | New Task 9 (tool-result reader); chips (Task 10) now filter one `session()` call by `agent`, not a separate fetch                                                                                                                                                                                                       |
| F3                 | blocking   | `replaceChildren` on every poll-triggered redraw destroys terminal state; Ctrl+R stolen                                                                                  | Task 7 rewritten: terminal hosted outside `#app`, position-synced to a placeholder, hidden not destroyed; `reloadKey` skips the terminal; `hosted_sessions()`/`scrollback` rehydrate after reload (Task 3)                                                                                                              |
| F4                 | blocking   | `background_tasks_in(turns)` can't see `run_in_background`; no real output-path resolver                                                                                 | Task 8 rewritten to list `tasks/*.output` files directly, no transcript scan; new `claude_tmp_dir` resolver with Linux/Windows tests                                                                                                                                                                                    |
| F5                 | should-fix | Resume has no cwd; Claude Code reuses the resumed session's original id, plan generated a new one                                                                        | `HostedSessions::resume(cwd, id, ...)` keyed by the given id (Task 3); Task 13's resume action passes the session's own index-known cwd/id                                                                                                                                                                              |
| F6                 | should-fix | Close confirmation needs a nonexistent dialog plugin; wrong event; wrong struct for status                                                                               | Task 12 rewritten: `WindowEvent::CloseRequested`+`prevent_close()`, a plain `<dialog>`, `needs_confirmation(hosted, shared)` takes both                                                                                                                                                                                 |
| F7                 | should-fix | `kill()` was SIGKILL-only; no grace period for Claude Code's own exit path                                                                                               | Task 3's `kill()` now stops gracefully first, SIGKILLs after a timeout                                                                                                                                                                                                                                                  |
| F8                 | should-fix | Bare `-w` could swallow the first prompt; `Option<String>` matched as `Some(Some)`/`Some(None)`                                                                          | Task 2: dropped the unnamed-worktree case entirely (not in the spec's 3 folder options); `--` always precedes the prompt                                                                                                                                                                                                |
| F9                 | should-fix | Wrong date type (`chrono` vs `jiff`), missing `uuid` in core, wrong `mod` visibility, wrong package name in test commands                                                | Fixed throughout Tasks 2-3; all `cargo test -p flow-cockpit` (not `-app`)                                                                                                                                                                                                                                               |
| F10                | should-fix | Pending-session stub in the wrong module, and likely unneeded                                                                                                            | Dropped (Task 4 old); Task 5 navigates straight to the session route                                                                                                                                                                                                                                                    |
| F11                | should-fix | Task 1's spike can't answer its own questions; discards work Tasks 3/6 redo; no commit                                                                                   | Task 1: runs in a short-lived branch of the real `app/` crate, not a from-scratch window; ends with a commit step                                                                                                                                                                                                       |
| F12                | should-fix | New commands/types skip real wiring points (`generate_handler!`, `data`, bindings, `tsconfig`)                                                                           | Added to Global Constraints as a standing rule, and to each task's Files section                                                                                                                                                                                                                                        |
| F13                | should-fix | Chips (old Task 8) used Task 9's output without declaring the dependency                                                                                                 | Reordered: background-output is now Task 8, chips Task 10, depends on it                                                                                                                                                                                                                                                |
| F14                | should-fix | `claude` may not be on `PATH` for a GUI-launched app                                                                                                                     | Task 1 Step 4 checks this and records a resolution                                                                                                                                                                                                                                                                      |
| F15                | should-fix | `FlowRunSummary.conductor` isn't the skill name; `run_for_session` proposed in the wrong module                                                                          | Task 5: a conductor-to-skill mapping table; Task 11: `findLinkedRun` scans existing `flowRun().sessions`, no new Rust command                                                                                                                                                                                           |
| consider (F16-F21) | consider   | IPC byte format, dash-prefixed prompt, preview/real id mismatch, `run_for_session` duplication, near-empty ship tasks, no stated reason for not using `tauri-plugin-pty` | Channel-based output (Task 3); `--` before prompt (Task 2, also fixes F8); one client-generated id reused for preview and launch (Task 5); `findLinkedRun` client-side (Task 11, same fix as F15); Ship tasks merged into Resume/ConPTY (Tasks 13-14); one sentence added to Tech Stack on `portable-pty` vs the plugin |

## Tasks

Execution: subagent-driven, workspace `.superpowers/sdd/plan-cockpit-harness/` (ledger, briefs, reports, review
packages). Pre-flight scan done 2026-10-31 (full table in the ledger); findings and rulings below.

Files check (per flow-rules.md): `git diff --name-only <base> <head>` for every task's full commit range, compared
against its Files list plus whatever this section's Deviations/Rulings already approved. All 13 completed tasks:
**files clean** — every changed file was either on the task's own Files list, or a Ruling/Deviation entry above
already accounts for it (none found a file outside both).

- Task 1: base f00679d, head 3cd0a64 — `findings.md` only. Files clean.
- Task 2: base 3cd0a64, head 0763289 — core crate's `launch.rs`/`mod.rs`/`lib.rs`/`Cargo.toml`/`Cargo.lock`. Files
  clean.
- Task 3: base 0763289, head ee046d1 — `pty.rs` (new), `main.rs`, app `Cargo.toml`/`Cargo.lock`. Files clean
  (`capabilities/default.json` correctly left untouched, per the task's own rewritten text).
- Task 4: base ee046d1, head 2373744 — `tauri.conf.json`, `boot.js`+test, `build.rs`, `capabilities/default.json`,
  vendored `@tauri-apps/api`/`tslib` files, `THIRD_PARTY.md`, `.gitignore`, `main.rs` (manifest wiring). Files clean
  (vendoring and `.gitignore` entries per the Deviation/Ruling above).
- Task 5: base 2373744, head 6d747a6 — `start-form.js`+test, `commands.rs`, `pty.rs` (the `into_spec` extraction),
  `main.rs`, `build.rs`, `capabilities/default.json`, `boot.js`+test, `runtime.js`+test, `api.d.ts`, `bindings.rs`,
  `bindings/LaunchSpecInput.ts`, `tsconfig.json`. Files clean (`bindings.rs`/`tsconfig.json` per the Deviation/Ruling
  above).
- Task 6: base 6d747a6, head e23cfa1 — `session-pane.js`+test, `index.html`, vendored xterm files (incl. `.d.mts`),
  `tsconfig.json`, `THIRD_PARTY.md`. Files clean (`.d.mts` additions per the Ruling above).
- Task 7: base e23cfa1, head a8dee38 — `runtime.js`+test, `boot.js`. Files clean.
- Task 8: base a8dee38, head 2b9b2f4 — `background_output.rs` (new), `paths.rs`, `main.rs`, `build.rs`,
  `capabilities/default.json`, `bindings.rs`, `api.d.ts`, `runtime.js`, `bindings/BackgroundTask.ts`. Files clean.
- Task 9: base 2b9b2f4, head bf766f7 — `transcript.rs`, `commands.rs`, `main.rs`, `build.rs`,
  `capabilities/default.json`, `api.d.ts`, `runtime.js`, `activity.ts`, `views.test.ts`. Files clean.
- Task 10: base bf766f7, head b3c7231 — `session-chips.js` (new), `runtime.js`+test. Files clean.
- Task 11: base b3c7231, head 5b90560 — `run-bar.js` (new), `runtime.js`+test. Files clean.
- Task 12: base 5b90560, head 1166fda — `pty.rs`, `main.rs`, `build.rs`, `capabilities/default.json`,
  `close-confirm.js` (new), `boot.js`+test, `core/src/index/status.rs`, `core/src/index/mod.rs` (the `WORKING_SECS`
  export, per the Deviation above). Files clean.
- Task 13: base 1166fda, head 5567f04 — `runtime.js`+test, `boot.js`, `pty.rs`, `core/src/index/entries.rs`,
  `core/src/index/mod.rs`, `core/tests/index.rs`, `flake.nix` (the `nativeCheckInputs` fix, per the Ruling above).
  Files clean.

Task 14: not started — see Deviations ("Task 14 needs a real Windows machine, not available in this environment").

## Rulings

- 2026-10-31, Task 4: `crates/flow-cockpit/app/permissions/autogenerated/` (one toml per command, written by
  `tauri-build` once an `AppManifest` exists) added to `.gitignore`, matching the existing
  `crates/flow-cockpit/app/gen/` entry for the same kind of build-generated, non-source output. Mechanical — no
  judgment call. Cost if wrong: an untracked folder shows up in `git status` forever; trivial to revert.
- 2026-10-31, Task 4: vendored `@tauri-apps/api` 2.12.4 (npm's newest 2.x; the `tauri` Rust crate is 2.12.5, which
  npm doesn't have a matching release for) — accepted as the natural reading of "vendor @tauri-apps/api", same as
  Task 1 pinning whatever was latest-stable at spike time. Also vendored `tslib.es6.js` (an un-overridable import of
  `core.js`'s own ESM build) and both `LICENSE`/`LICENSE-Apache` texts (the package is dual Apache-2.0 OR MIT, not
  MIT-only as I'd assumed) — both are mechanical consequences of the vendoring decision already made, not separate
  judgment calls. Cost if wrong: none found; these are factual, not choices.
- 2026-10-31, Task 13 (plan maintenance, before dispatch): found the same problem the user already decided for Task 5
  ("Task 5's brief would put session-spawning on the view-visible DataApi") also applies here — the brief's "the list
  view's resume action" would put `resumeSession` inside `extensions/list/`, a loaded view, same rule violation.
  Applying the already-decided principle (session control never reaches any view), not asking again for the
  principle itself, but the specific placement is my own call: moved "resume" from the list view to the `session`
  route's screen, as a shell-rendered button alongside the (unmodified) Activity view, reusing Task 7's established
  pattern rather than inventing a new one (e.g. overlaying buttons on list rows). Cost if wrong: a UI placement
  choice, not a security one — cheap to move again at the final review if you'd rather it live elsewhere.
- 2026-10-31, Task 5: implementer touched `app/src/bindings.rs` (not in the Files list) to add a `TS` derive and
  export for `LaunchSpecInput`. Accepted without a fresh ask: `LaunchSpecInput` crosses to views through
  `data.previewCommand` (read-only, view-visible), so the Global Constraint "every type that crosses to the views
  derives TS" already requires this — `bindings.rs` is simply where this codebase's existing convention registers
  that. No new judgment call, unlike the `shell`/`data` question. Cost if wrong: a stray/incorrect binding export,
  cheap to catch in task review.
- 2026-10-31, Task 6: added `app/shell/vendor/xterm.d.mts`/`addon-fit.d.mts` (not in the Files list) — minified
  vendored `.mjs` files need a hand-written declaration file for `tsc` to check code that imports them, same pattern
  already used for `marked.esm.d.ts` (noted by Task 4's reviewer). Mechanical, no judgment call.
- 2026-10-31, Task 8: the plan's text said `libc` (for `getuid()`) is "already pulled in transitively... just use it
  directly," but Rust doesn't allow calling a crate that isn't a direct dependency — the plan's phrasing was
  technically imprecise. Rather than add `libc` to `app/Cargo.toml` (not in the task's Files list), the implementer
  wrote a one-line `unsafe extern "C" { fn getuid() -> u32; }` with a SAFETY comment. Confirmed this matches existing
  house style: `app/src/main.rs:263` already has its own `unsafe extern "system" { ... }` block for a Windows call,
  so a small raw-FFI block for one platform syscall is an established pattern here, not a new approach. Accepted as
  a mechanical implementation choice, not a deviation. Also accepted: `claude_tmp_dir`'s return type
  (`Result<PathBuf, NoHome>`, matching this file's other resolvers) where the brief's two sections disagreed
  (`Result` vs. bare `PathBuf`) — resolved by following existing convention, no judgment call beyond consistency.
- 2026-10-31, Task 10: `session-chips.js` (a file this task creates) exports `MAIN`/`BACKGROUND`/`taskOf` beyond the
  plan's three named functions, and `runtime.js` gained a "Follow latest" toggle plus a per-session-id `picks` Map
  persisting the chosen chip across redraws, neither named by the brief's "auto-follow whichever has the newest
  activity" line. Both confined to files already in this task's list, neither touches `shell`/`DataApi`/`ViewContext`
  or any other task's interface — private implementation detail filling in an interaction the brief described only at
  the outcome level ("auto-follow"), matching the deviation rule's own carve-out ("private names and small cleanups
  inside the task's own files aren't deviations"). Accepted.
- 2026-10-31, Task 9: the brief assumed `tool_result` could use `tool_input`'s same "seek to one recorded offset"
  approach; the transcript cache's `Lines` model (`mod.rs`) only records whether a tool call's result failed, not the
  result line's own offset, and the result lives in a later `user` line than the call's own `assistant` line. The
  implementer instead finds the call's line (same as `tool_input`) and scans forward for the matching `tool_result`
  line, via a new private `result_in` helper beside `input_in`. Confined entirely to `transcript.rs` (already in the
  Files list); `tool_result`'s own public signature is unchanged from the brief (`Option<String>`); `mod.rs`/`Lines`
  untouched. Accepted as an internal implementation detail, not a deviation — the brief's "same cache" wording
  described an assumed mechanism, not a promised interface.
- 2026-11-01, Task 13: `flake.nix` edited to add `nativeCheckInputs = [pkgs.util-linux]` (for `setsid`), because
  `nix build .#flow-cockpit`'s checkPhase actually failed without it — Task 4's
  `graceful_kill_does_not_orphan_a_child_process` test needs `setsid` and the build sandbox's PATH lacked it. Not the
  system-library gap `flake.nix`'s conditional Files-list entry anticipated, but the same kind of thing: a real,
  concrete build-only gap found while actually running the build this task exists to ship. Test-only dependency
  (`nativeCheckInputs`, not a runtime dependency of the shipped app), additive, confined to the one file already
  conditionally in this task's list. Accepted.
- 2026-10-31, Task 2 (ledgered at the time in the SDD workspace, copied here at Finish per flow-rules.md): plan.md's
  Task 2 and Task 9 test commands said `cargo test -p flow-cockpit`, but the core crate's real package name is
  `flow-cockpit-core` — those commands would have silently run the wrong crate and never touched the new tests. Fixed
  both tasks' Step 2/4 commands in plan.md to `-p flow-cockpit-core`. Mechanical correction, no judgment call. Cost if
  wrong: tests silently not run; cheap to notice (zero new tests reported) and fix.
- 2026-10-31, Task 5 (copied here at Finish): `app/shell/tsconfig.json` touched (one line, adding `start-form.js` to
  `include`) — required for `tsc` to actually check the new file; not in Task 5's Files list, but mechanical and
  low-risk. Cost if wrong: a file silently excluded from typechecking; cheap to catch.
- 2026-10-31, Task 7 (copied here at Finish), three items: `ShellApi`/`DataApi` extensions left as local typedefs in
  `boot.js`/`runtime.js` rather than `api.d.ts` (not in the Files list) — same pattern as Tasks 5/6's small additions;
  `boot.test.mjs` touched (one assertion, adding `'session-exited'` to boot's listened-event list) — a necessary,
  direct consequence of the brief's own required `session-exited` listener; `createRuntime` gained two new options
  (`hosted`, `mountPane`) — internal to `runtime.js` (already in Task 7's Files list), never reaches `ctx` or any
  view, the natural private implementation of the brief's own already-specified routing/position-sync behavior. All
  three: no judgment call beyond mechanical necessity, cost if wrong is cheap to catch/revert.
- 2026-10-31, Task 12 (copied here at Finish): `boot.test.mjs`'s exact-events assertion updated to include
  `'close-requested'` — same mechanical pattern as Tasks 4/7's analogous `boot.test.mjs` touches, a direct consequence
  of `boot.js`'s own required new listener.
- 2026-11-01, final-review fix wave: 5 Minor findings in the fix diff itself (none deviation-class), ruled on
  directly rather than looping again (no second fix wave per process): a hidden pane/xterm instance from an abandoned
  failed launch (user cancels instead of retrying) leaks for the window's life — accepted, no correctness effect;
  `printed_lately`'s 2-minute window can make close-confirmation fire somewhat more often — accepted, can only make
  the dialog stricter, matches the "fail closed" intent; `plain()`'s ANSI-stripping for background-output display
  misses a few rare escape sequences — accepted, cosmetic only, underlying data untouched; opened tool-call results
  kept per session for the window's life, unbounded — accepted for this slice; the fixed Start-session button's
  placement wasn't checked visually in a real window (no GUI tooling here) — accepted, flagged for a human visual
  check. Cost if any is wrong: all are cosmetic or bounded-memory concerns, cheap to revisit in a later pass.

- 2026-10-31, pre-flight: `start_session`'s Tauri command gains `cols: u16, rows: u16` params (Task 3) — the registry
  method it calls required them and nothing else supplied them.
- 2026-10-31, pre-flight: every task adding a Tauri command after Task 4 (5, 8, 9, 12) also updates `app/build.rs`'s
  `AppManifest` command list, not only the capability file — without it, the new command's `allow-<command>`
  permission doesn't exist for the schema to validate. Added to each task's Files and to the Global Constraints.
- 2026-10-31, pre-flight: Task 9's "the existing Activity view" named precisely:
  `crates/flow-cockpit/extensions/activity/activity.ts`'s `toolRow` fold, `extensions/tests/views.test.ts`.

## Deviations

### Task 3's implementation needed several real interface changes from the brief

Status: open

What: Task 3 (hosted session registry/PTY lifecycle) passed its tests and clippy, but the implementer found, working
against the real `tauri` 2.12.5 API, that the brief's exact interfaces couldn't be built as written in five places:

1. **`tauri::ipc::Channel<T>` can only be a command _parameter_, never part of a return value** — this is how Tauri's
   own Channel IPC pattern works (the frontend creates the channel object and passes it into the `invoke()` call); the
   brief's text ("handed back alongside the id from `start_session`/`resume_session`") described an impossible
   mechanism. Fix applied: `start_session(input, cols, rows, on_output: Channel<InvokeResponseBody>)` and
   `resume_session(cwd, id, cols, rows, on_output: Channel<InvokeResponseBody>)` — both take the channel as an
   argument instead.
2. **A new `HostedSessions::subscribe(id, sink)` method and matching internal wiring**, not named anywhere in the
   plan. Needed because a `Channel` object doesn't survive a page reload — without some way to re-attach a live
   output stream to an _already-running_ hosted session (as opposed to starting a new one), Task 7's own
   `reload_rehydrates_hosted_sessions_from_the_backend` requirement has no path to work at all. Currently wired only
   internally (`start_session`/`resume_session` call `start`/`resume` then `subscribe`); not yet exposed as its own
   invokable Tauri command, which Task 7 would need.
3. **`scrollback` returns `Result<tauri::ipc::Response, String>`**, not the brief's bare `Response` — so an unknown
   session id is a reportable error rather than an empty/default response.
4. **`start_session`/`resume_session` return `Result<String, String>`**, not `Result<Uuid, String>` — the session id
   as a plain string over the Tauri boundary (matching how the brief already typed `resume_session`'s `id` _parameter_
   as `String`; avoids needing `uuid`'s `serde` feature).
5. **A session that exits stays registered (with its last output) until `kill_session` is called**; `ids()`/
   `hosted_sessions()` list only still-running ones. Not specified either way by the brief; the implementer's reason
   is that a session whose process dies moments after launch should still show its output/error rather than vanishing
   — which serves Review Focus item 1 ("the cockpit notices and shows it") — but it is a data-flow decision the plan
   didn't make.

Separately, **`capabilities/default.json` was left unmodified**, against the brief's own Files list, because adding
`allow-<command>` entries before `app/build.rs` has an `AppManifest` fails the build outright ("Permission
allow-start-session not found") — this matches Task 1's own confirmed finding ("Affects Task 4: nothing to change...
with a bare `tauri_build::build()` the spike's commands ran under `core:default` with no `allow-` entry"). Task 4's
plan text already adds every command's entry (including Task 3's) together with the `AppManifest` in one step, so
nothing downstream is actually blocked by this — flagging it here since it's still a file the task's Files list named
and didn't touch.

Why the plan doesn't hold: items 1-4 are forced by Tauri's real API, not a style choice; item 5 and the capabilities
deferral are judgment calls the plan's text didn't make, surfaced while building against the real crate.

Options:

- **Accept all five implementation changes as correct, and the capabilities deferral as confirmed by Task 1's own
  finding** — update plan.md's Task 3 (and the Architecture/Tech Stack mentions of the Channel pattern), and the
  Interfaces/Consumes sections of Tasks 5, 6, 7 and 13 (each constructs and passes a `Channel`, not expects one back;
  Task 7 additionally needs a `subscribe_session` Tauri command exposed, which isn't built yet) to match. (Recommended
  — items 1-4 aren't really choices, and item 5 serves an already-approved Review Focus item.)
- **Accept 1-4 and the capabilities deferral, but require exited sessions to auto-remove from the registry** instead
  of staying until `kill_session` — reject item 5 specifically.
- **Something else** — a different design entirely for output streaming/resubscription.

→ Recommendation: accept everything, and additionally decide now whether to expose `subscribe` as its own
Tauri command in Task 3 (completing the fix now, cleanest) or defer that specific addition to Task 6/7 (whichever
task actually needs to call it first).

**Status: decided 2026-10-31**: accept all five implementation changes and the capabilities deferral; expose
`subscribe` as its own Tauri command (`subscribe_session`) now, in Task 3, rather than deferring it. plan.md's Task 3
(interfaces, Files), Task 4 (command list), and Tasks 5, 6, 7, 13 (Channel-as-parameter, `subscribe_session` call on
mount) updated to match.

### Task 4's boot.js has no way to get invoke/listen once withGlobalTauri is off

Status: open

What: the brief said boot.js should "close over `tauri.core.invoke`/`tauri.event.listen` itself" once
`withGlobalTauri` is off. That assumed `tauri.core.invoke` would still be reachable somehow (e.g. `window.__TAURI__`
still existing for boot.js alone to read). In fact, turning `withGlobalTauri` off removes `window.__TAURI__` from the
page entirely — there's nothing left for boot.js to read, and this project has no bundler and doesn't vendor
`@tauri-apps/api` (the official JS package that implements `invoke`/`listen`). The implementer wrote boot.js's own
thin `invoke`/`listen` directly against `window.__TAURI_INTERNALS__` — Tauri's internal, undocumented IPC transport
(`ipc.invoke(cmd, args)`, and `listen` as `ipc.invoke('plugin:event|listen', {...transformCallback...})`, which is
what `@tauri-apps/api`'s own `listen()` does internally). Confirmed working in a real built app under Xvfb (see
`task-4-report.md`); tests and the capability boundary itself are unaffected either way.

Why the plan doesn't hold: the brief described a result ("close over it") without specifying a mechanism, and the
only mechanism that exists today (reading it off `window.__TAURI__`) is exactly what this task removes.

Options:

- **Accept the hand-rolled internals-based shim** (already built, tested, working). Risk: `__TAURI_INTERNALS__`'s
  shape is Tauri's own private implementation detail, not a documented, versioned public API — a future Tauri
  upgrade could silently change or remove it with no deprecation path, where `@tauri-apps/api`'s public functions are
  stable across versions.
- **Vendor `@tauri-apps/api`'s `core.js` and `event.js`** into `app/shell/vendor/`, matching this project's existing
  pattern for `marked`/`dompurify`/`mermaid` and Task 6's not-yet-done `xterm.js` vendoring — boot.js would import
  `invoke`/`listen` from there instead. Costs: pin a version, add a `LICENSE` entry to `THIRD_PARTY.md`, and a fix
  round to redo `boot.js`'s two functions (a small, low-risk change — the call sites in `runtime.js` don't change).
- **Something else.**

→ Recommendation: vendor `@tauri-apps/api` — it matches how every other third-party JS dependency in this app is
already handled, and avoids depending on an API surface Tauri itself doesn't promise to keep stable.

**Status: decided 2026-10-31**: vendor `@tauri-apps/api`. plan.md's Task 4 and Tech Stack updated; fix round
dispatched to Task 4's implementer.

### Task 5's brief would put session-spawning on the view-visible DataApi

Status: open

What: Task 5's implementer stopped before writing any code (NEEDS_CONTEXT, correctly — did not guess) because the
brief's literal instruction — add `previewCommand`/`startSession` to `runtime.js`'s `data` object — would put
`startSession` directly on the exact same object every view receives as `ctx.data` (confirmed:
`runtime.js:526`, `const ctx = Object.freeze({ data, blocks, navigate, route: at, tabs });` — `data` is not copied or
filtered, it's the same object). A repository's own view could then call `ctx.data.startSession(...)` and spawn an
arbitrary `claude` process with arbitrary `LaunchSpecInput` flags — exactly the privilege escalation Task 4 (just
completed) locked the Tauri layer down against, reopened one layer up in the JS shell instead. This also isn't
Task 5-specific: every later task that wires a session-control command into JS has the same shape (Task 6: `send_input`,
`resize_session`; Task 7: `subscribe_session`, and arguably `hosted_sessions` since it's borderline info-only;
Task 12: `confirm_close`; Task 13: `resume_session`). `previewCommand` itself is comparatively harmless (builds a
display string, starts nothing), but it's part of the same privileged surface thematically.

The implementer also raised two smaller, related questions:

- **The "Start session" entry point** the brief describes living in "the list view's project picker" would require
  editing a view file (`list.ts`, not in Task 5's Files list) to call a privileged function — the same boundary
  problem one level up in the UI. The implementer recommends a shell-mounted button outside `#app` instead (opening
  the form as a dialog, with "Continue from a run" as a select inside the form, filled from the existing read-only
  `entries`).
- **Code reuse with Task 3's `pty.rs`**: `preview_command` needs the exact same `LaunchSpecInput`→`LaunchSpec`
  conversion and id-parsing Task 3 already wrote, privately, inside `pty.rs` (not in Task 5's Files list). Duplicating
  ~8 lines in `commands.rs` avoids touching an unlisted file; extracting a small shared helper into `pty.rs` avoids
  the duplication (and the risk of the two copies drifting, which would break the "preview and the real launch are
  byte-identical" Global Constraint) at the cost of touching one more file.

Why the plan doesn't hold: the brief's Files/Interfaces text named `runtime.js`'s `data` object as the home for
`previewCommand`/`startSession` without accounting for the fact that `data` is the exact object views receive
unfiltered — a gap in the plan's own design, not something Task 5's implementer could resolve by guessing.

Options:

- **Add a second, privileged-only object alongside `data`** (e.g. `shell`), built in `createRuntime`/`boot.js`
  from the same `invoke`, but never placed on `ctx` — only the privileged shell chrome (the start form now, the
  terminal pane and run bar controls in Tasks 6/7/12/13 later) receives it. `previewCommand` could go on either
  `data` or `shell`; `startSession` and every other session-control command go on `shell` only. The "Start session"
  entry point is a shell-mounted button outside `#app`, not a view change. (Recommended — matches the plan's own
  Global Constraint, "adds to `DataApi` (read-only) but adds no write path through it," literally: `DataApi`/`data`
  stays untouched by this feature except for genuinely read-only additions like Task 8's `backgroundTasks` and
  Task 9's `toolResult`; everything that spawns, controls or streams a process's raw output lives on the new object
  instead.)
- **Keep one `data` object but filter what a view receives from `ctx.data`** vs. what the shell chrome calls directly
  — more invasive (changes how `ctx` itself is built, affecting every view, not just new code) for the same end
  result.
- **Something else.**

Also asking: should Task 5 be allowed to touch `pty.rs` (not in its Files list) to extract a shared `LaunchSpecInput`
conversion helper, rather than duplicate ~8 lines in `commands.rs`?

→ Recommendation: a second `shell` object (first option), plus allowing the small `pty.rs` extraction (duplicated
spec-building logic is exactly the kind of drift that could silently break the preview/launch byte-identical
guarantee).

**Status: decided 2026-10-31**: add a second, privileged-only `shell` object, never placed on `ctx`; session-control
commands live there, `data`/`DataApi` stays exactly read-only. Allow Task 5 to touch `pty.rs` for the shared
`LaunchSpecInput` conversion helper. plan.md's Architecture, Global Constraints, and Tasks 5, 6, 7, 12, 13 rewritten
to reference `shell.*` instead of `data.*` for every session-control call.

### Task 7's implementation exposes a hosted session's raw terminal bytes to every view

Status: open

What: Task 6/7's plan text puts `scrollback` on `data` (`DataApi`), reasoning it's "read-only... it only returns
already-produced output bytes, not control." Task 7's implementer built it exactly that way (confirmed:
`runtime.js:281`, `scrollback: (id) => invoke('scrollback', { id })`, added to the `data` object), then flagged it
themselves as a concern: `data` is the literal, unfiltered object every view gets as `ctx.data` — so this means any
loaded view, including a third-party repository's, can call `ctx.data.scrollback(id)` and read a hosted session's
**entire buffered terminal output** by id. That's not a thin "is a command running" signal — it's the real content
printed in the terminal: file contents, prompts, anything the session or the user typed or saw, including any
secrets that happened to appear on screen.

This conflicts with the plan's own Global Constraint, written after Task 5's deviation: "A command that spawns,
controls, or streams a process's raw output is never added to `data`/`DataApi`... goes on the separate,
privileged-only `shell` object instead." `scrollback` literally returns "a process's raw output" (the ring buffer
Task 3 built) — so the plan's own text contradicts itself between that Global Constraint and Task 6/7's specific
"read-only exception" carve-out for `scrollback`. The carve-out's reasoning (it doesn't _control_ anything) is true
but doesn't address the actual risk, which is read exposure of session content, not write/control access.

Why the plan doesn't hold: Task 6/7's text treated "read-only" and "safe for every view" as the same thing, but
`scrollback` is read-only in the write/control sense while still being exactly the kind of sensitive content the rest
of this feature (and the whole flow-observability view sandbox) was built to keep away from untrusted view code.

Options:

- **Move `scrollback` to `shell`** (one-line change per the implementer: in `boot.js`'s `paneApi`, plus dropping the
  `invoke('scrollback', ...)` wiring from `runtime.js`'s `data` object). The terminal pane's own `api.scrollback`
  call already goes through `boot.js`'s wiring either way, so this costs nothing functionally — it only removes the
  method from what a view could call directly. (Recommended — matches the Global Constraint's actual wording and
  intent; "no judgment call" was always the design goal for what's view-visible vs. not, and raw session content
  belongs on the privileged side of that line.)
- **Keep `scrollback` on `data`, as already built** — accept that any view can read a hosted session's buffered
  output by id. This is a real, not theoretical, capability: a malicious or compromised repository view (a loaded,
  dynamically-fetched `extensions/*` module) could exfiltrate everything printed in every hosted session's terminal.
- **Something else** — e.g. a narrower `data` method that answers only "has output since <cursor>" without content,
  if there's a legitimate read-only use case for views to detect activity without seeing the bytes (none identified
  so far).

→ Recommendation: move `scrollback` to `shell`. plan.md's Task 6/7 text ("the read-only exception") would need
correcting to remove the contradiction with the Global Constraint, and a fix round dispatched to Task 7's
implementer for the one-line move.

**Status: decided 2026-10-31**: move `scrollback` to `shell`. plan.md's Task 6, Task 7, and the Architecture/Global
Constraints text corrected to remove the "read-only exception" contradiction; fix round dispatched to Task 7's
implementer.

### Task 10's chip selection has no mechanism to reach the Activity view

Status: open

What: Task 10's implementer stopped before writing code (NEEDS_CONTEXT, correctly) because the plan's own text
conflicts with itself and with the codebase. Task 10 says chip selection "re-targets the output pane to the
already-fetched `Activity`, filtered client-side by the chosen chip's `agent` id — it makes no new `session()` call
per chip," implying the Activity view's content changes based on the chosen chip. But Task 7 explicitly promised "the
existing (**unmodified**) Activity view" sits beside the terminal pane, and confirmed: `activity.ts` fetches its own
`session()` data internally, pages it, and merges turns into its own module-level state — `runtime.js` never holds
the `Activity` data at all today, and `activity.ts` isn't in Task 10's Files list. There is also no way for a
`'background'` chip to work through the Activity view at all — background-task output (Task 8) is raw text, not an
`Activity` of turns, so the Activity view's renderer structurally cannot represent it regardless of filtering.

Why the plan doesn't hold: it assumed a data flow (chip → filtered Activity → the existing view re-renders) that
doesn't exist in the current code and can't be built without either touching `activity.ts` (not in this task's Files
list, and in tension with Task 7's "unmodified" promise) or inventing a new, separate rendering surface.

Options:

1. **Wrap `data.session` for the session route, in `runtime.js` only.** The runtime builds a per-draw `ctx.data`
   whose `session()` call returns the Activity pre-filtered by the selected chip before `activity.ts` ever sees it.
   Keeps "no extra fetch" in spirit (one fetch per draw, not per chip) but not literally — the view still calls
   `session()` on every redraw as it does today, and picking a chip forces a redraw. Filtering has to blank
   non-matching items _inside_ turns rather than drop whole turns, since `activity.ts`'s index-based merge
   (`loaded`/`total`/`start`) would break if turn counts shifted. A background chip still needs a separate panel
   (Activity-shaped data can't represent raw command output), so this doesn't fully avoid inventing new UI either.
   Only `runtime.js`/`session-chips.js` change; `activity.ts` stays untouched as a _file_, just not as _behavior_.
2. **Add a selection field to `ViewContext`** (e.g. `ctx.focus`) and have `activity.ts` filter itself using it.
   Would be the cleanest rendering outcome, but changes a public interface (`api.d.ts`'s `ViewContext` shape, which
   is this app's established, stable view-sandbox contract) and touches a file outside this task's list — and is
   exactly the shape of thing this project's process rules flag ("if a task asks you to pass a new signal through
   types, schemas, pipelines, or similar layers, stop and look for a more direct path").
3. **Make the chips their own small output panel, separate from the Activity view (implementer's recommendation).**
   `runtime.js` draws the chips bar plus a small panel next to the terminal slot; it fetches `data.session(id)` and
   `data.backgroundTasks(id)` once per draw, builds the chips, and renders the selected chip's content in that panel
   from the already-fetched data (agent-filtered replies/tool calls for main/agent chips, `backgroundOutput` text for
   a background chip). The existing Activity view is left running exactly as-is, unmodified in both file and
   behavior — Task 7's promise holds literally. Costs: a second, smaller renderer of turn-shaped data next to
   `activity.ts` (duplication); needs `session-chips.js` to also export a pure `filterActivity(activity, chip)`, one
   function beyond the plan's named two (`buildChips`, `followLatest`).

Also asking: if option 3, does this new panel replace what's shown next to the terminal, or sit beside the existing
Activity section (i.e., does the Activity view disappear for a hosted session once chips exist, or do both show at
once)?

→ Recommendation: option 3 — it's the only one that actually delivers "switch between main, a subagent, and a
background command," since a background chip has no Activity-shaped data to filter into the existing view regardless
of which of 1/2 is chosen for the other two chip kinds. Approve `filterActivity` as a third export.

**Status: decided 2026-10-31**: a separate small output panel owned by `runtime.js` (option 3), approving
`filterActivity` as a third `session-chips.js` export. The panel **replaces** the Activity view when a chip other
than `'main'` is selected; selecting `'main'` shows the Activity view exactly as Task 7 built it. plan.md's Task 10
rewritten with the panel/replace mechanics and the third export.

### Task 12's "Working or Waiting" predicate needed data `shared.live(id)` alone doesn't carry

Status: open

What: the brief says `needs_confirmation` is true when a hosted session is "Working or Waiting by `shared.live(id)`."
In fact, `SessionLive` (what `shared.live(id)` returns) only carries `waiting: Option<Waiting>` — whether a
question/permission prompt is currently open — it has no "Working" signal at all. Flow-observability's only existing
"Working" concept (`core/src/index/status.rs`'s `status()`) operates on a flow _run's_ aggregated `Facts`, including a
private `WORKING_SECS` (2 minutes) constant compared against "when a linked session's transcript last grew" — not a
single session's `SessionLive`, and not exported.

To cover "Working" for one hosted session (this task is about closing the window _while work might be in flight_ —
correctness here is directly data-loss-relevant, since the whole point is not to silently kill a running agent), the
implementer added a transcript-mtime check: a hosted session's own `session_path`'s file mtime within 2 minutes (or
unreadable, or in the future) counts as Working. This duplicates `status.rs`'s `WORKING_SECS` value as a private
constant in `pty.rs`, so the two could drift if one is tuned later without the other.

Why the plan doesn't hold: it assumed `shared.live(id)` alone could answer "Working or Waiting," but that data simply
isn't on `SessionLive` — "Working" has to come from somewhere else (transcript recency), which the implementer
derived correctly but had to invent the mechanism for, since `status.rs`'s own threshold is `pub(crate)`-scoped to
core and not reusable as-is from the app crate without a small core change (outside this task's Files list).

Options:

- **Accept the duplicated `WORKING` constant in `pty.rs` as built** (already correctly done, data-loss-safe: every
  ambiguous or unreadable case defaults to "needs confirmation," never to "safe to close"). Cost: the 2-minute
  threshold now lives in two places; a future tuning of one and not the other silently diverges what "Working" means
  for flow runs vs. hosted-session-close-confirmation.
- **Export `WORKING_SECS` from core** (a small, additive change: drop the `pub(crate)` on one existing constant in
  `status.rs`, re-export it) and have `pty.rs` import and reuse it instead of its own copy. Keeps the one tuning knob
  in one place. Costs touching `core/src/index/status.rs`, a file outside Task 12's Files list.
- **Something else.**

→ Recommendation: export `WORKING_SECS` from core — it's a one-line, additive, non-breaking change (widening
visibility of an existing constant, not changing its value or behavior) that removes a real future-drift risk, and
the file it touches is small and low-risk to open for this one line.

**Status: decided 2026-10-31**: export `WORKING_SECS` from core; `pty.rs` imports and reuses it instead of its own
copy. Fix round dispatched to Task 12's implementer; `core/src/index/status.rs` added to Task 12's Files list for
this one change.

### Task 13's brief assumed data and wiring that don't exist: a session's cwd, and shell's reach into runtime.js

Status: open

What: Task 13's implementer stopped before writing code (NEEDS_CONTEXT, correctly) with two gaps:

**Gap 1 — no session entry or binding carries a session's `cwd`.** The brief said "`cwd` and `id` come from the
session's own index entry... already available to the shell chrome the same way a view would read them." In fact:
`SessionSummary` (`{ id, started, last_activity, first_prompt }`), `FlowRunSummary`, `AuditSummary` and `Activity`
all lack a `cwd` field. The Rust index _does_ read a session's `cwd` once, while indexing (`core/src/index/entries.rs`'s
`Head`), but uses it only to resolve the project/checkout and then discards it — nothing persists it for later lookup.
`Project.roots` lists every checkout/worktree of a project, not which one a given session ran in — picking one would
be exactly the guess the brief explicitly rules out ("not re-derived or guessed"), and a wrong `cwd` makes
`claude --resume <id>` fail outright (unable to find the transcript).

**Gap 2 — `runtime.js` has no way to reach `shell` at all.** `createRuntime` receives only `hosted` and `mountPane`
(Task 7); `shell` itself is deliberately kept out, handed only to `start-form.js`/`close-confirm.js`. A "Resume"
button rendered inside `runtime.js`'s `session` route needs some way to trigger `shell.resumeSession` without
`runtime.js` ever holding `shell` directly.

Why the plan doesn't hold: Gap 1's data simply doesn't exist anywhere reachable, a real oversight in the brief's
assumption. Gap 2 is a direct, mechanical consequence of Task 7's own established "shell never enters `createRuntime`"
pattern, applied to a third case (`startSession`'s button lives in `start-form.js`, close's in `close-confirm.js`,
and now resume's would need the same treatment) — not by itself controversial, but it requires touching `boot.js`,
outside Task 13's Files list, same file Gap 1's fix (if B below) would also touch.

Options for Gap 1:

- **A. Add `cwd` to `SessionSummary`** (persist it in `core/src/index/entries.rs`'s `Session`, regenerate
  `bindings/SessionSummary.ts`). Puts a new signal through the types/bindings pipeline — exactly what this project's
  process rules flag ("if a task asks you to pass a new signal through types, schemas, pipelines... stop and look for
  a more direct path") — and makes a session's folder path visible to every view via `DataApi.entries()`, not just
  the privileged shell chrome.
- **B. Make the backend resolve the folder itself.** `resume_session` takes only `id` (drops the `cwd` parameter);
  the index already briefly knows a session's cwd while indexing — persist it internally (not exposed via any
  binding/view-visible type) and look it up by id when `resume_session` runs. Changes Task 2/3's already-shipped,
  approved `resume_session` signature (drops its `cwd` parameter) and `shell.resumeSession`'s own signature to match.
  No new view-visible field; the value can't be stale/forged/guessed since it's read from the same transcript
  `claude` itself will resume. (Implementer's recommendation.)
- **C. Guess from `Project.roots`** when a project has exactly one root, else give up/ask the user. Explicitly a
  guess, with no real answer for a multi-root (worktree) project — the exact case Task 1's findings already flagged
  as unreliable for folder-name reconstruction.

Options for Gap 2 (both allow editing `boot.js`, outside Task 13's listed files):

- **A. A new `createRuntime` parameter**, `resume: (id) => Promise<void>`, passed from `boot.js` the same way
  `mountPane` already is — `runtime.js` never holds `shell`, a view's `ctx` never sees it. Matches Task 7's own
  established pattern exactly. (Implementer's recommendation.)
- **B. A separate shell-chrome module** (like `start-form.js`/`close-confirm.js`) that watches the current route and
  overlays a Resume button — needs a route-change hook `runtime.js` doesn't currently expose, more invasive for the
  same result.

→ Recommendation: Gap 1 option B, Gap 2 option A — B keeps a session's folder path off the view-visible surface
entirely (the more direct path the process rules already favor) and avoids touching the bindings pipeline; Gap 2's A
is the mechanical, already-established extension of Task 7's own pattern to a third privileged action. If B is
chosen for Gap 1, add `core/src/index/entries.rs`, `core/src/bindings.rs` (if signatures there need touching),
`app/src/pty.rs`, and `app/shell/boot.js` to Task 13's Files list.

**Status: decided 2026-10-31**: Gap 1 option B (backend resolves a session's folder itself; `resume_session` drops
its `cwd` parameter), Gap 2 option A (a new `resume(id)` callback parameter on `createRuntime`, passed from `boot.js`
the same way `mountPane` already is). plan.md's Task 13 rewritten: Files list gains `core/src/index/entries.rs`,
`app/src/pty.rs`, `app/src/main.rs`/`build.rs`/`capabilities/default.json` (signature change touches the command's
registration), `app/shell/boot.js`; Interfaces rewritten to the new `resume_session(id, cols, rows, on_output)`
signature.

### Task 14 needs a real Windows machine, not available in this environment

Status: open

What: Task 14 (the final task, Slice 2) is a throwaway spike whose Step 1 requires actually running the Task 13
build on real Windows hardware — spawning a hosted session through `portable-pty`'s ConPTY backend, testing
keystrokes/resize, experimenting with real graceful-stop signals (`GenerateConsoleCtrlEvent` vs. `TerminateProcess`),
checking real filesystem paths for `claude_tmp_dir`'s uid-equivalent segment, and Backspace/`TERM` behavior. This
execution environment is Linux-only (NixOS); no Windows machine is reachable from here. Unlike every other task in
this plan, there is no way to do this task's real work without the hardware it names.

Why the plan doesn't hold: the plan (correctly, for a real team) assumed whoever executes Task 14 would have Windows
access; this execution session doesn't.

Options:

- **Stop at Slice 1's boundary.** Tasks 1-13 are complete and approved; Slice 1 (Linux) is feature-complete per the
  plan. Record Task 14 as not started, explicitly blocked on Windows hardware access, and proceed to the final
  whole-branch review scoped to Slice 1, then finish the branch. Task 14 becomes its own future dispatch whenever
  Windows access exists. (Recommended — this plan already treats Slice 1/Slice 2 as separable; shipping Slice 1 alone
  matches its own structure.)
- **A best-effort, research-only pass**: read `portable-pty`'s Windows source/docs for ConPTY and kill-signal
  behavior (no real execution), write `findings.md` entries tagged `(source)`/`(inferred)` per Task 1's own
  discipline, and implement only the lowest-risk, best-supported branch (e.g. the already-known
  TerminateProcess-only limitation Task 1's spike already read about). No claim of anything actually run or tested on
  Windows; real verification still deferred to real hardware later.
- **Something else.**

**Status: decided 2026-11-01**: stop at Slice 1's boundary. Task 14 recorded as not started / blocked on Windows
hardware access. Proceeding to the final whole-branch review scoped to Tasks 1-13 (Slice 1), then
`superpowers:finishing-a-development-branch`.

### The final whole-branch review found three Important findings that are deviation-class

Status: open

What: the final review (session `ses_e6bba31a3ffe49RknAxPFbqkht`, `anthropic/claude-opus-5-5`) found no Critical
issues and confirmed the architecture is sound across all 13 tasks (the `shell`/`data` split holds end to end,
command registration is consistent, bytes reach the terminal untouched, process stopping is careful). It found 6
Important findings; 3 of them (#2, #3, #4 below) require a new interface, a changed data flow, or a product-scope
decision the plan never made — deviation-class, taken to the user rather than ruled on. The other 3 (#1, #5, #6) are
contained bug fixes/process hygiene and are going into a normal fix round without a fresh ask.

**#2 — Startup terminal queries on a fresh session may never be answered.** `start_session`'s own output channel
(Task 5) is created but never read — the real display channel only exists once the terminal pane mounts and calls
`subscribe_session` (Task 6/7), which happens after navigation, a full draw, and `findLinkedRun`'s reads (Task 11).
Any DA1/focus/capability query Claude sends before that mount completes is never answered (findings.md confirms
Claude sends such queries on startup; Task 1's spike wired the pane from byte 0, so this exact race was never
exercised there, and Task 13's manual GUI check didn't happen). This risks the Global Constraint "no Claude Code
feature may be lost" for a _fresh_ start specifically (a _resumed_ or _reload-rehydrated_ session is fine — priming
from scrollback already drops stale replies correctly).

Options:

- **Mount the pane before calling `start_session`/`resume_session`, passing its live channel as `on_output` directly**
  (the session id is already generated client-side before either call, per Task 5's design) — eliminates the race
  entirely for a fresh start, since there's never an unread channel. Priming/scrollback replay stays exactly as built,
  used only for the reload-rehydration case. This reorders start-form.js/session-pane.js/runtime.js's mount sequence
  (Tasks 5, 6, 7's established order), a changed data flow spanning three already-approved tasks. (Reviewer's
  recommendation.)
- **Accept the race as a known, documented limitation** of this slice (narrow window, real but unverified in practice
  — Task 1's spike never actually triggered it because it didn't go through the real start-form→navigate→mount
  sequence) and fix it in a later pass if it's confirmed to matter in practice.
- **Something else.**

**#3 — An ended hosted session has no way forward in the same window.** Task 3 decided an exited session stays
registered (so its last output is visible); Task 7's fix made sure its pane/output actually stay shown rather than
vanishing; but no task ever wired anything to the registered `kill_session` command from the shell chrome, and no
task added a way to resume/dismiss an ended session without a full window reload. A session that ends mid-window
shows a dead pane with no affordance — only F5 (which re-reads `hosted_sessions()` from the backend, correctly
dropping an exited-and-not-yet-killed session) brings back a working Resume button.

Options:

- **Add an in-window "Session ended — Resume / Dismiss" affordance**: Dismiss calls `kill_session` (wiring it to a
  `shell` method, finally giving it a caller) and removes the id from `hosted`; Resume needs `session-pane.js` to
  re-subscribe to a new PTY and re-prime, a genuinely new capability session-pane.js doesn't have today (it
  subscribes exactly once per mount, per Task 6's own design). New UI, new interface. (Reviewer's suggestion, option
  1.)
- **A lighter touch**: show an "ended — reload the window to resume" hint on an ended pane, with no new
  subscribe/resume machinery — just a clearer dead-end instead of a silent one. Still a new small UI affordance, but
  no new session-pane.js capability.
- **Leave it as documented behavior for this slice** (ended sessions are visible but inert until reload) and record
  the F5 workaround as a known limitation.
- **Something else.**

**#4 — Windows gets this feature fully exposed, untested.** Per ADR 0006, every merge to `main` releases, and the
existing CI already builds and ships a Windows build of the flow cockpit. Task 14 (Windows verification) is deferred
indefinitely (no Windows hardware in this environment) — but nothing in this slice's own work gates the new
session-hosting UI (Start, Resume) behind a platform check, so a Windows user installing the next release would get
an untested `claude`-on-PATH lookup (findings.md flags this specifically), a guessed temp-dir path for background
output, and a stop mechanism findings.md already documented as orphan-prone on Windows (`TerminateProcess` only, no
SIGHUP equivalent).

Options:

- **Gate Start/Resume behind a platform check** until Task 14 ships: on Windows, hide or disable the entry points
  (or show them with a clear "not yet supported on Windows" message), so the feature only activates where it's
  actually been built and reviewed for. Cheapest, safest; a plain `cfg`/`navigator.platform`-style check, no new
  cross-cutting interface.
- **Ship as-is and document the Windows gap** in the plugin's README/release notes as a known limitation, accepting
  that Windows users get an untested path until Task 14 lands.
- **Hold the release entirely** until Task 14 is done (requires Windows hardware access this environment doesn't
  have — effectively blocks shipping Slice 1 at all on the normal release cadence).
- **Something else.**

**Status: decided 2026-11-01**:

- **#2**: mount the pane before `start_session`/`resume_session`, pass its channel directly — eliminates the race.
- **#3**: leave as documented behavior for this slice (no in-window Resume/Dismiss; F5 recovers it); record the
  limitation.
- **#4**: gate Start/Resume behind a platform check on Windows until Task 14 verifies it there.

These, plus the final review's 3 non-deviation Important findings (#1, #5, #6) and the "fix now" items from its
deferred-minor triage, go into one consolidated final-review fix round.

Status: open

What: Task 1 (the throwaway PTY spike) ran successfully and pinned real facts, several of which the plan's text got
wrong: the output channel type (Task 3), the graceful-kill mechanism (Tasks 3, 12), scrollback priming re-sending
terminal-query replies into a live session (Task 6), the background-output path not being reliably derivable from a
session's cwd (Task 8), `claude`'s PATH resolution needing a login-shell fallback (Task 3), and no graceful-stop
phase existing on Windows at all (Task 14). Full detail in `findings.md`'s "What changes in Tasks 2-14". Also one
unverified note affecting Task 7 (a keydown listener may not fire while the terminal pane has focus).

Why the plan doesn't hold: these are facts about `portable-pty`, Tauri's `Channel` type, and Claude Code's own
runtime behavior that the plan's authors (including the plan-review round) could not have verified without running
this exact spike — which is precisely why the plan put it first and named this contingency explicitly ("If a finding
contradicts a later task's assumption, that task is rewritten before it starts, and the plan is re-reviewed").

Options:

- **A — Rewrite the affected tasks (3, 6, 7, 8, 12, 14) now, re-run a scoped plan review** (not full round 1, since
  the shape — tasks, modules, dependencies — doesn't change, only several interfaces and mechanisms within existing
  tasks), then resume execution at Task 2.
- **B — Rewrite the affected tasks now, skip a formal re-review** and self-review them against `findings.md`
  directly (plan-review.md: "For anything smaller, check the edit yourself" — arguably applies here since nothing
  changes task order, new modules, or new libraries, only specific mechanisms within tasks).
- **C — Pause here without rewriting**, given the separate account-usage concern below, and resume later.

→ Recommendation: B, because none of these findings add a task, remove one, or introduce a new module/library (the
bar `plan-review.md` sets for re-running a full review) — they correct specific mechanisms inside existing tasks,
each with a concrete, unambiguous fix already stated in `findings.md`.

Separately, flagged by the implementer: **the user's account is at 92% of its weekly usage limit.** This doesn't
change what the right fix is, but affects whether to keep dispatching subagents (13 more tasks, each with an
implementer and a task reviewer, plus fix loops and a final review) right now versus later.

**Status: decided 2026-10-31**: B (rewrite + self-review), and continue execution now. Tasks 3, 6, 8 and 14 edited in
`plan.md` directly (Task 7 gained one clarifying test note, Task 12 needed no edit beyond Task 3's shared `kill_all`
fix already covering it). Self-reviewed against every item in `findings.md`'s "What changes in Tasks 2-14"; none
left unaddressed.

## Walkthrough

| spec goal | plan task | file:line | test |
| --------- | --------- | --------- | ---- |

## Run verdict
