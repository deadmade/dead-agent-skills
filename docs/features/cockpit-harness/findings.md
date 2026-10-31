# Flow cockpit hosts Claude sessions: spike findings (Task 1)

Throwaway spike, run 2026-10-31 on Linux (NixOS, x86_64), Claude Code 2.1.314, tauri 2.12.5, rustc 1.99.0, node
26.12.0. Two pieces of scratch code, neither committed: a standalone `portable-pty` driver that runs `claude` in a PTY
and plays a script against it (keystrokes, resizes, signals, `ps`), and a short-lived worktree of
`crates/flow-cockpit/app/` with one PTY session wired to an `xterm.js` pane outside `#app`, run under the app's real
CSP and `core:default` capability in Xvfb (`:99`, later with openbox as window manager), driven by `xdotool` and
checked by screenshots. Everything below was run and observed in that session; where a fact comes from reading
source rather than running it, it says so.

## Step 1: Pinned versions

| package            | version    | where                                             | published  | license |
| ------------------ | ---------- | ------------------------------------------------- | ---------- | ------- |
| `portable-pty`     | **0.9.0**  | crates.io, `max_stable_version` (wezterm/wezterm) | 2025-02-11 | MIT     |
| `@xterm/xterm`     | **6.0.0**  | npm `latest` (`beta` is 6.1.0-beta.336)           | 2025-12-22 | MIT     |
| `@xterm/addon-fit` | **0.11.0** | npm `latest` (`beta` is 0.12.0-beta.332)          | 2025-12-22 | MIT     |

Tarball sha256: `xterm-xterm-6.0.0.tgz` `908e66e04af6c8dc6b00dd3b54de088e2e81e5ed866284fd6c2fb3c2d1c7a3f6`,
`xterm-addon-fit-0.11.0.tgz` `26003b4517a132b64e4ff228fd88a5fda3fff5e606c76093f6dcff772e9ecec0`.

The files to vendor are `package/lib/xterm.mjs`, `package/lib/addon-fit.mjs` (both plain ES modules, no imports) and
**`package/css/xterm.css`**, which xterm needs to lay itself out. `@xterm/addon-fit` 0.11.0 declares no peer
dependency. Pinned as `portable-pty = "=0.9.0"`, it adds these packages to `crates/flow-cockpit/Cargo.lock`:
`cfg_aliases`, `downcast-rs`, `filedescriptor`, `lazy_static`, `nix` 0.28.0, `portable-pty`, `serial2`,
`shared_library`, `shell-words`, `winreg` (some only build for Windows). The app built in `nix develop` with no new
system library: on Linux the crate uses only libc.

## Step 2: A real session in the embedded pane

Wiring that worked, in the app's worktree:

- Rust: `native_pty_system().openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })`,
  `CommandBuilder::new("claude")` plus args and `cwd`, `pair.slave.spawn_command(cmd)`, then `drop(pair.slave)`;
  `pair.master.try_clone_reader()` read on its own thread in 8 KiB reads, each chunk sent as
  `InvokeResponseBody::Raw(bytes)` on a `tauri::ipc::Channel<InvokeResponseBody>`; `pair.master.take_writer()` for
  input.
- JS: `term.write(new Uint8Array(message))` for each channel message; `term.onData(d => invoke('spike_write', { data:
d }))`; a `FitAddon`, refitted from a `ResizeObserver` on the pane's host, and `term.onResize` calling the resize
  command.

Confirmed by screenshot and by the terminal's own buffer text logged from JS: the prompt, the mascot, the borders
and the status line draw correctly; Night City's colors show (truecolor, once `TERM`/`COLORTERM` are set, see Step 4);
typed text reaches `claude` and comes back (`xdotool type 'héllo ✓ 日本 — ünïcödé'` showed on the prompt line,
wide CJK characters correctly spaced); Shift+Tab (mode cycle), arrows and Enter all work. Untrusted folders show
Claude Code's trust dialog first, and it is answerable in the pane. The terminal's title changes arrive through
`term.onTitleChange` (`"✳ Claude Code"`, then `"✳ AskUserQuestion color preference"`).

Nothing in the CSP got in the way: `xterm.css` loads under `style-src 'self' 'unsafe-inline'`, the modules under
`script-src 'self'`, and the channel's larger messages (see Step 6) arrive through Tauri's own fetch command.

Not visually confirmed: the window under the user's real Wayland/Hyprland session (all screenshots are Xvfb on X11).
With `fontFamily: 'monospace'` some glyphs (`⎿`, `☐`) fell back to a font where they look like `L` and a bracket;
the real pane should name a font that has them.

