# Flow cockpit hosts Claude sessions: design

Status: approved at Gate 1 (2026-10-31). Terms follow `GLOSSARY.md` § Flow cockpit, changed by this feature (below).
Calls marked **(my call)** were made by Claude, not by the user. Builds on
[flow-observability](../flow-observability/spec.md) (the watch-only cockpit) and reverses part of
[ADR 0005](../../adr/0005-flow-cockpit-outside-claude-code.md); the shape is recorded in
[ADR 0007](../../adr/0007-flow-cockpit-hosts-claude-sessions.md), which supersedes that part.

## Intent

The flow cockpit (built on `feat/flow-cockpit`) watches: it reads flow runs, documents and a capture, and never
starts, answers or types into a Claude session. The user wants to go further: work _from_ the cockpit, with Claude,
fully integrated, the way Claude Desktop's workspace does, not a dashboard next to a terminal they still drive by
hand. Two hard constraints bound every choice below (user, 2026-10-29, recorded in flow.md Brainstorm answers):

- **Claude Code itself runs the agent, on the user's own plan.** No reimplementing a harness or a chat UI over an
  API key; no feature Claude Code has today may be lost (slash commands, plan mode, `/rewind`, mods, permission
  prompts, subagent panels).
- **The user may draw the conversation differently**, as long as neither constraint above is given up.

Within those, three things the user asked for directly: switching the cockpit's active project while sessions in
other projects keep running untouched; a session that lives only as long as the cockpit window does (closing the
cockpit closes Claude Code, same as closing a terminal tab); and seeing what a session and its subagents are doing
without losing the output itself (not just a list of what's running, the actual tool results and agent reports).

## Goals

1. **Start a session from the cockpit.** A start form: project, then a folder (an existing worktree, the checkout
   itself, or a new worktree by name — `-w/--worktree [name]`), model, effort
   (`--effort low|medium|high|xhigh|max`), and a first prompt. "Continue" on an open flow run pre-types
   `/flows:<conductor> <slug>` as the first prompt. The form shows the exact command it will run before starting it.
   (Approved as shown, visual companion `start-form`, 2026-10-29.) Starting it creates a **hosted session**
   (Grill round 1): a Claude session the cockpit owns the process for, in its own PTY.
2. **A real Claude Code session, full fidelity, embedded in the cockpit.** The session is the actual `claude` binary
   in a PTY, drawn with a terminal emulator; every feature that works in the user's terminal today keeps working.
   (Picked approach, "Surface" below.)
3. **Resuming a listed session.** Clicking "resume" on a hosted session whose tab is still open just focuses that
   tab. On any other listed session it runs `claude --resume <id>` directly, the same as typing it in a terminal; no
   new locking guards this (Grill round 1, Q2) — if that session turns out to be open elsewhere, Claude Code
   interleaves the messages into one transcript, the same outcome as resuming it by hand in two terminals.
4. **Several sessions, several projects, at once.** Starting or switching to a session in one project does not stop
   or hide sessions running in another; each session keeps its own PTY and terminal state while the cockpit's
   active project changes around it.
5. **The Session tab** (layout `layout-c-task.html`, approved 2026-10-29): terminal pane plus an output pane, with
   chips to pick the main session, a subagent, or a background command, and a "follow latest" chip. A finished tool
   call shows its full result; an agent's report shows at the end of its chip's output; a background command's
   output streams live, a foreground tool's output appears once it finishes (streaming it earlier isn't possible,
   see Constraints).
6. **A run bar on the Session tab**, for a session linked to a flow run: the phase stepper, the plan's task
   segments, the task in progress, and the flow.md `now:` line (reusing the flow run view's model from
   flow-observability); the agent chips for that session's subagents carry their task number; the left-hand list
   shows phase and task too.
7. **Subagent visibility**, answering "like Claude Desktop's workspace" (2026-10-29): a subagent's session (its
   transcript plus the capture) is visible and tailed the same way the main session's is, read-only. No subagent
   thinking text (none is on disk), no typing into a subagent (Claude Code has none outside agent teams, out of
   scope here), and stopping one is done in the terminal's own agent panel, not a cockpit control.
8. **Outside sessions stay watch-only**, exactly as flow-observability built them: a session not started from the
   cockpit is read from its transcript and the capture, with no Session tab controls to type into or resume it from
   here.
