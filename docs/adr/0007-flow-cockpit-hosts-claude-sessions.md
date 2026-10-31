# The flow cockpit also hosts Claude Code sessions, in embedded PTYs

Status: accepted. Supersedes the "cockpit that runs Claude Code inside it" bullet of
[ADR 0005](0005-flow-cockpit-outside-claude-code.md), which rejected hosting Claude Code in embedded terminals as
"the riskiest part" of the alternatives it considered, when the only option on the table was _replacing_ the user's
terminal entirely. The cockpit now also starts and hosts Claude sessions, each the real `claude` binary in its own
PTY drawn with a terminal emulator, next to the user's own terminal setup rather than instead of it: full fidelity
(slash commands, plan mode, `/rewind`, mods) is a hard constraint, and only an embedded PTY keeps all of it. A
headless `stream-json`/Agent SDK rebuild of the conversation was considered and rejected: it drops Claude Code
features the constraint forbids losing, and the SDK's own guidance favors API-key auth over a subscription. A hosted
session is a plain foreground process, a direct child of the cockpit window; closing the window closes it, the same
as closing a terminal tab, and Claude Code's own background-session supervisor (`--bg`) is deliberately not used.

## Consequences

- **A new trust tier.** Everything else in the cockpit (built-in views and a repository's own) is sandboxed,
  read-only TypeScript. Session control (spawning `claude`, keystrokes, resize, kill) is privileged, non-extensible
  app chrome instead: no view, built in or from a repository, gets a handle on a process.
- **The cockpit now spawns and owns processes**, not just reads files; it must clean them up on window close, on a
  crash, and on switching away from a project.
- **Platform work lands in two slices.** Linux (the existing Nix-shipped PTY work) first, Windows (ConPTY, its own
  terminal quirks) second, matching how flow-observability itself shipped Windows after Linux.