## Step 3: Plan mode, a question, a background command, resize, and `--`

- **Plan mode:** Shift+Tab cycled `auto mode on` → `manual mode on` → `accept edits on` → `plan mode on`; the
  session then wrote a plan file path (`Planning: ~/.claude/plans/...md`) and kept the mode across turns.
- **AskUserQuestion:** asked in plan mode, Claude Code drew its question box (options, "Type something.", "Chat
  about this"); Down then Enter in the pane answered it (`→ Blue`) and the turn finished.
- **Backgrounded command:** see "Background-command output" below for the path and what creates a file at all.
- **Resize:** resizing the window (`xdotool windowsize`) refitted xterm, the resize reached the PTY, and Claude Code
  repainted for the new size, both smaller (93x47 → 65x31) and larger (→ 109x52): prompt box, borders and reflowed
  text were all correct in the screenshots. In the raw byte capture, each resize is followed by a full repaint
  (cursor home, every visible line cleared, then redrawn: 24 cleared lines after a resize to 80x24, 40 after
  140x40). The call that works:

  ```rust
  master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })?;
  // master.get_size()? then reports exactly the new rows/cols (TIOCSWINSZ / TIOCGWINSZ)
  ```

  `CommandBuilder`'s default `set_controlling_tty(true)` is what makes SIGWINCH reach `claude`; leave it on.

- **`--` before a prompt starting with `-`:** held. Without it, `claude --model haiku "-x Reply with exactly the word
PINEAPPLE and nothing else."` exits 1 with `error: unknown option '-x Reply with exactly ...'`. With `claude --model
haiku --session-id <uuid> -- "-x Reply ..."`, the session starts, the transcript's first user message is the full
  text `"-x Reply with exactly the word PINEAPPLE and nothing else."`, and the reply is `PINEAPPLE`. Also confirmed:
  `--session-id <uuid>` names the transcript `~/.claude/projects/<folder>/<uuid>.jsonl`.

### Background-command output

Confirmed shape, with corrections:

- Path: `<tmp>/claude-<uid>/<cwd folder name>/<session-id>/tasks/<task-id>.output`, here
  `/tmp/claude-1000/-tmp-opencode-spike-proj/3d1f8c17-.../tasks/birs7h46a.output`. `<tmp>` is `CLAUDE_CODE_TMPDIR`
  when set, else Node's `os.tmpdir()` (so `TMPDIR`, else `/tmp`); this is read from the shipped 2.1.314 bundle
  (`function Ip(){let e=i.CLAUDE_CODE_TMPDIR;if(e)return e;return S()}`, `claude-${process.getuid()}`), not from
  documentation. The folder name is the cwd with every non-alphanumeric character turned into `-`, the same rule as
  `~/.claude/projects`.
- **The `<cwd folder name>` segment is not reliably the transcript's folder.** Started with `-w spiketree`, the
  session's `tasks/` landed under `-tmp-opencode-spike-proj--claude-worktrees-spiketree` (matching its transcript)
  while its `scratchpad/` landed under `-tmp-opencode-spike-proj` (the launch folder). A session in this repo that
  moved into a worktree mid-session has its `tasks/` under the main checkout's folder while its transcript is under
  the worktree's. The session id is the stable part.
- Task ids: a backgrounded Bash command is `b` + 8 characters of `[a-z0-9]` (`birs7h46a`, `bb66kmm9g`). The same
  folder also holds `a` + 17 hex characters `.output` **symlinks to subagent transcripts**
  (`a0115b90ea4c9b854.output -> ~/.claude/projects/.../subagents/agent-a0115b90ea4c9b854.jsonl`), so `tasks/*.output`
  is not only background commands.
- Content: the command's raw output, then a trailer Claude Code appends when it ends: `done-bg\n\n[exited with code
0]\n`, or `\n[killed]\n` when the session's exit killed it. While running, the file grows (0 bytes until the first
  output).
- **The literal `sleep 5 && echo done &` does not create a task.** Run through the Bash tool, Claude Code waited for
  it and returned `done` as ordinary foreground output (`toolUseResult: {"stdout":"done",...}`), with no file in
  `tasks/`. Only `run_in_background: true` creates `tasks/<id>.output`. (Ctrl+B on a running command was not tried.)
- A more direct source exists: the transcript's tool result for a backgrounded command says `Command running in
background with ID: birs7h46a. Output is being written to: /tmp/claude-1000/.../tasks/birs7h46a.output`, and its
  `toolUseResult` carries `"backgroundTaskId":"birs7h46a"`. The `SessionStart`/`SessionEnd` hook payloads carry
  `scratchpad_dir`, but per the `-w` case above that can be in a different folder from `tasks/`.
- Claude Code 2.1.314 blocks a foreground `sleep N` or `sleep N && ...` in the Bash tool ("Blocked: standalone sleep
  120 ... use run_in_background"), so a test that needs a long foreground command has to use something else
  (`timeout 100 tail -f /dev/null` worked).

## Step 4: Finding `claude` when launched as a GUI program

On this machine a bare lookup works. `claude` is `/run/current-system/sw/bin/claude` (a Nix wrapper around the
2.1.314 binary), and that folder is on the PATH every GUI launch path here inherits: the systemd user manager's
environment and the desktop portal's. Launched as a user service (`systemd-run --user`, which gets the manager's
environment, not this shell's), the app's PATH had no `~/.local/bin` and no `TERM`/`COLORTERM`, and
`CommandBuilder::new("claude")` still found and spawned `claude`.

It is not safe in general:

- `portable-pty` resolves a bare name against the **`PATH` in the `CommandBuilder`'s own environment** (a copy of
  the parent's, taken in `CommandBuilder::new`). With `PATH=/usr/bin:/bin`, `spawn_command` fails with `Unable to
