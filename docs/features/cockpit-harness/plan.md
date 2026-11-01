# Flow cockpit hosts Claude sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The flow cockpit can start, host and show a real Claude Code session in an embedded PTY, next to the
existing read-only views, on Linux first and then Windows.

**Architecture:** A new core module builds a session's `claude` command line, pure and unit-tested, from a
`LaunchSpec` whose session id is generated once, client-side, and carried through unchanged from the start form's
preview to the real launch. The app spawns and owns that process through a PTY crate, behind new privileged Tauri
commands (`start_session`, `resume_session`, `subscribe_session`, `send_input`, `resize_session`, `kill_session`)
locked down as far as Tauri's own primitives allow (Task 4) — a documented residual risk remains; see `spec.md`'s
Constraints. The existing
`session` route and its Activity view (flow-observability) are reused for a hosted session's output, extended once
(Task 9) to show a finished tool call's full result, which benefits every session, not only hosted ones. New
privileged shell chrome (not a view) adds the start form, a terminal pane that survives the view runtime's own
redraws and reloads (mounted outside `#app`, in its own persistent host — Task 7), the chips, and a run bar built
from the already-existing `flowRun`/`stepper`/`taskGraph` data and blocks. **A second, privileged-only JS object,
`shell`, built alongside `data` in `createRuntime`/`boot.js` but never placed on `ctx`** (Task 5, deviation "Task 5's
brief would put session-spawning on the view-visible DataApi") — `ctx.data` is the exact object every view receives,
unfiltered, so every session-control call (`startSession`, and later `sendInput`/`resizeSession`/`subscribeSession`/
`confirmClose`/`resumeSession`) lives on `shell` instead, reachable only by the privileged shell chrome that Tasks 5-13
add outside `#app`; `data`/`DataApi` keeps taking only genuinely read-only additions (Task 8's `backgroundTasks`,
Task 9's `toolResult`).

**Tech Stack:** Rust 2024 edition; existing `tauri` 2.12.5; `portable-pty` (wezterm's crate; exact version pinned by
Task 1's `findings.md`) for the PTY, both platforms — not `tauri-plugin-pty`: its commands would be reachable from
the same unsandboxed JS context a view runs in, the same gap Task 4 closes for these hand-written commands;
`portable-pty` used directly keeps that boundary in one place this plan controls. `uuid` (`v4` feature, parsing only
— ids are generated client-side, Task 5) in both the core and the app. `@xterm/xterm` + `@xterm/addon-fit` vendored
into `app/shell/vendor/` the way `marked`/`dompurify`/`mermaid` already are (exact files and version pinned by Task
1's `findings.md`: `xterm.mjs`, `addon-fit.mjs`, `css/xterm.css`). `@tauri-apps/api`'s `core.js` and `event.js`
(Tauri's own official `invoke`/`listen`, MIT) vendored the same way (Task 4) — `withGlobalTauri: false` leaves
nothing on `window` for `boot.js` to read `invoke`/`listen` off of, and this app has no bundler; vendoring the real
package keeps `boot.js` on Tauri's documented, versioned API rather than its internal, undocumented
`window.__TAURI_INTERNALS__` transport. No new npm _runtime_ dependency either way (vendored, not installed).
Output streams over
a `tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>` (`InvokeResponseBody::Raw`), not `Channel<Vec<u8>>` or
`emit` — confirmed in Task 1's spike, `Vec<u8>` serializes as a JSON array, not raw bytes. The channel is always a
command _parameter_ the caller constructs and passes into `invoke()`, never part of a return value — Tauri's own
Channel pattern requires this, confirmed working this way in Task 3. Existing `ts-rs` bindings generation, `jsdom`
view tests, Nix packaging.

**Spec:** [spec.md](spec.md). Background and decisions: [flow.md](flow.md). ADR:
`docs/adr/0007-flow-cockpit-hosts-claude-sessions.md`.

## Global Constraints

- A session's launch command (folder/worktree, model, effort, prompt, `--session-id`): resolved in one launch-command
  builder in the core, fed by a session id the start form generates once (`crypto.randomUUID()`) and reuses unchanged
  for both its preview and the real launch; never seen by the PTY layer (argv and cwd only) or by views (structured
  start-form fields only, never raw flags).
- Session control (spawn, keystrokes, resize, kill): resolved in privileged, non-extensible Tauri commands; never
  seen by any view, built-in or from a repository, as far as Tauri's own capability system allows without sandboxing
  views in their own window or iframe — Task 4's residual risk, recorded in `spec.md`.
- Which transcript belongs to a hosted session: resolved by the cockpit always passing the generated `--session-id`
  at launch, so the existing run/session index (`core/src/index/links.rs`) keeps working unchanged; never seen by the
  terminal/PTY layer, which only forwards keystrokes and bytes.
- Background-command output (the undocumented `tasks/<id>.output` path): resolved in one output-reader module behind
  an interface the Session tab's view never sees the path shape of; a task id coming from a view is validated before
  it ever reaches the filesystem; if the path changes, only that module changes, and the feature degrades to
  foreground-only output rather than breaking.
- Whether a resumed session might be live elsewhere: not detected. "Resume" on a hosted session with an open tab
  focuses that tab; on any other listed session it runs the plain resume command, by the session's own known folder
  and id, the same as typing it in a terminal; no liveness lock anywhere.
- No Claude Code feature may be lost: the PTY and terminal emulator must not intercept, rewrite or filter escape
  sequences; a hosted session is a plain foreground `claude` process, never `--bg`. Ctrl+R reaches the PTY, not the
  window's own reload handler, when a hosted terminal has focus.
- Stopping a hosted session is graceful first (SIGHUP via `portable-pty`'s own killer, with a wait), forced only if
  that doesn't work within a few seconds — never a bare `child.kill()` alone (Task 1 confirmed that orphans every
  Bash command the session started) — on every path that stops one: `kill_session`, `kill_all` on window close, and
  a session that's simply resumed-over or replaced.
- Views stay exactly as flow-observability built them: sandboxed, read-only TypeScript against `DataApi`; this
  feature adds to `DataApi` (read-only) but adds no write path through it. A command that spawns, controls, or
  streams a process's raw output is never added to `data`/`DataApi` — `ctx.data` is the exact, unfiltered object
  every view (built-in or from a repository) receives, confirmed at `runtime.js`'s `ctx = Object.freeze({ data, ... })`
  — such a command goes on the separate, privileged-only `shell` object instead (see Architecture), used only by the
  shell chrome itself, never placed on `ctx`.
- One version for everything: `plugin.json`, `[workspace.package] version`, and every workspace package's `Cargo.lock`
  entry in `crates/flow-cockpit/`.
- Vendored libraries (`app/shell/vendor/`) and generated bindings (`bindings/`) stay excluded from treefmt and
  end-of-file-fixer, kept LF by `.gitattributes`; a new vendored library's LICENSE goes into `THIRD_PARTY.md`.
- Every type that crosses to the views derives `TS`; `export_bindings` and `bindings_are_current` stay green. A task
  that adds or changes such a type regenerates and commits the bindings, and adds it to `api.d.ts`'s re-export list
  (`api_re_exports_every_binding` enforces this already).
- A new or changed Tauri command is added, in the same task that adds it, to: `main.rs`'s `generate_handler!` list,
  `build.rs`'s `AppManifest::commands` list (Task 4 — without an entry there, its `allow-<command>` permission in a
  capability file doesn't exist for the schema to validate), a matching `allow-<command>` permission in a capability
  file, and — a read-only command to the `data` object, a session-control command to the `shell` object — in
  `runtime.js`.
- Rust tasks load `rust-skills:rust-best-practices`; shell/view TS tasks load `hallmark:hallmark` (app scope) and
  keep `sloplint --scope app` clean.
- Commit messages are one sentence, no co-author lines; stage with `git add -u` plus new paths by name.
- Before you write: read the task and the code it touches, list every place the change must reach, and check what it
  could break for users. That is scope; extra features are not.

## Review Focus

1. **A hosted session's process dies on its own** (crash, killed outside the cockpit, `claude` not on PATH): the
   cockpit notices and shows it, rather than a terminal pane that looks alive but is a dead PTY. Pinned by
   `exit_is_reported` (Task 3) and `missing_binary_shows_a_launch_error` (Task 5).
2. **Resizing the pane resizes the PTY**, both at open and on every later resize, or output wraps wrong and `claude`'s
   own TUI redraws badly. Pinned by `resize_reaches_the_pty` (Task 3) and `fit_triggers_resize` (Task 6).
3. **Closing the window with hosted sessions in several projects** reaps every one of them, even if one is
   unresponsive, rather than orphaning a `claude` process. Pinned by `close_kills_every_hosted_session` (Task 12).
4. **A large or fast burst of PTY output** (a long diff, a verbose tool result) doesn't block the UI thread; a UTF-8
   character split across two PTY reads still renders correctly (confirmed in Task 1's spike: `xterm.js` handles
   this on its own given raw bytes, pinned by `priming_does_not_send_terminal_replies`'s fixture data, which spans a
   multi-byte boundary, Task 6).
5. **The background-command output path is wrong or gone** (a future Claude Code version moves it): the Session tab
   still shows the foreground conversation; it doesn't error or hang waiting on a file that will never appear. Pinned
   by `missing_output_file_degrades_quietly` (Task 8).
6. **No view, built in or from a repository, can spawn, type into, resize or kill a session**, even though it runs in
   the same JS context as the app's own chrome. Pinned by `window_tauri_is_not_global` and
   `every_registered_command_has_a_capability` (Task 4).
7. **A hosted session's terminal survives the view runtime's own redraws and reloads**: a poll tick, a project
   switch, or an F5 doesn't tear down or lose a live PTY's on-screen state. Pinned by
   `redraw_keeps_the_same_terminal_element` and `reload_rehydrates_hosted_sessions_from_the_backend` (Task 7).

---

## Slice 1 (Linux)

### Task 1: Design checkpoint spike — a real session in an embedded PTY

**Does:** Proves, throwaway, that a real `claude` session (plan mode, a question, a background command, resize,
color, Unicode, a prompt starting with `-`) works inside a PTY embedded in this Tauri shell, pins the facts later
tasks need, and checks the one assumption a GUI-launched app can't take for granted: finding `claude` at all.
**Depends on:** none

Not product code (brainstorming's Spike rule); its findings settle values the rest of this plan pins, the way
`web-mcp-search`'s Task 1 did. If a finding contradicts a later task's assumption, that task is rewritten before it
starts, and the plan is re-reviewed.

**Files:**

- Create: `docs/features/cockpit-harness/findings.md`
- Scratch: a short-lived branch or worktree of the real `crates/flow-cockpit/app/` crate for Steps 2-4, so the spike
  runs under this shell's real CSP and capabilities rather than a throwaway window's; a fully separate scratch
  project is fine only for Step 1's bare version check.

- [ ] **Step 1:** Pin exact versions: `portable-pty` (crates.io, latest stable) and `@xterm/xterm` +
      `@xterm/addon-fit` (npm, latest stable), and record them.
- [ ] **Step 2:** Spawn `claude` in a PTY with `portable-pty`'s `CommandBuilder`, wire its reader to `xterm.js`'s
      `write`, wire `xterm.js`'s `onData` to the PTY writer. Confirm: the prompt draws correctly, color and Unicode
      render, and typing works both ways.
- [ ] **Step 3:** Exercise `/plan`-mode, an `AskUserQuestion`-style prompt, and a backgrounded Bash command
      (`sleep 5 && echo done &` from inside the session). Record: what the backgrounded command's output file is named and
      where it lives on this machine (confirm or correct the path noted in the spec's Constraints), and whether
      `claude`'s own screen redraws correctly after a resize sent through `portable-pty`'s `resize()`. Also start a
      session with a first prompt beginning with `-`, with a literal `--` placed before it in argv, and confirm
      `claude` reads it as the prompt text, not a flag.
- [ ] **Step 4:** Check whether `claude` is reliably found on `PATH` when this app is launched as a GUI program
      rather than from a shell (a GUI launch typically doesn't inherit a login shell's `PATH`). If a bare lookup
      fails, record a resolution that works here (for example, resolving the user's login shell's `PATH`, or a known
      install location) for Task 3 to use.
- [ ] **Step 5:** Kill the PTY's child process both normally and mid-command; confirm no orphaned process remains
      (`ps` after the window closes).
- [ ] **Step 6:** Write `findings.md`: the two pinned versions; the exact resize call that works; the background
      output path confirmed; the `claude`-on-`PATH` resolution; anything about chunking, encoding or color that
      surprised you; whether the `--`-before-prompt behavior held; whether anything in Tasks 2-14 below needs to
      change because of what you found.
- [ ] **Step 7: Commit** `findings.md` as a planning artifact (not product code); discard the scratch branch's app
      changes themselves, or keep them only as reference outside the branch.

### Task 2: The launch-command builder

**Does:** Turns a start form's fields into the exact `claude` command line, as one pure function, so no other module
builds or guesses at CLI flags.
**Depends on:** none

**Files:**

- Create: `crates/flow-cockpit/core/src/session/launch.rs`
- Modify: `crates/flow-cockpit/core/src/lib.rs` (`pub mod session;`)
- Modify: `crates/flow-cockpit/core/Cargo.toml` (`uuid`, `v4` feature)
- Test: inline `#[cfg(test)]` in `launch.rs`

**Interfaces:**

- Produces:
  - `pub struct LaunchSpec { pub cwd: PathBuf, pub new_worktree: Option<String>, pub model: Option<String>, pub
effort: Option<String>, pub prompt: Option<String>, pub session_id: Uuid }`. `cwd` is already the right folder
    for "an existing worktree" or "the checkout itself" (the start form resolves which); `new_worktree: Some(name)`
    is set only for "a new worktree by name" (the spec's only new-worktree case), and is the only thing that adds
    `-w`. There is no unnamed-worktree case, so no `Option<Option<_>>` is needed.
  - `pub fn build_start_argv(spec: &LaunchSpec) -> Vec<String>`: `["claude", "--session-id",
spec.session_id.to_string()]`, then `["--model", m]` if `model` is set, `["--effort", e]` if `effort` is set,
    `["-w", name]` if `new_worktree` is set, then, if `prompt` is set, a literal `"--"` followed by the bare prompt —
    so a prompt starting with `-` is never read as a flag (shell-quoting is the PTY writer's job, not this
    function's: it returns argv, not a shell string).
  - `pub fn build_resume_argv(id: Uuid) -> Vec<String>`: `["claude", "--resume", id.to_string()]`. Id only, not a
    name: Claude Code's own `--resume` keeps the original session id, and this plan keys a resumed hosted session by
    that same id (Task 3), so resuming by a human-typed name has no way to become that key reliably.
  - `pub fn preview_command(spec: &LaunchSpec) -> String`: the same argv, joined and shell-quoted, for the start
    form's "exact command" display. `spec.session_id` is the one id the caller generated once (Task 5) and passes
    into every preview call and the real launch; this function never generates its own, so the previewed command and
    the one that runs are always byte-identical.

- [ ] **Step 1: Write the failing tests:** `start_argv_has_session_id_and_model_and_effort`,
      `start_argv_new_worktree_adds_dash_w`, `start_argv_prompt_is_after_double_dash` (including a prompt starting
      with `-` staying intact), `resume_argv_takes_an_id`, `preview_command_matches_the_given_id`.
- [ ] **Step 2:** `cargo test -p flow-cockpit-core session::launch`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `LaunchSpec`, `build_start_argv`, `build_resume_argv`, `preview_command`.
- [ ] **Step 4:** `cargo test -p flow-cockpit-core`, then `cargo clippy --all-targets -- -D warnings`; expect PASS.
- [ ] **Step 5: Commit** "Build a hosted session's launch command in one place."

### Task 3: The hosted session registry and PTY lifecycle

**Does:** Spawns a `claude` process in its own PTY, keeps it reachable by a session id, forwards its output, input
and resize, and stops it cleanly — gracefully first, so Claude Code's own exit path gets a chance to run (and every
Bash command it started, foreground or background, gets reaped instead of orphaned), then by force.
**Depends on:** Task 1 (the pinned `portable-pty` version, the resize call, the `claude`-on-`PATH` resolution, the
kill mechanism — `findings.md`'s "What changes in Tasks 2-14"), Task 2 (`LaunchSpec`, the argv builders)

Rewritten 2026-10-31 after Task 1's spike (deviation, "Task 1's spike findings contradict the plan in six places",
decided: rewrite + self-review): the output channel type, the graceful-kill mechanism, and the `claude`-on-PATH
resolution all changed from the plan's original assumptions to what the spike actually found working.

**Rewritten again 2026-10-31** after this task's own implementation (deviation, "Task 3's implementation needed
several real interface changes from the brief", decided: accept all, expose `subscribe` as a command now):
`tauri::ipc::Channel` can only be a command _parameter_, never returned — it is created client-side and passed into
`invoke()`, so `start_session`/`resume_session` take it as an argument instead of "handing it back"; a session's live
output also needs a way to be _re-attached_ without relaunching (a `Channel` doesn't survive a page reload), so a new
`subscribe_session` command exists for that; `scrollback` and the two launch commands return errors/strings, not the
bare types first written here; and a session that exits stays registered, holding its last output, until
`kill_session` dismisses it — so a crash moments after launch still shows something rather than vanishing.

**Files:**

- Create: `crates/flow-cockpit/app/src/pty.rs`
- Modify: `crates/flow-cockpit/app/src/main.rs` (register `start_session`, `resume_session`, `subscribe_session`,
  `send_input`, `resize_session`, `kill_session`, `hosted_sessions`, `scrollback` in `generate_handler!`; hold the
  registry in Tauri state), `crates/flow-cockpit/app/Cargo.toml` (`portable-pty`, `uuid`)
- Not modified by this task: `crates/flow-cockpit/app/capabilities/default.json` — adding `allow-<command>` entries
  before `app/build.rs` has an `AppManifest` fails the build outright ("Permission allow-start-session not found"),
  confirmed by Task 1's own finding ("Affects Task 4: nothing to change... with a bare `tauri_build::build()` the
  spike's commands ran under `core:default` with no `allow-` entry"). Task 4 adds every entry, including this task's
  8 commands, together with the `AppManifest` in one step.
- Test: `#[cfg(test)]` in `pty.rs` using `echo`/`cat`/a short sleep loop as the spawned command instead of `claude`,
  so the suite needs no real Claude Code install

**Interfaces:**

- Consumes: `core::session::{LaunchSpec, build_start_argv, build_resume_argv}`.
- Produces:
  - A Tauri-side `LaunchSpecInput` (the form's fields as plain strings/options, including `session_id: String`):
    `start_session(input: LaunchSpecInput, cols: u16, rows: u16, on_output: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>) -> Result<String, String>`
    parses `session_id` as a `Uuid` (an invalid UUID is an error, never silently replaced) and the rest into a
    `LaunchSpec`, calls `HostedSessions::start(spec, cols, rows)`, then `subscribe(id, on_output)`; returns the id as
    a `String` (matches `resume_session`'s own `id: String` parameter; avoids needing `uuid`'s `serde` feature).
  - `pub struct HostedSessions` (Tauri-managed state):
    - `pub fn start(&self, spec: LaunchSpec, cols: u16, rows: u16) -> Result<Uuid, String>` — spawns with
      `portable_pty::native_pty_system()`, a `PtySize` built from the caller's own pane size (never a hardcoded
      default), `spec.cwd` as the child's working directory, and `TERM=xterm-256color`/`COLORTERM=truecolor` set on
      the `CommandBuilder` (a GUI launch has neither, so without this the session draws with no color at all). The
      `claude` binary is resolved by trying the inherited `PATH` first; if that lookup fails, runs the user's login
      shell once (`$SHELL -lc 'command -v claude; printf "%s\n" "$PATH"'`, falling back to the passwd entry's shell)
      and uses the `PATH` it prints both to find `claude` and as the child's own `PATH` — a GUI-launched app's
      inherited environment often lacks `~/.local/bin`, where Claude Code's native installer puts it. If `claude`
      still can't be found, `spawn_command`'s own error ("claude not found") is returned as-is, not swallowed; this
      is what Task 5's `missing_binary_shows_a_launch_error` needs. `MasterPty` is `Send` but not `Sync`, so each
      session's master lives behind its own `Mutex` inside `HostedSessions` (Tauri-managed state must be `Sync`).
    - `pub fn resume(&self, cwd: &Path, id: Uuid, cols: u16, rows: u16) -> Result<Uuid, String>` — spawns
      `build_resume_argv(id)` with `cwd` as the working directory (same env/PATH handling as `start`), keyed by the
      same `id` it was given.
    - `pub fn write(&self, id: Uuid, bytes: &[u8]) -> Result<(), String>`
    - `pub fn resize(&self, id: Uuid, cols: u16, rows: u16) -> Result<(), String>` — `master.resize(PtySize { rows,
cols, pixel_width: 0, pixel_height: 0 })`; `CommandBuilder`'s default `set_controlling_tty(true)` is what
      delivers `SIGWINCH` to `claude` and must stay on.
    - `pub fn kill(&self, id: Uuid) -> Result<(), String>` — **not** a simple drop-then-wait: dropping the PTY
      writer on Unix writes a literal `\n` and Ctrl+D into the session (typing Enter and EOF into `claude`, not a
      quiet close), and dropping the master doesn't hang up anything while the reader thread's cloned reader is
      still open. The real graceful stop is `child.clone_killer().kill()` (SIGHUP on Unix, via `portable-pty`'s own
      killer — not `child.kill()`, which escalates to SIGKILL after ~200 ms on Unix); poll `try_wait()` for up to 5
      seconds (the spike saw `claude` take 0.65-1.05 s to exit on a clean SIGHUP), and only call `child.kill()`
      (SIGKILL) if it still hasn't exited by then. Skipping the wait, or using `child.kill()` alone, leaves every
      Bash command `claude` started — foreground or background — running as an orphan reparented to PID 1, and
      skips Claude Code's own `SessionEnd` path entirely (confirmed: `web-mcp` and every spawned shell command exit
      cleanly after a graceful SIGHUP, not after a bare `child.kill()`).
    - `pub fn kill_all(&self)` — runs the same graceful-then-forced stop for every hosted session, in parallel (not
      one after another: serially waiting up to 5 s per session would make closing with several open sessions take
      several times 5 s).
    - `pub fn subscribe(&self, id: Uuid, sink: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>) -> Result<(), String>`
      — replays the scrollback ring buffer into `sink`, then streams live output into it, under one lock so a session
      that exits immediately after subscribing neither loses nor duplicates bytes. Re-attaches a _fresh_ channel to
      an _already-running_ session — it does not start or resume anything.
    - `pub fn scrollback(&self, id: Uuid) -> tauri::ipc::Response` — the last bytes of that session's output, kept in
      a bounded ring buffer alongside its reader thread (raw bytes, the same reason as the output channel below), so
      a pane reconnecting after a window reload (Task 7) can be primed before new output resumes.
    - `pub fn ids(&self) -> Vec<Uuid>` — every **running** session (one that has exited stays registered, holding its
      last output and reachable by `scrollback`/`subscribe`, until `kill` is called — never silently dropped — but is
      not listed here).
  - Tauri commands `start_session`, `resume_session(cwd: String, id: String, cols: u16, rows: u16, on_output:
tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>) -> Result<String, String>` (same `on_output`/return-type
    treatment as `start_session`), `subscribe_session(id: String, on_output: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>) -> Result<(), String>`
    (wraps `subscribe`; this is what Task 7 calls to re-attach a hosted session's output to a freshly mounted pane
    after a reload, without relaunching anything), `send_input`, `resize_session`, `kill_session`,
    `hosted_sessions() -> Vec<String>` (wraps `ids`), `scrollback(id: String) -> Result<tauri::ipc::Response, String>`
    (an unknown id is a reportable error, not an empty response).
  - A session's output streams over a `tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>`, sending each chunk as
    `InvokeResponseBody::Raw(bytes)`. **Not** `Channel<Vec<u8>>`: confirmed in Task 1's spike, that serializes every
    chunk as a JSON array of numbers (arrives in JS as a plain array), where `InvokeResponseBody::Raw` arrives as an
    `ArrayBuffer`. **The channel is always a command _parameter_, never part of a return value**: Tauri's own Channel
    pattern requires the frontend to create the channel object and pass it into the `invoke()` call that will feed
    it — `start_session`, `resume_session` and `subscribe_session` all take `on_output` this way; none of them return
    one. Output isn't broadcast to every `listen`er either way. `session-exited` (`{ id, code: Option<i32> }`) stays a
    plain `emit` (rare, small payload, consumed only by the app's own shell chrome, not a view — so it needs no `TS`
    derive or bindings entry); the reader thread sees EOF when the child exits, the natural place to `wait()` it and
    emit this (observed exit codes: 129 after SIGHUP, 143 after SIGTERM, a signal after SIGKILL).

- [ ] **Step 1: Write the failing tests:** `spawns_and_reads_output`, `resize_reaches_the_pty` (spawn `cat`, resize
      with an explicit size, assert `portable-pty`'s reported size changed), `kill_sends_graceful_stop_before_sigkill`
      (a fixture child that traps SIGHUP and only exits on a second signal still gets killed within the timeout, via
      the forced phase), `kill_stops_the_child`, `graceful_kill_does_not_orphan_a_child_process` (a child that spawns
      its own grandchild process, killed gracefully, leaves no grandchild behind — this is the orphan Task 1 found
      with a bare `child.kill()`), `exit_is_reported`, `scrollback_returns_the_last_bytes_written`,
      `resume_uses_the_given_id_and_cwd`, `claude_not_found_is_a_spawn_error_not_a_panic` (a `PATH` with no `claude`
      on it, and no working login shell to fall back to, surfaces `spawn_command`'s own error),
      `subscribe_replays_scrollback_then_streams_live` (a session subscribed to after it has already produced output
      gets that output once, then new output as it arrives — no loss, no duplication), `exited_session_stays_reachable_until_killed`
      (after a session exits, `scrollback`/`subscribe` still work on its id, but `ids()` no longer lists it, until
      `kill` is called).
- [ ] **Step 2:** `cargo test -p flow-cockpit pty`; expect FAIL.
- [ ] **Step 3: Implement** `HostedSessions` over `portable_pty::native_pty_system()`, one `PtyPair` and child per
      session (each master behind its own `Mutex`), a reader thread per session feeding both the output channel and
      the scrollback ring buffer and calling `wait()`/emitting `session-exited` on EOF.
- [ ] **Step 4:** `cargo test -p flow-cockpit`, then `cargo clippy --all-targets -- -D warnings`; expect PASS.
- [ ] **Step 5: Commit** "Spawn and own a hosted session's process in its own PTY."

### Task 4: Lock session control behind the app's own boundary

**Does:** Closes, as far as Tauri's current primitives allow, the gap where a view's own script — built in or from a
repository — could call a session-control command directly; records what remains open.
**Depends on:** Task 3

Today nothing stops it: `tauri.conf.json` sets `"withGlobalTauri": true`, exposing `window.__TAURI__` to every script
in the window, views included (`boot.js:5`), and `app/build.rs` is a bare `tauri_build::build()` with no
`AppManifest`, so capability files don't actually gate app commands yet — `capabilities/default.json`'s list has been
cosmetic until this task.

**Rewritten 2026-10-31** after this task's own implementation (deviation, "Task 4's boot.js has no way to get
invoke/listen once withGlobalTauri is off", decided: vendor `@tauri-apps/api`): turning `withGlobalTauri` off leaves
nothing on `window` for `boot.js` to read `invoke`/`listen` off of at all — the brief's "close over
`tauri.core.invoke`/`tauri.event.listen`" assumed a mechanism that no longer exists once this task's own change lands.
Vendor `@tauri-apps/api`'s `core.js`/`event.js` (its real `invoke`/`listen`) the same way `xterm.js` is vendored,
rather than hand-rolling a replacement against `window.__TAURI_INTERNALS__` (Tauri's own private transport, not a
documented or versioned API).

**Files:**

- Modify: `crates/flow-cockpit/app/tauri.conf.json` (`"withGlobalTauri": false`)
- Create: `crates/flow-cockpit/app/shell/vendor/core.js`, `app/shell/vendor/event.js` (upstream `@tauri-apps/api`
  file names, vendored as-is; pin the version against the installed `tauri` 2.12.5 and record it in a comment or
  alongside `THIRD_PARTY.md`'s entry), `app/shell/vendor/LICENSE-tauri-apps-api`
- Modify: `crates/flow-cockpit/app/shell/boot.js` (import `invoke`/`listen` from the vendored module instead of
  reading them off `window`; a view never receives them — it only ever gets `data`/`ctx`, as today)
- Modify: `crates/flow-cockpit/app/build.rs` (`tauri_build::Attributes::new().app_manifest(AppManifest::new()
.commands(&[...]))`, listing every command: the 9 existing read-only ones and the new session ones)
- Modify: `crates/flow-cockpit/app/capabilities/default.json` (an `allow-<command>` permission for every command now
  actually enforced)
- Modify: `THIRD_PARTY.md` (`@tauri-apps/api`, MIT), `.gitignore` (`crates/flow-cockpit/app/permissions/autogenerated/`
  — `tauri-build` writes this once an `AppManifest` exists, the same way it already writes `app/gen/`)
- Test: a jsdom test plus a Rust test

**Interfaces:**

- No new Rust type. A jsdom test loads the shell exactly as the window does and asserts `window.__TAURI__` is
  `undefined` after `boot.js` runs. A Rust test reads `main.rs`'s `generate_handler!` list and
  `capabilities/default.json` and asserts every listed command has a matching `allow-<command>` permission, so a
  future command can't be added to one and forgotten in the other.

- [ ] **Step 1: Write the failing tests:** `window_tauri_is_not_global` (jsdom), `every_registered_command_has_a_capability` (Rust).
- [ ] **Step 2:** Run both; expect FAIL.
- [ ] **Step 3: Implement:** flip `withGlobalTauri`, wire the `AppManifest`, fill in the capability file.
- [ ] **Step 4:** Manually confirm the residual risk: in the built app's devtools console,
      `window.__TAURI_INTERNALS__.invoke('kill_session', …)` still reaches the command, because views run in the
      same JS realm as the app's own chrome, with no iframe or separate webview between them. Record this as a known
      limitation in `spec.md`'s Constraints (a one-line note, reopening Gate 1) rather than claiming it's closed —
      full isolation needs a sandboxed iframe or a second webview for views, out of scope for this slice.
- [ ] **Step 5:** Run the tests; expect PASS.
- [ ] **Step 6: Commit** "Stop exposing the raw Tauri API to views, and make the session-control capability real."

### Task 5: The start form

**Does:** Lets the user fill in a project, folder or new worktree, model, effort and a first prompt, see the exact
command, and start a hosted session.
**Depends on:** Task 2 (`preview_command`), Task 3 (`start_session`)

**Rewritten 2026-10-31** after the implementer stopped before writing code (deviation, "Task 5's brief would put
session-spawning on the view-visible DataApi", decided: a second, privileged-only `shell` object): `runtime.js`'s
`data` object is exactly what every view receives as `ctx.data`, unfiltered (`runtime.js:526`,
`Object.freeze({ data, ... })`) — putting `startSession` there would let any view, repository ones included, spawn an
arbitrary `claude` process, reopening Task 4's boundary one layer up. `startSession` (and every later session-control
call) goes on a new `shell` object instead, built the same way as `data` but never placed on `ctx`; only the
privileged shell chrome reaches it. The "Start session" entry point is shell-mounted (outside `#app`, a dialog), not
a change to the list view. `preview_command` is also allowed to extract its shared spec-building logic from Task 3's
`pty.rs` rather than duplicate it, to keep the previewed and real launch commands from silently drifting apart.

**Files:**

- Create: `crates/flow-cockpit/app/shell/start-form.js`
- Modify: `crates/flow-cockpit/app/src/commands.rs` (`preview_command(input: LaunchSpecInput) -> Result<String,
String>`, reusing a small shared conversion/id-parsing helper extracted from `pty.rs` rather than duplicating it),
  `crates/flow-cockpit/app/src/pty.rs` (extract that helper, e.g. `pub(crate) fn into_spec(input: LaunchSpecInput) ->
Result<(Uuid, LaunchSpec), String>`, used by both `start_session`/`resume_session` and `preview_command`), `crates/
flow-cockpit/app/src/main.rs` (`generate_handler!`), `crates/flow-cockpit/app/build.rs` (add `preview_command` to
  the `AppManifest`'s command list, Task 4), `crates/flow-cockpit/app/capabilities/default.json`
- Modify: `crates/flow-cockpit/app/shell/boot.js` (build a `shell` object from `invoke`, the same way `data` is
  built, but pass it only to the start form — never into `createRuntime`'s `ctx`), `crates/flow-cockpit/app/shell/
runtime.js` (`data.previewCommand` — read-only, stays on the view-visible object; export whatever hook lets
  `boot.js` mount the start-form dialog as shell chrome, outside `#app`), `crates/flow-cockpit/app/shell/api.d.ts`
  (`DataApi.previewCommand`; a new, separate type for `shell`'s shape — not part of `DataApi`/`ViewContext`)
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs` or a new `start-form.test.mjs` (jsdom; check `boot.test.mjs`
  for precedent on adding a separate test file)

**Interfaces:**

- Consumes: `data.previewCommand`, `data.entries` (existing `DataApi`, for "Continue"); `shell.startSession` (the new,
  non-view-visible object).
- The form generates one `crypto.randomUUID()` when it mounts (or resets), and passes it as `session_id` in every
  `previewCommand` call and the final `startSession` call: the previewed command and the one that runs are the same
  string. `startSession` must pass a `Channel` as `start_session`'s `on_output` argument (Task 3's signature requires
  one); the form creates one but attaches no handler to it — it never displays output itself. The terminal pane (Task
  6/7) gets its own, real listening channel later, via `shell.subscribeSession`, when it actually mounts.
  **Superseded by the final whole-branch review** (flow.md Deviations, "The final whole-branch review found three
  Important findings that are deviation-class", item #2): to answer a session's own startup terminal queries (DA1,
  focus) before anything is listening, `boot.js`'s `launchInto` now mounts the pane and attaches its real,
  already-live channel _before_ calling `start_session`/`resume_session`, passing that real channel as `on_output`
  directly — there is no unread throwaway channel in the shipped code. `shell.subscribeSession` remains the mechanism
  for reload-rehydration (an already-running session, found via `hosted_sessions()` at boot).
- "Continue" on a listed flow run whose `phase` isn't `done` pre-fills the prompt as `/flows:<skill> <slug>`.
  `FlowRunSummary.conductor` is the flow's `flow:` value (for example `"feature"`), not the skill's name
  (`"feature-flow"`); the form maps it through one small table (`feature` → `feature-flow`, `research` →
  `research-flow`, `implement` → `implement`, `fix` → `fix-flow`, `upgrade` → `upgrade`) before building the command.
- The "Start session" entry point is a button the shell chrome mounts outside `#app` (next to `#terminals`, say),
  opening the form as a `<dialog>`; "Continue from a run" is a select inside the form, filled from `data.entries`
  (read-only, safe on `DataApi`) — no view is modified to add this entry point.

- [ ] **Step 1: Write the failing tests:** `preview_updates_as_fields_change`,
      `continue_prefills_the_flow_command_with_the_skill_name`,
      `session_id_is_generated_once_and_reused_for_preview_and_start`, `start_calls_start_session_with_the_built_spec`
      (via `shell.startSession`, not `data`), `missing_binary_shows_a_launch_error` (a rejected `startSession` promise
      renders a visible error, not a silent no-op), `shell_object_is_never_passed_to_a_view` (a view's `ctx` has no
      `startSession`/`shell` property, even though the form can call it).
- [ ] **Step 2:** `node --test "crates/flow-cockpit/app/shell/*.test.mjs"`; expect FAIL.
- [ ] **Step 3: Implement** `pty.rs`'s shared helper, `commands.rs`'s `preview_command`, `boot.js`'s `shell` object,
      and `start-form.js`: a plain form over the fields above, calling `data.previewCommand` on every change, calling
      `shell.startSession` with a reasonable default pane size (the terminal pane doesn't exist yet to measure — Task
      6/7's fit addon sends the real size as soon as it mounts), navigating to `{ to: 'session', project, id }` on
      success.
- [ ] **Step 4:** Run the view tests; expect PASS. Run `sloplint --scope app`; expect clean.
- [ ] **Step 5: Commit** "Add the start form for a hosted session, behind a shell-only object no view can reach."

### Task 6: The terminal pane

**Does:** Draws a hosted session's live terminal in a host that survives the view runtime's own redraws, forwarding
keystrokes and resizes to its PTY.
**Depends on:** Task 1 (the pinned `xterm.js` version and the resize call), Task 3 (the PTY commands, `subscribe_session`,
`scrollback`)

Rewritten 2026-10-31 after Task 1's spike (same deviation as Task 3): no separate chunk decoder is needed, and
priming a reconnected pane from scrollback needed a guard Task 1 found missing. Rewritten again 2026-10-31 after
Task 3's own implementation (deviation, "Task 3's implementation needed several real interface changes from the
brief"): the pane gets its live-output channel from `subscribe_session`, not from `start_session`'s own channel (the
form's channel to `start_session`, Task 5, is never read) — `subscribe_session` always replays the ring buffer then
streams live into whatever channel it's given, so this one call covers both a freshly started session (an empty
replay) and a reload-rehydrated one (a real backlog) uniformly.

**Files:**

- Create: `crates/flow-cockpit/app/shell/vendor/xterm.mjs`, `app/shell/vendor/addon-fit.mjs`,
  `app/shell/vendor/xterm.css`, `app/shell/vendor/LICENSE-xterm` (upstream's real file names — vendored as-is, not
  renamed, confirmed in Task 1's spike)
- Create: `crates/flow-cockpit/app/shell/session-pane.js`
- Modify: `crates/flow-cockpit/app/shell/index.html` (a `<div id="terminals"></div>` sibling of `#app`, outside the
  view runtime's `replaceChildren`; a `<link rel="stylesheet" href="vendor/xterm.css">`)
- Modify: `THIRD_PARTY.md` (xterm.js, MIT)
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs`

**Interfaces:**

- Produces:
  - `session-pane.js`: `export function mountSessionPane(sessionId: string, api: { write, resize, subscribe, onExit,
scrollback }): { element: Element, dispose: () => void }` — `session-pane.js` itself touches neither `data` nor
    `shell`; it only calls whatever `api` it's given. Task 7 builds that `api` by wrapping `shell.sendInput`,
    `shell.resizeSession`, `shell.subscribeSession` and `shell.scrollback` — all on the privileged object (Task 5).
    **Not `data.scrollback`**: corrected 2026-10-31 (deviation, "Task 7's implementation exposes a hosted session's
    raw terminal bytes to every view", decided: move to `shell`) — `scrollback` returns a session's actual buffered
    terminal content, which is exactly "a process's raw output" the Global Constraints already say never belongs on
    the view-visible `data`/`DataApi`, not a "read-only, therefore safe" exception; the original text here
    contradicted that constraint. Creates (or reuses, if
    already mounted for that id) a `<div>` under `#terminals`, with a font stack that includes glyphs for box-drawing
    and the status symbols
    the cockpit's own output uses (`⎿`, `☐`) rather than bare `monospace`, which Task 1 found falls back to a font
    without them. `api.subscribe(sessionId, onChunk)` wraps `subscribe_session`, whose own replay is exactly as many
    bytes as `api.scrollback(sessionId)` returns (both read the same ring buffer) before it turns live — the pane
    fetches `scrollback`'s bytes first (and remembers their count), then subscribes once, and treats the first
    `count` bytes of the subscribed stream as the replay: written to the terminal immediately, with `onData` left
    unattached (or its output discarded) until they've all arrived. Only once that many bytes have passed does
    `onData` start forwarding to `send_input`.
    Without this, replaying scrollback into a fresh `Terminal` makes `xterm.js` re-answer `claude`'s own startup
    terminal queries (DA1, focus-state) through `onData`, which — wired live — types those escape sequences into the
    running session (confirmed in Task 1's spike: a 2758-byte replay alone produced two such replies). Every chunk,
    replay or live, is written the same way: `term.write(new Uint8Array(bytes))` — `xterm.js` 6.0.0 already holds a
    split multi-byte UTF-8 character across writes on its own (confirmed in Task 1's spike), so no separate decoder
    module is needed, and no chunk needs to align with the replay/live boundary either. `onResize` (via the fit
    addon, refit from a `ResizeObserver` on the pane's host) wires to `resize_session`. `dispose()` only detaches
    listeners — it never removes the element while the process is still alive; Task 7 owns showing and hiding it.

- [ ] **Step 1: Write the failing tests:** `fit_triggers_resize` (simulate a container resize, assert `resize` is
      called with the new cols/rows), `scrollback_primes_the_terminal_before_live_output`,
      `priming_does_not_send_terminal_replies` (feed a subscribed stream whose first bytes would normally trigger
      xterm's own query-response output, assert nothing reaches `api.write` as input until past the reported
      scrollback length), `remounting_the_same_session_id_reuses_its_element` (doesn't create a second pane or lose
      scrollback).
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** `session-pane.js` wiring `xterm.js` + the fit addon directly to the PTY commands/channel,
      with the priming guard above.
- [ ] **Step 4:** Run the tests; expect PASS. `sloplint --scope app`; expect clean.
- [ ] **Step 5: Commit** "Draw a hosted session's terminal and wire it to its PTY."

### Task 7: Routing a hosted session's Session tab

**Does:** Shows the terminal pane and chips next to the existing (unmodified) Activity view for a hosted session,
keeps that terminal's DOM alive across the view runtime's own redraws and reloads, and leaves every other session
exactly as flow-observability built it.
**Depends on:** Task 5 (the start form navigates here), Task 6 (the terminal pane)

**Files:**

- Modify: `crates/flow-cockpit/app/shell/runtime.js` (the `session` route's render; `reloadKey`; a position-sync step
  run after every `draw()`)
- Modify: `crates/flow-cockpit/app/shell/boot.js` (seed `hostedSessions` from `shell.hostedSessions()` at boot, not
  just from this window's own `shell.startSession`/`shell.resumeSession` calls)
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs`

**Interfaces:**

- Consumes: a local, app-side `hostedSessions: Set<string>`, seeded from `shell.hostedSessions()` at boot and kept
  current by `session-exited` events and this window's own `shell.startSession`/`shell.resumeSession` results (not
  part of `DataApi` and not placed on `ctx`: `hosted_sessions` joins the privileged `shell` object alongside the rest
  of Task 3's session-control commands, Task 5's deviation decision — this is shell-chrome state, not view data).
- Produces: for `{ to: 'session', project, id }` where `id` is in `hostedSessions`, render the chips (Task 10) and an
  empty placeholder element (`data-terminal-slot="<id>"`) next to the existing Activity view, used as the output
  pane; otherwise render exactly today's session screen. The terminal itself is never drawn inside `#app`: after
  every `draw()`, a position-sync step finds the placeholder (if any) for the currently mounted pane's id and
  moves/resizes the real pane in `#terminals` to match its screen rect (`getBoundingClientRect`, a `ResizeObserver`
  on the placeholder). When no matching placeholder is in the current draw (navigated away, including to a different
  project — Goal 4), the pane is hidden, not destroyed, so `root.replaceChildren(...)` on every poll-triggered
  redraw never touches the live `xterm` instance. `reloadKey`'s Ctrl+R/F5 handler does nothing when
  `document.activeElement` is inside `#terminals`, so Claude Code's own Ctrl+R (history search) reaches the PTY
  instead of reloading the window.
- A hosted session's terminal pane (Task 6) is mounted exactly once per id for the window's lifetime: the first time
  its route is drawn, whether that's right after `startSession`/`resumeSession` or because the id was already in
  `hostedSessions` at boot (a reload). Either way, mounting calls `subscribeSession` (Task 3) for its live channel —
  there is no separate "fresh start" path that reuses `start_session`'s own channel; `subscribe_session`'s built-in
  replay-then-live makes the two cases (nothing buffered yet vs. a real backlog from before the reload) the same
  call.
  **Superseded by the final whole-branch review** (same item as Task 5's note above): a _fresh_ start/resume now
  mounts its pane and attaches its real channel _before_ the launch call (`boot.js`'s `launchInto`), to close a race
  where a startup terminal query could go unanswered — so "mounting calls `subscribeSession`" above describes only
  the _reload-rehydration_ path now; a fresh start's pane is live from byte 0 via its own `on_output` channel, never
  calling `subscribe_session` at all.

- [ ] **Step 1: Write the failing tests:** `hosted_session_shows_the_terminal_pane`, `outside_session_is_unchanged`
      (a fixture id not in `hostedSessions` renders byte-for-byte what today's build renders),
      `switching_project_leaves_other_hosted_sessions_running` (navigating to a different project's list never calls
      `kill_session`, and a hosted session from the first project stays in `hostedSessions`),
      `redraw_keeps_the_same_terminal_element` (two `draw()` calls for the same route don't remount the pane),
      `navigating_away_hides_without_destroying` (the pane element still exists in `#terminals` after leaving the
      route), `ctrl_r_inside_the_terminal_is_not_a_reload` — run against a real mounted `session-pane.js` instance,
      not a plain focused `<div>`: Task 1's spike found a window-level keydown listener didn't fire at all while the
      `xterm.js` pane had focus, which may mean this guard needs nothing (the key never reaches `reloadKey` in the
      first place) or may mean the test needs real `xterm.js` to say which — a jsdom stub div alone won't tell you,
      `reload_rehydrates_hosted_sessions_from_the_backend`.
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** the branch in `runtime.js` and the position-sync step; `hostedSessions` is window-global
      state, never cleared or filtered by the currently viewed project.
- [ ] **Step 4:** Run the tests; expect PASS.
- [ ] **Step 5: Commit** "Show the terminal pane on a hosted session's tab, surviving redraws and reloads, leaving
      other sessions unchanged."

### Task 8: Background-command output

**Does:** Lists a session's backgrounded commands by reading its output folder directly, and reads one's live
output, degrading quietly if the path it depends on ever changes shape.
**Depends on:** Task 1 (the confirmed output path)

Rewritten 2026-10-31 after Task 1's spike (same deviation as Task 3): the folder segment the plan assumed could be
rebuilt from a session's cwd turned out not to be reliable (a worktree session's `tasks/` can sit under its launch
folder rather than the worktree the transcript is under); this task now finds it by session id instead.

**Files:**

- Create: `crates/flow-cockpit/app/src/background_output.rs` (app-level, not core: this reads from the undocumented
  Claude Code runtime folder, not a project's own files — core stays about `~/.claude/projects` and the capture)
- Modify: `crates/flow-cockpit/app/src/paths.rs` (`claude_tmp_dir(env, platform) -> Result<PathBuf, NoHome>`, the
  base of `<tmp>/claude-<uid>/...`, with Linux and Windows tests the way every other resolver here has), `crates/
flow-cockpit/app/src/main.rs` (register `background_tasks`, `background_output`), `crates/flow-cockpit/app/
build.rs` (add both to the `AppManifest`'s command list), `crates/flow-cockpit/app/shell/api.d.ts`
  (`DataApi.backgroundTasks`, `DataApi.backgroundOutput`), `crates/flow-cockpit/app/shell/runtime.js`,
  `crates/flow-cockpit/app/capabilities/default.json`
- Test: `#[cfg(test)]` in `background_output.rs`, against a fixture directory it creates and tears down (no real
  Claude Code needed)

**Interfaces:**

- Produces:
  - `pub struct BackgroundTask { pub id: String, pub started: String }` (`#[derive(TS)]`, exported to
    `bindings/BackgroundTask.ts`). `id` is a `tasks/<id>.output` file's stem; `started` its modified time, formatted
    the way the rest of the app already formats a time.
  - `pub fn claude_tmp_dir(env: impl Fn(&str) -> Option<String>, platform: Platform) -> PathBuf` — `CLAUDE_CODE_TMPDIR`
    when set, else the OS temp dir (`TMPDIR`, else `/tmp` on Linux; `%TEMP%` on Windows, left for Task 14 to confirm
    the uid-equivalent segment), joined with `claude-<uid>` (Linux: `libc::getuid()` — `libc` is already pulled in
    transitively by `portable-pty`, so it's not a new dependency to declare explicitly; just use it directly).
  - `pub fn find_session_tasks_dir(base: &Path, session_id: &str) -> Option<PathBuf>` — searches
    `<base>/*/​<session_id>/tasks` (one level of project-folder names under `base`) rather than reconstructing the
    project-folder segment from the session's own cwd, which Task 1 found unreliable for a worktree session.
  - `pub fn list_background_tasks(dir: &Path) -> Vec<BackgroundTask>` — lists `tasks/*.output` in a session's
    runtime folder, oldest first, **regular files only** (the same folder also holds `a<17 hex chars>.output`
    symlinks to subagent transcripts, confirmed in Task 1's spike — skipping symlinks, or matching only the
    `b[a-z0-9]{8}` background-task-id shape, both work; either is fine as long as a subagent's transcript link never
    becomes a chip); empty if the folder doesn't exist.
  - `pub fn read_background_output(dir: &Path, task_id: &str) -> Option<String>` — `task_id` is validated against
    `^[A-Za-z0-9_-]+$` before touching the filesystem (it can come from a view through read-only `DataApi`, so it
    must never be joined onto a path unchecked); returns `None` (not an error) on an invalid id, a missing file, or
    any read failure. The file's content already ends with Claude Code's own trailer (`[exited with code N]` or
    `[killed]`) — returned as-is, not stripped.
  - `background_tasks(session: String) -> Vec<BackgroundTask>` and `background_output(session: String, task_id:
String) -> Option<String>` Tauri commands call `find_session_tasks_dir(claude_tmp_dir(...), session)`, then the
    functions above.

- [ ] **Step 1: Write the failing tests:** `finds_a_sessions_tasks_dir_by_id_not_by_cwd` (a fixture where the
      project-folder segment doesn't match any derivable form of the session's cwd still resolves, by id),
      `lists_tasks_oldest_first`, `skips_subagent_transcript_symlinks` (a mixed fixture folder with both
      `b########.output` files and `a<hex>.output` symlinks lists only the former), `reads_a_tasks_output`,
      `missing_output_file_degrades_quietly` (nonexistent path returns `None`, not a panic or error),
      `rejects_a_task_id_with_a_path_separator`, `claude_tmp_dir_matches_linux_and_windows` (mirroring
      `paths_match_capture_rules` in `paths.rs`).
- [ ] **Step 2:** `cargo test -p flow-cockpit background_output`; expect FAIL.
- [ ] **Step 3: Implement** `claude_tmp_dir`, `find_session_tasks_dir`, `list_background_tasks`,
      `read_background_output` against the path Task 1 confirmed; wire both Tauri commands and
      `DataApi.backgroundTasks`/`backgroundOutput`; regenerate bindings.
- [ ] **Step 4:** `cargo test -p flow-cockpit`, then clippy; expect PASS.
- [ ] **Step 5: Commit** "Read a backgrounded command's output for the Session tab."

### Task 9: A tool call's full result, and an agent's report

**Does:** Reads a finished tool call's full result, the way its input is already readable, closing the output pane's
main data gap for every session — hosted or outside, not hosted-session-specific.
**Depends on:** none

**Files:**

- Modify: `crates/flow-cockpit/core/src/activity/transcript.rs` (add `tool_result` next to the existing
  `tool_input`)
- Modify: `crates/flow-cockpit/app/src/commands.rs` (`Shared::tool_result`, mirroring `Shared::tool_input`), `crates/
flow-cockpit/app/src/main.rs` (register `tool_result`), `crates/flow-cockpit/app/build.rs` (add `tool_result` to
  the `AppManifest`'s command list), `crates/flow-cockpit/app/shell/api.d.ts` (`DataApi.toolResult`),
  `crates/flow-cockpit/app/shell/runtime.js` (`data.toolResult`), `crates/flow-cockpit/app/capabilities/
default.json`
- Modify: `crates/flow-cockpit/extensions/activity/activity.ts` — `toolRow`'s fold body (lines ~85-109) already loads
  and caches a call's input via `ctx.data.toolInput`/the `inputs` map on open; add a second, same-shaped fold inside
  that body for the result, backed by `ctx.data.toolResult` and its own `results` cache map, shown only once the
  call has finished (`!call.failed` is not the signal — a successful finished call has a result too; show it
  whenever `ctx.data.toolResult` resolves non-null, same "Loading…"/failure handling as `toolInput`'s)
- Test: `core/src/activity/transcript.rs` `#[cfg(test)]` (next to `tool_input`'s own tests), `crates/flow-cockpit/
extensions/tests/views.test.ts` (mirrors its existing `toolInput` fixture, `draw('activity', ...)` pattern)

**Interfaces:**

- `TranscriptCache::tool_result(&mut self, path: &Path, tool: &str) -> Option<String>` — the result-line counterpart
  of `tool_input`, same seek-by-offset approach, same cache.
- `Shared::tool_result(&self, session: &str, tool: &str) -> Option<String>`; Tauri command `tool_result(data,
session, tool) -> Option<String>`; `DataApi.toolResult(session, tool)`.
- A subagent's own final report is already a turn in the merged `Activity`, tagged with its `agent` id (Task 10
  filters by that); no new call is needed for it, only for raw tool-result text.

- [ ] **Step 1: Write the failing tests:** `tool_result_reads_a_finished_calls_output`,
      `tool_result_is_none_for_an_unfinished_or_unknown_call`, `activity_view_shows_a_result_fold_that_loads_on_open`
      (mirroring the existing `toolInput` jsdom test's shape in `views.test.ts`).
- [ ] **Step 2:** `cargo test -p flow-cockpit-core activity::transcript`; expect FAIL.
- [ ] **Step 3: Implement** `tool_result`, the command, `DataApi.toolResult`, and the view's affordance; regenerate
      bindings if needed.
- [ ] **Step 4:** `cargo test -p flow-cockpit-core`, then clippy; run the jsdom tests; `sloplint --scope app`; expect
      PASS / clean.
- [ ] **Step 5: Commit** "Show a tool call's full result in the output pane."

### Task 10: Chips for main, subagents, and "follow latest"

**Does:** Lets the user switch the output pane between the main session, a running subagent, and a background
command, and auto-follow whichever has the newest activity.
**Depends on:** Task 7 (the Session tab's layout), Task 8 (`backgroundTasks`), Task 9 (tool results, so a chip's
output can show them)

**Rewritten 2026-10-31** after the implementer stopped before writing code (deviation, "Task 10's chip selection has
no mechanism to reach the Activity view", decided: a separate output panel): the plan assumed chip selection could
filter the already-rendered Activity view in place, but `activity.ts` fetches and renders its own data internally
(not in this task's Files list, and Task 7 promised it stays unmodified), and a `'background'` chip's content is raw
text with no `Activity` shape to filter into at all. **Chip selection now owns a separate, small output panel in
`runtime.js`, next to the terminal slot, which _replaces_ the Activity view when a chip other than `'main'` is
selected** (picking `'main'` shows the Activity view exactly as Task 7 built it, unchanged). The panel fetches
`data.session(id)`/`data.backgroundTasks(id)` once per draw (not the Activity view's own, separate fetch) and renders
the selected chip's content itself: agent-filtered replies/tool calls for `'main'`/`'agent'` chips (shown in the panel
only when `'main'` isn't selected — when `'main'` is selected, the Activity view itself is shown instead, not the
panel), or `data.backgroundOutput` text for a `'background'` chip.

**Files:**

- Create: `crates/flow-cockpit/app/shell/session-chips.js`
- Modify: `crates/flow-cockpit/app/shell/runtime.js`
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs`

**Interfaces:**

- Consumes: `DataApi.session(sessionId)`, `DataApi.backgroundTasks` (Task 8), `DataApi.backgroundOutput` (Task 8),
  `DataApi.toolResult` (Task 9, for the panel's own tool-call display) — all existing, read-only.
- Produces: `session-chips.js`: `export function buildChips(activity: Activity, backgroundTasks: BackgroundTask[]):
Chip[]` (`{ id, label, kind: 'main' | 'agent' | 'background', lastActivity: string }`) — a `'main'` chip for the
  turns/items with no `agent`, one `'agent'` chip per `activity.agents` entry, one `'background'` chip per background
  task; `export function followLatest(chips: Chip[]): string` (the chip id with the newest `lastActivity`);
  `export function filterActivity(activity: Activity, chip: Chip): { text: Text[], tools: ToolCall[] }` (or an
  equivalent small shape) — the subset of the already-fetched `Activity` belonging to an `'agent'` chip, used only by
  `runtime.js`'s own panel, never by `activity.ts`. Selecting a chip makes no new `session()` call per chip switch —
  only `runtime.js`'s own one-per-draw fetch, reused across chip switches within that draw.
- `runtime.js`'s `session` route: when the selected chip is `'main'` (the default, and `followLatest`'s result when
  it picks the main chip), render the Activity view exactly as Task 7 built it. When any other chip is selected,
  render the new output panel instead of the Activity view, next to the terminal slot, built from `filterActivity`'s
  result (`'agent'` chips) or `data.backgroundOutput` (`'background'` chips).

- [ ] **Step 1: Write the failing tests:** `builds_one_chip_per_agent_and_background_task`,
      `agent_chip_filters_by_the_agent_field_not_a_separate_fetch`, `follow_latest_picks_the_newest`,
      `selecting_main_shows_the_unmodified_activity_view`, `selecting_another_chip_replaces_it_with_the_panel`.
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** `buildChips`, `followLatest`, `filterActivity`; wire chip selection and the panel/replace
      behavior in `runtime.js`.
- [ ] **Step 4:** Run the tests; expect PASS.
- [ ] **Step 5: Commit** "Add main/subagent/background chips, with a panel that replaces the Activity view, and
      follow-latest, to the Session tab."

### Task 11: The run bar

**Does:** Shows a hosted session's linked flow run as a phase stepper, task segments, the task in progress and the
`now:` line, on its Session tab, and the task number on its subagent chips.
**Depends on:** Task 5 (the conductor-to-skill mapping, reused here), Task 10 (the chips to annotate)

**Files:**

- Create: `crates/flow-cockpit/app/shell/run-bar.js`
- Modify: `crates/flow-cockpit/app/shell/runtime.js`
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs`

**Interfaces:**

- Consumes: `DataApi.entries(project)` (existing, to list open flow runs), `DataApi.flowRun(project, slug)`
  (existing — `FlowRun.sessions` already lists every session that edited or wrote that run's flow.md),
  `Blocks.stepper`, `Blocks.taskGraph` (existing).
- Produces: `run-bar.js`: `export async function findLinkedRun(data, project, sessionId): Promise<FlowRun | null>` —
  scans the project's `FlowRun` entries (newest `last_activity` first) and returns the first whose
  `flowRun(project, slug).sessions` includes `sessionId`. No new Rust command, no change to `index/links.rs`.
  `export function renderRunBar(run: FlowRun): Node`, using the existing `stepper` and task-progress data. Annotates
  Task 10's subagent chips with the matching task number from the run's plan, once found.

- [ ] **Step 1: Write the failing tests:** `find_linked_run_matches_by_the_sessions_list`,
      `find_linked_run_is_null_for_a_loose_session`, `run_bar_shows_the_current_task_and_now_line`.
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** `findLinkedRun`, `renderRunBar`; annotate chips from Task 10 with the matching task
      number.
- [ ] **Step 4:** Run the tests, then `sloplint`; expect PASS / clean.
- [ ] **Step 5: Commit** "Show a hosted session's flow run as a run bar on its Session tab."

### Task 12: Closing the window

**Does:** Asks once before closing if any hosted session is working, waiting, or has no transcript yet, then kills
every hosted session's process cleanly; otherwise closes with no prompt.
**Depends on:** Task 3 (`kill_all`, `ids`)

**Files:**

- Modify: `crates/flow-cockpit/app/src/pty.rs` (`pub fn needs_confirmation(hosted: &HostedSessions, shared: &Shared)
-> bool`; an `AtomicBool` "confirmed" flag), `crates/flow-cockpit/app/src/main.rs` (`.on_window_event` matching
  `WindowEvent::CloseRequested { api, .. }`; a `confirm_close` Tauri command), `crates/flow-cockpit/app/build.rs`
  (add `confirm_close` to the `AppManifest`'s command list), `crates/flow-cockpit/app/capabilities/default.json`
- Create: `crates/flow-cockpit/app/shell/close-confirm.js` (a plain `<dialog>`, no new Tauri plugin)
- Modify: `crates/flow-cockpit/app/shell/boot.js` (listen for `close-requested`, show the dialog)
- Modify: `crates/flow-cockpit/core/src/index/status.rs` — added 2026-10-31 (deviation, "Task 12's 'Working or
  Waiting' predicate needed data `shared.live(id)` alone doesn't carry", decided: export `WORKING_SECS`): `shared.live(id)`
  (`SessionLive`) carries only whether a question/permission prompt is open, nothing that means "Working" for a
  single session — the only existing "Working" threshold is this file's own private `WORKING_SECS`, used today only
  for a flow _run's_ aggregated status. Drop its `pub(crate)` scoping so `pty.rs` can reuse the same constant for a
  single hosted session's transcript-recency check, instead of a second, driftable copy.
- Test: `#[cfg(test)]` in `pty.rs`

**Interfaces:**

- `needs_confirmation` is true when any of `hosted.ids()` is Working or Waiting by `shared.live(id)` (reusing
  flow-observability's existing status rule), **or** `shared.live(id)` is `None` (a session started moments ago,
  before its transcript exists, counts as Working — never silently treated as idle).
- On `CloseRequested`: if the "confirmed" flag is already set, call `kill_all()` once and let the close proceed.
  Otherwise, if `needs_confirmation` is true, call `api.prevent_close()` and emit `"close-requested"`; the shell's
  `close-confirm.js` dialog's "Close anyway" sets the flag via `shell.confirmClose()` (joins the privileged `shell`
  object, Task 5's decision — this closes the window, not something a view should ever trigger), which calls
  `kill_all()` then closes the window from Rust. If `needs_confirmation` is false, call `kill_all()` and let the
  close proceed with no dialog.

- [ ] **Step 1: Write the failing tests:** `needs_confirmation_true_when_a_session_is_working`,
      `needs_confirmation_true_for_a_session_with_no_transcript_yet`, `needs_confirmation_false_when_all_idle`,
      `close_kills_every_hosted_session` (several fixture sessions, confirm `kill_all` reaps each),
      `confirmed_close_does_not_prompt_twice`.
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** `needs_confirmation`; wire the close handler (the dialog itself isn't unit-tested, only
      the predicate and `kill_all` are).
- [ ] **Step 4:** Run the tests, then clippy; expect PASS.
- [ ] **Step 5: Commit** "Ask once before closing with unfinished hosted sessions, then close them all."

### Task 13: Resuming a session, and shipping Slice 1

**Does:** Makes "resume" on a hosted session with an open tab just focus it, and on any other session start a plain
resume with its own known folder and id, with no liveness detection; then wires the new dependencies into the build
so Slice 1 ships on Linux.
**Depends on:** Task 2 (`build_resume_argv`), Task 4 (the boundary in place), Task 7 (the hosted-sessions set, and
its established pattern of shell-rendered chrome alongside the `session` route's view)

**Rewritten 2026-10-31** (applying Task 5's decision to a second place it also applies): the brief originally put
"resume" in "the list view's" action — but `list` is a loaded view (`extensions/list/`), built-in or from a
repository just like any other, and the plan's own rule treats both identically: no view calls a session-control
command. Rather than overlay a privileged button on every list row (which the list view itself renders), "resume"
moves to the `session` route's screen instead, reusing Task 7's existing pattern of shell-rendered chrome alongside
the (unmodified) view there: for a session not already in `hostedSessions`, the shell renders a "Resume" button next
to the Activity view; clicking it calls `shell.resumeSession` and marks the session hosted (same effect as
`startSession`/`subscribeSession`'s own result in Task 5/7). The list view itself needs no change and gains no new
capability.

**Rewritten again 2026-10-31** after the implementer stopped before writing code (deviation, "Task 13's brief assumed
data and wiring that don't exist: a session's cwd, and shell's reach into runtime.js", decided: backend resolves a
session's folder itself; a new `resume(id)` callback on `createRuntime`): no session entry or binding carries a
session's `cwd` at all (the Rust index briefly reads it off a session's transcript while indexing, then discards it);
and `runtime.js` has no way to reach `shell` (Task 7 deliberately kept it out of `createRuntime`). `resume_session`
now takes only `id` — no `cwd` parameter — and resolves the folder itself from the index's own (internal,
never-serialized) record of it; `boot.js` passes a `resume(id)` callback into `createRuntime`, the same way it
already passes `mountPane`, so `runtime.js` never touches `shell` directly.

**Files:**

- Modify: `crates/flow-cockpit/app/shell/runtime.js` (the `session` route's render, extending Task 7's shell-chrome
  area with a "Resume" button for a non-hosted session; takes `createRuntime`'s new `resume(id)` callback)
- Modify: `crates/flow-cockpit/app/shell/boot.js` (a `resume(id)` callback passed into `createRuntime`, wrapping
  `shell.resumeSession(id, cols, rows, onOutput)` — its own `cwd` parameter is gone; on success, adds the id to
  `hosted` and redraws, the same as `startSession`'s own success path)
- Modify: `crates/flow-cockpit/core/src/index/entries.rs` (`pub(crate) struct Session` gains a `cwd: PathBuf` field,
  copied from the `Head` already read while indexing — never derives `Serialize`/`TS`, never crosses to any binding
  or view), `crates/flow-cockpit/core/src/index/mod.rs` (a new `pub fn session_cwd(&self, id: &str) -> Option<PathBuf>`
  on `Index`, mirroring the existing `session_path`; sets `cwd` when constructing `Session` during indexing)
- Modify: `crates/flow-cockpit/app/src/pty.rs` (`resume_session(id: String, cols: u16, rows: u16, on_output) ->
Result<String, String>` — drops its `cwd` parameter; looks the folder up via `Shared`'s index before calling
  `HostedSessions::resume`, erroring if the index has no record of that session's cwd rather than guessing), `crates/
flow-cockpit/app/src/commands.rs` (a small `Shared` method exposing `session_cwd`, if `pty.rs` needs it through
  `Shared` rather than reaching `Index` directly — match this codebase's existing pattern for how `pty.rs` already
  reaches `Shared`, e.g. Task 12's `needs_confirmation(hosted, shared)`)
- Modify: `crates/flow-cockpit/app/Cargo.toml`, `Cargo.lock`, `flake.nix` (only if Task 1 found a system library
  gap), `THIRD_PARTY.md`, `.github/workflows/flow-cockpit.yml` (only if Tasks 1 or 4 found a CI-only gap)
- Test: `crates/flow-cockpit/app/shell/runtime.test.mjs`, `#[cfg(test)]` additions in `core/src/index/mod.rs` or
  `entries.rs` (a session's `cwd` round-trips through indexing) and `app/src/pty.rs` (`resume_session` resolves the
  right folder by id, and errors — not a guess, not a panic — for an id the index doesn't know)

**Interfaces:**

- "Resume" calls `shell.resumeSession(id, cols, rows, onOutput)` — no `cwd` argument; the backend resolves it from
  its own index. `onOutput` is an unread throwaway `Channel` (same reasoning as Task 5's `startSession` call). On
  success, the session joins `hostedSessions` and the screen re-renders as a hosted one (Task 7), mounting the
  terminal pane via `shell.subscribeSession` as usual.
- `runtime.js`'s `session` route takes a new `resume: (id) => Promise<void>` parameter on `createRuntime` (alongside
  the existing `hosted`/`mountPane`), supplied by `boot.js`; `shell` itself still never enters `createRuntime` or
  reaches `ctx`.

- [ ] **Step 1: Write the failing tests:** `an_already_hosted_sessions_screen_shows_its_terminal_not_a_resume_button`,
      `resume_button_calls_resume_with_the_sessions_id`, `session_cwd_round_trips_through_indexing`,
      `resume_session_resolves_the_folder_by_id_and_errors_for_an_unknown_one`.
- [ ] **Step 2:** Run the tests; expect FAIL.
- [ ] **Step 3: Implement** the `cwd` field on `Session`/`session_cwd` in core; `resume_session`'s new signature in
      `pty.rs`; the `resume(id)` callback in `boot.js`; the branch on the `session` route in `runtime.js`: check
      `hostedSessions` first (render as Task 7 already does), else render the "Resume" button calling `resume(id)`.
- [ ] **Step 4:** Run the tests; expect PASS.
- [ ] **Step 5:** `nix build .#flow-cockpit` (or the repo's build command); expect PASS, with the new capability and
      vendored files included in the built app.
- [ ] **Step 6:** Manually start a hosted session in the built app; confirm plan mode, a question, resize, a
      background command, closing-with-confirmation, and resuming all still work as Tasks 1-12 found.
- [ ] **Step 7: Commit** "Resume a session from its own screen, and ship hosted sessions in the flow cockpit on
      Linux."

---

## Slice 2 (Windows)

### Task 14: ConPTY spike, session lifecycle, and shipping Slice 2

**Does:** Proves Tasks 3, 4, 6, 8 and 12 work on Windows through `portable-pty`'s ConPTY backend, finds a
Windows-appropriate stand-in for the graceful-stop phase Task 1 found has no equivalent there, and makes the Windows
build (already produced by CI) include hosted sessions.
**Depends on:** Task 13

The first half is a throwaway spike, like Task 1; findings are appended to `findings.md`. The second half is product
work, once any Windows-specific gap it finds is folded in. Task 1's spike read (but did not run) that on Windows
`portable-pty`'s `clone_killer().kill()` and `Child::kill()` are both `TerminateProcess` — there is no SIGHUP
equivalent there, so Task 3's two-phase stop (`kill`, used by `kill_session` and `kill_all`) needs a Windows branch.

**Files:**

- Modify: `crates/flow-cockpit/app/src/pty.rs` (a `cfg(windows)` branch for `kill`/`kill_all`, if Step 1 finds a
  working graceful stop; otherwise a documented, deliberate hard-kill with the orphan-process caveat recorded)
- Modify: `.github/workflows/flow-cockpit.yml` (if a Windows-only CI gap is found), `plugins/opt-in/flow-cockpit/
README.md`

- [ ] **Step 1:** Run the Task 13 build on Windows; start a hosted session that runs a background command; confirm
      spawn, keystrokes, resize all work through ConPTY. Try to find a graceful stop for `claude` and the commands it
      started: `GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, ...)` against the console group ConPTY attaches, or
      another signal Windows actually delivers, confirmed by the same orphan check Task 1 ran on Linux (a backgrounded
      command's process tree is gone after the stop, not reparented). If nothing better than `TerminateProcess` is
      found, record that as a known Windows limitation (orphaned child processes on close) rather than leaving it
      silently assumed fixed.
- [ ] **Step 2:** Confirm the session-control boundary (Task 4) holds the same way on Windows (capabilities and
      `withGlobalTauri` aren't platform-specific, but confirm once in the built app).
- [ ] **Step 3:** Confirm `claude_tmp_dir`/`find_session_tasks_dir` (Task 8) resolve correctly against the real
      filesystem — in particular what replaces the Linux `uid` segment in `claude-<uid>` on Windows (it already has a
      unit test for the path shape; this is the real-machine check).
- [ ] **Step 4:** Check Backspace behaviour and whether `TERM_PROGRAM`/`TERM` need setting for the embedded terminal
      (the cockpit's own `xterm.js`, not the user's shell, so this may already be moot — record which).
- [ ] **Step 5:** Append findings to `docs/features/cockpit-harness/findings.md`; implement any Windows-specific
      branch Steps 1-4 found necessary in Tasks 3, 4, 6, 8 or 12's files.
- [ ] **Step 6:** Confirm the Windows CI build in `flow-cockpit.yml` exercises hosted sessions (at minimum, that the
      new crate and vendored files build for the `x86_64-pc-windows-msvc` target).
- [ ] **Step 7:** Update the plugin's README if it still describes the cockpit as watch-only.
- [ ] **Step 8: Commit** "Ship hosted sessions in the flow cockpit on Windows."
