# Native hook fixture provenance

Baseline CLIs checked on 2026-10-31: Claude Code 2.1.314 and Codex 0.166.0.
Each JSON entry declares its provenance. Only Codex SessionStart is a sanitized
capture; all other entries are documentation-derived examples or synthetic
negative tests. Negative examples are not evidence of events emitted by a CLI.

Sources: [Claude hooks reference](https://code.claude.com/docs/en/hooks) and
[official Codex hooks reference](https://learn.chatgpt.com/docs/hooks), retrieved
2026-10-31. Fixtures exercise the approved observation table. In particular,
`AskUserQuestion` and `request_user_input` remain unconfirmed by live tool capture.
The shared policy never opens transcript paths.

Capture method: an isolated `/tmp/native-hooks-*` profile contained hooks.json,
settings.json, and a recorder invoked using the absolute Node executable. The
recorder read stdin and appended it as one JSON line; it emitted no output.
Commands run from that profile directory:

```sh
CLAUDE_CONFIG_DIR=<profile> claude -p 'Reply only hello' --settings <profile>/settings.json --setting-sources '' --strict-mcp-config --tools ''
CODEX_HOME=<profile> codex --no-daemon --dangerously-bypass-hook-trust exec --skip-git-repo-check 'Reply only hello'
```

Claude exited 1 with `Not logged in`; no usable Claude payload was captured.
Codex emitted SessionStart before its Responses WebSocket connection failed.
The required escalated retry also emitted SessionStart, encountered a network
error, then ended with HTTP 401 (missing bearer or basic authentication). No credentials were copied. Captured cwd, session ID and transcript
path were replaced with stable sanitized values; other payload fields remain.

Pending live validation: Claude startup, Stop, question, delayed permission/network
and elicitation notifications; Codex Stop, continuation/subagent behavior,
PermissionRequest, and the canonical request_user_input hook tool name. Native
Windows command launch and harness interpretation of async/timeout remain pending.
Tests exercise Node child processes on Linux and assert the shared background/10s
configuration; they do not claim a native harness launch registration test (Task3).
Context envelope is tested as adapter output; rules dispatch/end-to-end is Task4.