spawn claude because:\nNo viable candidates found in PATH "/usr/bin:/bin"`; with no `PATH` at all, `Unable to
resolve the PATH`. Both are an `Err` from `spawn_command`, so a missing binary surfaces as a start error.
- Claude Code's native installer puts `claude` in `~/.local/bin`, which this machine's GUI environment does not have.
- An absolute path spawns (`/run/current-system/sw/bin/claude --version` under `PATH=/usr/bin:/bin` printed
  `2.1.314 (Claude Code)`), but the session's own tools would then run with that bare PATH.

Resolution that works here from a stripped environment (`env -i HOME=... PATH=/usr/bin:/bin`): ask the user's login
shell. `zsh -lc 'command -v claude; printf "%s\n" "$PATH"'` printed `/run/current-system/sw/bin/claude` and the full
PATH (including `~/.local/bin`). `zsh -lic` also works but prints `can't change option: zle` on stderr without a tty.
For Task 3: try the inherited PATH first; if `claude` isn't on it, run `$SHELL -lc` once (shell from `SHELL`, else
the passwd entry), and use the PATH it prints both to find `claude` and as the child's `PATH`; if that fails too,
report "claude not found" rather than guessing. Known locations (`~/.local/bin/claude`,
`/run/current-system/sw/bin/claude`, `/etc/profiles/per-user/$USER/bin/claude`, `~/.nix-profile/bin/claude`) can only
be a last resort, since they fix the binary but not the PATH its tools see.

**`TERM` and `COLORTERM` must be set by the cockpit.** The GUI environment has neither, and `portable-pty` adds no
`TERM`. Idle-screen byte counts of color sequences: no `TERM` → 0 color sequences (plain text UI);
`TERM=xterm-256color` only → 24 256-color, 0 truecolor; `TERM=xterm-256color COLORTERM=truecolor` → 19 truecolor, 5
256-color. Setting `cmd.env("TERM", "xterm-256color")` and `cmd.env("COLORTERM", "truecolor")` on the
`CommandBuilder` gave the full Night City colors in the pane, including under the systemd launch.

## Step 5: Killing the child, and orphans

Every Bash tool command `claude` runs, foreground or background, is started in **its own session**
(`zsh -c ...` with `SID == PID`, not `claude`'s), so neither killing `claude`'s process group nor its session reaches
them. Only `claude`'s own exit path cleans them up. Measured, with a background `sleep 90` (or `sleep 300`) and a
foreground `timeout 100 tail -f /dev/null` running:

| how `claude` was stopped                                    | `claude` exits        | its command trees                 | `SessionEnd` hook ran |
| ----------------------------------------------------------- | --------------------- | --------------------------------- | --------------------- |
| SIGHUP (`child.clone_killer().kill()`, or `libc::kill`)     | 0.65-1.05 s, code 129 | gone, `.output` gets `[killed]`   | yes                   |
| SIGTERM                                                     | ~0.9 s, code 143      | gone (idle case)                  | yes                   |
| `child.kill()` (portable-pty: SIGHUP, ~0.2 s, then SIGKILL) | 0.25-0.3 s, Killed    | **orphaned**, reparented to PID 1 | no                    |
| SIGKILL                                                     | immediate, Killed     | **orphaned**                      | no                    |
| drop writer and master (reader thread still running)        | **does not exit**     | still running                     | -                     |
| the app window closed (WM close, no cleanup code)           | within 1 s            | gone                              | (not checked)         |
| the app process SIGKILLed                                   | within 1 s            | gone                              | (not checked)         |

`web-mcp` (an MCP server `claude` starts, same process group) went away in every case. After the window-close and
app-kill rows, `ps` showed no `claude`, `web-mcp`, `sleep` or `tail` left: when the cockpit's process ends for any
reason the kernel closes the PTY master, `claude` gets SIGHUP and runs its own exit. The orphans appear only when
the cockpit itself SIGKILLs a `claude` it still owns, which is what `portable-pty`'s `Child::kill()` does after
~200 ms (five `try_wait` polls 50 ms apart) on Unix.

Two more things about stopping:

- Dropping the writer is not a quiet "close stdin": `portable-pty`'s Unix writer, on drop, **writes `\n` and the
  terminal's VEOF (Ctrl+D) into the PTY**, i.e. types Enter and Ctrl+D into `claude`.
- Dropping the master does not hang up while `try_clone_reader()`'s duplicate is still open (the reader thread holds
  it), so it is no stop signal at all.

