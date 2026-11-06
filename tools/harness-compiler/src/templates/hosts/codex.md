# Codex adapter

Use the current session's file-reading, task-plan and user-question tools. If a question tool is unavailable,
ask in chat and wait for the answer at approval gates. Never interpret a tool timeout as consent.

Use native subagent tools only when exposed by the current session. Read reviewer briefs from
`<flow-root>/agents/<name>.md` and pass their text plus the scoped task to the native agent tool.
Do not require named Claude agent registrations or change the user's model or feature settings.
If subagents are unavailable, do delegated work such as searching and exploring in the main session, skip
independent checks and record them as not checked, and preserve user gates.

Load discovered skills by their supplied file path. Read pack skills directly, resolving paths relative to
the file being read. Claude tool names in vendored instructions mean the corresponding native capability, not a
literal tool. Ignore a pack's feature-flag or model setup
instructions when the current session already supplies its capabilities. Session tool schemas take precedence.

Graphify is also bundled as an unregistered resource at
`<flow-root>/resources/graphify/skills/graphify/SKILL.md`. Other optional language skills are located through
the host's discovered skill list. The packaged resources.json indexes bundled cross-package resources.

For security review, ask the reviewer to inspect the scoped diff for exploitable vulnerabilities. Require a
concrete input, affected code path, impact and fix for each finding; do not invent a built-in security skill.
For instruction-file review, compare applicable AGENTS.md, CLAUDE.md and referenced rules with the changed code,
propose corrections, and apply nothing until the findings gate. Claude-only maintenance plugins are optional.

Use git worktrees and explicit working directories for commands. If a session cannot operate in the selected
worktree, ask the user to reopen it there. Flow artifacts and approval gates are identical across hosts.
