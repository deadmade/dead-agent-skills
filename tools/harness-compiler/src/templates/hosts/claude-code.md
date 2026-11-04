# Claude Code adapter

Use Read for files, Skill for available installed skills, AskUserQuestion for decisions, and the current
session's task tools for progress. Dispatch reviewers with the available agent tool. Registered `flows:*`
agents can be used directly; otherwise read their Markdown brief under `<flow-root>/agents/` and dispatch
it as a general-purpose agent. Follow the session's actual tool schema.

Load cross-plugin skills through Skill when possible. For path-only resources, locate the installed plugin
using Claude's plugin metadata or use the marketplace source path when running from a checkout; do not assume
cache depth or select an arbitrary version. The resource index lists package names and paths.

For security review use `security-review` or `claude-security` when available; otherwise ask the reviewer to
check the scoped diff for exploitable vulnerabilities, grounding each finding in a concrete input and code path.
For instruction-file review use claude-md-management's `claude-md-improver` when available; otherwise compare
applicable AGENTS.md, CLAUDE.md and their referenced rules with the scoped changes and propose corrections without
applying them.

For `/review-code`'s correctness lens, use the built-in `code-review` skill when it is available and its scope is
the review's scope: `branch`, against the default branch, with nothing uncommitted or untracked. Run it through Skill
as `high <branch under review>` (never `--comment` or `--fix`; never `max` or `ultra` unless the user asked). It runs
forked and returns findings with a file, a line and a failure scenario each; those are the lens's candidates, and the
lens brief's extra checks go to one `general-purpose` agent on the same diff. In every other case (`all`, another
base, uncommitted work, no built-in), the lens takes its neutral default brief.

Use the host's worktree tool when available. Otherwise use git and explicit working directories; never pretend
that changing directory in one shell changes the session's working directory. Ask the user to reopen the worktree
if the host cannot operate there.