## Step 6: Surprises

- **`Channel<Vec<u8>>` sends JSON, not bytes.** Logged in the window: a `Channel<Vec<u8>>` message arrives as
  `[object Array]` (an array of numbers); a `Channel<InvokeResponseBody>` sent `InvokeResponseBody::Raw(bytes)`
  arrives as `[object ArrayBuffer]`. tauri 2.12.5's own doc comment on `Channel` says the same. Raw messages under
  1024 bytes are delivered by `eval`, larger ones through `plugin:__TAURI_CHANNEL__|fetch`, which
  `webview/mod.rs` exempts from the ACL check, so Task 4's `AppManifest` can't block output delivery.
- **Split UTF-8:** 1 of 242 PTY reads in one session ended in the middle of a multi-byte character. xterm.js handles
  that itself when given bytes: writing `[0x61,0xe2,0x9c]`, `[0x93,0xe6,0x97]`, `[0xa5,0x62]` as three `Uint8Array`s
  produced the line `a✓日b`.
- **Claude Code queries the terminal and expects answers**, and turns on modes: at start it sends DA1 (`CSI c`),
  XTVERSION (`CSI >0q`), the kitty keyboard query (`CSI ?u`), OSC 11 (background color) and OSC 7501, and enables
  bracketed paste (`?2004`), focus reporting (`?1004`), `?2031`, the kitty keyboard protocol (`CSI >5u`) and
  modifyOtherKeys (`CSI >4;2m`). xterm.js 6.0.0 answered DA1 (`ESC[?1;2c`) and focus (`ESC[O`) through `onData`;
  the rest it ignores, and the session works.
- **Replaying output re-answers those queries.** Writing the first 2758 bytes of a session into a fresh `Terminal`
  (what priming a remounted pane from scrollback does) made it emit `["\u001b[O","\u001b[?1;2c"]` from `onData`. Wired
  to the PTY, that types those sequences into a running `claude`.
- Other output traits, for the terminal emulator: lines end `\r\r\n`; words are placed with `CSI n G` (absolute
  column) rather than spaces; OSC 8 hyperlinks; window titles via OSC 0. No alternate screen.
- First fit can run before layout: under openbox the pane first measured 80x24 and refitted on the next resize.

## What changes in Tasks 2-14

### Affects Task 3: output channel type

`Channel<Vec<u8>>` would send every chunk as a JSON array of numbers. Use `Channel<InvokeResponseBody>` and send
`InvokeResponseBody::Raw(chunk)` (arrives as `ArrayBuffer`); `scrollback` should return `tauri::ipc::Response` for the
same reason. Same fix wherever the plan says "a `tauri::ipc::Channel<Vec<u8>>`" (Architecture, Tech Stack, Task 3).

### Affects Task 3 (and Task 12): how `kill` stops a session

The plan's graceful phase ("closing the PTY's write side / the PTY's own hangup") doesn't work: dropping the writer
types Enter and Ctrl+D, and dropping the master hangs nothing up while the reader holds a duplicate. And
`portable-pty`'s `child.kill()` escalates to SIGKILL after ~200 ms, before `claude` (0.65-1.05 s) has killed its
commands, which orphans every running Bash command and skips `SessionEnd`. What worked: `child.clone_killer().kill()`
(on Unix that is SIGHUP only, no escalation), poll `try_wait()` for a few seconds (5 s leaves margin over the ~1 s
seen), and only then `child.kill()`. `kill_all` on window close (Task 12) must use the same path for every session in
parallel, never `child.kill()` alone; and if the process simply exits, the kernel's hangup already does the graceful
stop. `kill_sends_graceful_stop_before_sigkill` can keep its name; its fixture should be a child that traps SIGHUP.