9. **Closing with unfinished work asks first** (Grill round 1, Q3): if any hosted session is actively working or
   waiting on a question or permission prompt when the cockpit window closes, it asks for confirmation once; with
   only idle hosted sessions, it closes without asking. Confirming still closes every hosted session (Non-goals).

## Non-goals

- **A cockpit-drawn chat UI over the Agent SDK or `stream-json`** (rejected approach B, below): it would redraw the
  conversation and slash commands, drop mods, plan-mode UI and `/rewind`, and the SDK's own guidance is that such
  apps "should use API key authentication" rather than a subscription — both break the hard constraints.
- **Deciding a session's skills, plugins or settings from the cockpit** (an "encapsulated" session). Asked and
  explicitly deferred by the user, 2026-10-29: "lets not do that for now. Maybe will do that later." Sessions start
  with the user's normal Claude Code configuration. This is a non-goal, not an anti-goal: the one place that builds
  the launch command (Goal 1) is the seam where it would be added, so this feature must not scatter that decision
  elsewhere.
- **The cockpit answering questions or permission prompts** (option C, below): a later slice, not ruled out, needs
  its own spike first. Not built now.
- **Backgrounding a session.** A session is a child process of the cockpit window; there is no helper that keeps it
  running after the window closes, and no "resume later from where it was" beyond Claude Code's own `--resume`.
- **Claude Code's own background-session supervisor** (`--bg`, `claude agents`/`attach`/`daemon`/`respawn`/`stop`/
  `rm`) (Grill round 1, Q4). It solves an adjacent problem — a session that outlives any terminal, under its own
  supervisor — which this feature deliberately doesn't take on: a hosted session is always a plain foreground
  `claude` process, a direct child of the cockpit.
- Everything flow-observability already put out of scope and this feature doesn't touch: model-written summaries, a
  hosted web UI, macOS, ARM, running plan tasks in parallel, migrating older flow.md files.

## Anti-goals

- **A second implementation of Claude Code's own interface.** Plan mode, permission prompts, `/rewind`, slash
  commands and mod output come from the real process through the PTY; the cockpit never re-renders or
  second-guesses what the terminal already draws correctly.
- **Routing a session through anything but the user's own Claude Code binary and their own auth.** No proxying
  requests, no embedding an API key on the user's behalf.
- **A session that outlives the window without the user asking for it.** Silently orphaning a `claude` process when
  the cockpit closes would be worse than today's plain terminal, where closing the tab is a clear, expected signal.
- Unchanged from ADR 0005 / flow-observability: the cockpit's own code never writes to a repository or to Claude
  Code's files; starting a session is delegated to the `claude` binary, not done by writing files itself.

## Constraints

- Repo rules (CLAUDE.md): one version for everything, `check-repo` consistency, binaries per `BIN_TARGETS` only
  where the installer already downloads them, vendored packs never edited directly.
- **Shell state today** (`app/Cargo.toml`): tauri 2.12.5, no Tauri plugins, no tokio, no PTY crate; one window,
  CSP `default-src 'self'; script-src 'self' blob:; connect-src ipc: http://ipc.localhost`, capability
  `core:default` only; the only writer today is a 2 s poll thread reading, never a process owner. Embedding a PTY
  is new ground for this app: a process the cockpit itself spawns, owns and must clean up (on window close, on
  project switch, on crash), not something it only reads.
- **Claude Code's own interfaces are partly undocumented.** Hook payloads and the CLI flags are documented
  (`claude --help`, `code.claude.com/docs`); transcript JSONL and the background-command output files
  (`<tmp>/claude-<uid>/<project>/<session>/tasks/<id>.output`, seen in this session) are not. A background command's
  live output in Goal 5 depends on that undocumented path; it needs re-checking against a newer Claude Code before
  it ships, and the feature must still work (foreground-only, no live background output) if the path changes shape.
- **Windows and Linux both**, matching how flow-observability ships: a PTY crate with real Windows backends
  (ConPTY), not a Unix-only one.
- **Legal** (`code.claude.com/docs/en/legal-and-compliance`, read 2026-10-29): running the unmodified `claude`
  binary under the user's own subscription is fine; the cockpit must not modify that binary or intermediate its
  usage.
- The user's terminal setup outside the cockpit (Ghostty, tmux, Windows Terminal, Night City) is untouched; this
  feature adds a second place sessions can run, it doesn't replace the first.

