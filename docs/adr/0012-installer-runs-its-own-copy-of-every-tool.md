# The installer always runs its own copy of every tool

The installer decided "which copy of a tool runs" three ways: our release binaries (web-mcp, ado-mcp) yield to any copy
on PATH, agent-browser yields to a PATH copy at or above its pin, and uv uses its own copy in `~/.claude/bin` as soon as
one exists. The user installs these tools only through the installer, so a copy on PATH is never one they chose, and
the three rules tripled the code and the tests for no user.

Every tool now has one rule, except the Codex step, below: our copy in `~/.claude/bin` runs. The installer downloads it when it is missing or older
than the pin (for our own binaries, the installer's version) and keeps it when it is equal or newer. A copy elsewhere on
PATH is ignored. Plugin settings (`binPath`, `agentBrowserPath`) always point at our copy. The rule lives in one
function, driven by the tool manifest (`tools/installer/assets/tools.json`).

## Considered options

- **Keep three rules, one `use` field per tool.** Rejected: the differences protect nobody, and each rule is a path
  to test on two platforms.
- **Any copy on PATH wins, for every tool.** Rejected: a stray older agent-browser or uv would then run silently
  against a plugin that expects the pinned one.

## Consequences

- A binary built by hand and set with `/plugin configure` (`binPath`) is replaced the next time the installer runs.
- A NixOS user who packages web-mcp themselves must tell the installer to skip it, or accept our static musl build.
- The "using the one on PATH" summary line goes away.
- The Codex step keeps its own PATH-first lookup and versioned folder; only its asset lookup uses the manifest.
  That PATH-first lookup covers only web-mcp and ado-mcp; agent-browser under Codex follows the one rule (ours, in the
  bin folder it is given).