### Affects Task 3: the child's environment and `claude` lookup

Set `TERM=xterm-256color` and `COLORTERM=truecolor` on every `CommandBuilder` (without them a GUI-launched session
has no color or only 256 colors). Resolve `claude` per Step 4: inherited `PATH` first, then the login shell's `PATH`
(`$SHELL -lc`), also passed to the child. A missing binary is an `Err` from `spawn_command`, which is what Task 5's
`missing_binary_shows_a_launch_error` needs. `MasterPty` is `Send` but not `Sync`, so `HostedSessions` keeps each
session's master behind a `Mutex` (Tauri state must be `Sync`). The reader thread sees EOF when the child exits,
which is the natural place to `wait()` and emit `session-exited`; observed codes: 129 after SIGHUP, 143 after
SIGTERM, a signal ("Killed") after SIGKILL.

### Affects Task 6: decoding, priming, and vendoring

- `chunk-decoder.js` isn't needed if the pane passes bytes straight to `term.write(Uint8Array)`; xterm.js already
  holds a split character across writes. `decodes_across_chunk_boundaries` could pin that the pane writes bytes, or
  be kept for a decoder if the controller prefers strings. Either way works; this is a simplification, not a fix.
- Priming from `scrollback` must not forward what xterm emits while replaying: attach `onData` (or stop dropping its
  events) only in the write callback of the last primed chunk. Otherwise every remount types `ESC[?1;2c` and `ESC[O`
  into `claude`. Worth its own test (`priming_does_not_send_terminal_replies`).
- Vendor `css/xterm.css` with the two modules, and link it from `index.html`. Upstream file names are `xterm.mjs` and
  `addon-fit.mjs`; the plan's `xterm.esm.js`/`xterm-addon-fit.esm.js` are only renames.
- Name a font with box-drawing and symbol glyphs (`⎿`, `☐`) rather than bare `monospace`.

### Affects Task 8: finding a session's background output

- Find a session's `tasks/` by session id (`<claude_tmp_dir>/*/<session-id>/tasks/`, one or more matches), not by
  rebuilding the folder-name segment from the session's cwd: per Step 3 that segment can be the launch folder or the
  worktree. Or read the output path from the transcript's tool result / `backgroundTaskId`. Which one is the
  controller's call; both stay inside `background_output.rs`.
- `claude_tmp_dir` is `CLAUDE_CODE_TMPDIR`, else the OS temp dir (`TMPDIR`, else `/tmp` on Linux), joined with
  `claude-<uid>`. The Windows half (`os.tmpdir()` → `%TEMP%`, and what replaces the uid) is unverified (Task 14).
- `list_background_tasks` must skip the `a<hex>.output` symlinks to subagent transcripts (or `tasks/` lists every
  background agent as a background command); filtering to regular files works for every file seen here.
- The output ends with Claude Code's own `[exited with code N]` or `[killed]` trailer.
- The spike's `sleep 5 && echo done &` doesn't produce a task file. Fixtures and the manual check in Task 13 should
  use `run_in_background: true`.

### Affects Task 4: nothing to change

Confirmed its premise: with a bare `tauri_build::build()` (no `AppManifest`) the spike's five commands ran under
`core:default` with no `allow-` entry. The channel's fetch command bypasses the ACL by design, so streaming survives
the lockdown.

### Affects Task 7: one unverified observation

A window-level `keydown` listener for F8 never fired while the xterm pane had focus (resizing had to be done from
outside). Not investigated; if xterm.js stops propagation of keys it handles, Task 7's Ctrl+R guard may receive
nothing from a focused pane anyway. `ctrl_r_inside_the_terminal_is_not_a_reload` should be run against the real
xterm, not a stub.

### Affects Task 13: lockfile and packaging

The `Cargo.lock` additions listed under Step 1; no `flake.nix` change for the Linux build. `THIRD_PARTY.md` needs
both xterm packages (MIT).

### Affects Task 14: graceful stop on Windows

From the source, not run: on Windows `clone_killer().kill()` and `Child::kill()` are both `TerminateProcess`, so the
graceful phase above doesn't exist there; Task 14 needs its own stop (and its own orphan check against ConPTY).

## What was not verified

- The pane under the user's real Wayland session (only Xvfb/X11 screenshots), and on Windows.
- Ctrl+B to background a running command.
- Whether `SessionEnd` ran when the window closed or the app was killed (only the absence of orphans was checked).
- Why the window's F8 listener didn't fire with the pane focused.