## Approaches

### Surface

Recorded in flow.md **Options** § Surface, from the prior-art agent report (2026-10-29; Zed Terminal Threads, Claude
Squad, Nimbalyst, `tauri-plugin-pty`, `portable-pty`; opcode's stream-json approach; the Agent SDK and ACP docs):

- **A, picked:** a real PTY plus a terminal emulator (xterm.js or similar) in a cockpit pane, the cockpit's other
  views (run bar, list, subagent chips) drawn around it. Full fidelity, every mod and slash command keeps working;
  questions and permission prompts are seen only through the capture's existing hooks (not answered); input is
  keystrokes only, same as a terminal. This is what ADR 0005 rejected as "the riskiest part" when the only
  alternative on the table was _replacing_ the user's terminal; here it is additive, next to it.
- **B, rejected:** headless `stream-json` / the Agent SDK with a cockpit-drawn chat surface. Loses slash commands,
  plan-mode UI and mod output; the SDK is TS/Python only, so a Rust core would speak the CLI's undocumented
  `control_request`/`control_response` stdin protocol instead; guidance favors API-key auth over a subscription.
  Fails the "no Claude Code feature lost" constraint outright.
- **C, not ruled out, not in scope:** A plus the cockpit answering questions and permissions itself via hooks.
  Needs a spike (how an answer gets back into a running `claude` process without a scripting interface for it)
  before it can be scoped; left as a later slice.
- **S, smallest, not picked:** the cockpit only opens the user's own terminal emulator running the encapsulated
  command. Rejected because it gives up Goals 4-7 (several sessions visible together, the run bar, subagent
  visibility) entirely.

### Subagents

Claude Desktop's workspace (`code.claude.com/docs/en/desktop`, read 2026-10-29) was the reference point the user
named. Matched: a tasks pane listing subagents and background work, each one's output in its own pane. Not matched:
Claude Desktop can stop a subagent from its pane; here that stays in the terminal's own agent panel (Goal 7), because
the cockpit's PTY is one terminal session, not a second control surface over Claude Code's agent runtime.

## Decided by the user

- The cockpit becomes where the user works with Claude, not a launcher next to the terminal; builds on
  flow-observability (2026-10-29).
- Claude Code itself must run the agent, on the user's plan; no Claude Code feature may be given up; the
  conversation may be drawn differently only within both (2026-10-29).
- Several sessions across several projects at once; switching the cockpit's project doesn't stop the others
  (2026-10-29).
- A session is a child process of the window: closing the cockpit closes Claude Code; no background helper; picking
  up again is Claude Code's own resume (2026-10-29).
- The start form has folder/worktree, model, effort and a first prompt the user types themselves (2026-10-29).
- Layout: the Session tab is terminal plus a real output pane (not just an activity list), with chips for
  main/subagent/background and "follow latest"; a run bar adds the phase stepper, task segments and `now:`
  (2026-10-29, `layout-c-output.html` then `layout-c-task.html`).
- Subagents are visible like Claude Desktop's workspace, read-only; no typing into one, stopping stays in the
  terminal (2026-10-29).
- Encapsulating a session's skills/plugins is explicitly deferred, not ruled out (2026-10-29).
- Surface: embedded PTY + terminal (option A); the headless/SDK rebuild (option B) rejected; cockpit-side answering
  (option C) left for a later slice (2026-10-29).
- Grill round 1 (2026-10-31): the term **hosted session**; no new locking for the resume guard, trusting Claude
  Code's own interleaving behavior; closing with unfinished work asks once; the explicit non-goal of Claude Code's
  own background-session supervisor.
- Grill round 2 (2026-10-31): Flow cockpit stays the product name everywhere; `harness` dropped from the glossary's
  `_Avoid_` list for prose, never used as a feature or screen name; ADR 0007.

## Where each cross-cutting concern is decided

- **A session's launch command** (folder/worktree, model, effort, prompt, `--session-id`): resolved in one launch-
  command builder in the core, fed by the start form; never seen by the PTY layer (argv and cwd only) or by views
  (structured start-form fields only, never raw flags). This is also the seam named for the deferred encapsulation
  (Non-goals): adding it later changes only this one builder.
- **Session control** (spawn, keystrokes, resize, kill): resolved in privileged, non-extensible Tauri commands (the
  session control boundary below); never seen by any view, built-in or from a repository.
- **Which transcript belongs to a hosted session**: resolved by the cockpit always passing `--session-id` (a UUID it
  generates) at launch, so the existing run/session index (flow-observability's `index/links.rs`) keeps working
  unchanged; never seen by the terminal/PTY layer, which only forwards keystrokes and bytes.
- **Background-command output** (the undocumented `tasks/<id>.output` path): resolved in one output-reader module
  behind an interface the Session tab's view never sees the path shape of; if the path changes, only that module
  changes, and Goal 5 degrades to foreground-only output rather than breaking.
- **Whether a resumed session might be live elsewhere**: not detected at all (Grill round 1, Q2); Claude Code's own
  interleaving behavior is the fallback, so no module owns a liveness lock.

## Session control boundary **(my call, builder check)**

flow-observability's trust model is strict: every view, including a trusted repository's own, is sandboxed,
read-only TypeScript reading a `DataApi` it can't write through. Session control (spawning `claude`, sending
keystrokes and resizes, killing a process) is a different trust tier — a repository shouldn't gain the ability to
run processes by having its extensions loaded. It is built-in, privileged shell chrome (the start form, the terminal
pane, the Session tab's controls), reached only through new, non-extensible Tauri commands of their own capability.
The run bar, task segments and subagent chips stay ordinary views: they keep reading an extended but still
read-only `DataApi` (now including session and PTY state), exactly like the rest of the cockpit today. No view, built
in or from a repository, gets a handle on a process through the app's own interface.

**Reopened 2026-10-31** (plan review round 1, finding F1): that last sentence holds for the interface — `DataApi`,
`ctx`, and the view loader's static-import check (`strip.rs`) all still refuse a view any path to a process. It does
not yet hold for the raw JavaScript realm underneath it: today every view runs in the same unsandboxed JS context as
the app's own chrome, so a script with window access can still reach the raw IPC transport directly
(`window.__TAURI_INTERNALS__.invoke(...)`), bypassing `DataApi` entirely. The plan's Task 4 closes this as far as
Tauri's own capability system allows without a view-sandboxing rewrite (turning off `withGlobalTauri`, wiring an
`AppManifest` so capabilities actually gate commands) and records the residual risk rather than claiming it's gone;
real isolation (a sandboxed iframe or a second webview for views) is out of scope for this slice. Approved to proceed
on that basis.

## Design checkpoint

Embedded PTYs inside a webview were the riskiest part of the rejected cockpit in ADR 0005. The plan's first task is a
throwaway spike (recorded in flow.md as throwaway, per brainstorming's Spike rule, findings written to
`findings.md` — the shape `web-mcp-search`'s Task 1 used) proving the core of Goal 2 on Linux: a real `claude`
session, in plan mode, answering an `AskUserQuestion`, running a background command, and resizing, inside a PTY
embedded in this Tauri shell, with correct color and Unicode. Its findings (crate choice, resize handling, output
buffering for Goal 5) settle values the rest of the plan's tasks pin; if they contradict what the plan assumed, the
plan is rewritten and re-reviewed before building continues, the same way `web-mcp-search`'s was.

## Slices

1. **Slice 1, Linux:** the design checkpoint's spike, the start form, one embedded session at a time, the Session
   tab (terminal, output pane, chips, follow latest), the run bar, subagent visibility. This is the feature end to
   end on one platform, not a partial cockpit.
2. **Slice 2, Windows:** the same surface on ConPTY, once Slice 1's shape is proven — matching how
   flow-observability trailed its own Windows release into a second slice. Terminal quirks specific to Windows
   (Backspace vs Ctrl+Backspace, `TERM_PROGRAM`/`TERM` for mintty/cygwin) are this slice's problem, not Slice 1's.

## Left to the builder

The exact PTY and terminal-emulator crates and versions; the shape of a session record in the core (how it links a
PTY, a transcript, and the run index flow-observability already built); the exact chip and run-bar components,
within the Night City palette and the readability bar flow-observability's prototype set; how many concurrent
sessions the window should assume in its resource budget (PTYs and webview terminal instances are not free); whether
`--safe-mode` composes with `--plugin-dir`/`--mcp-config`, and whether `CLAUDE_CONFIG_DIR` or `--settings` is the
right lever, left as a note for whoever later picks up the deferred encapsulation (Non-goals) — not needed for this
feature's own scope.
