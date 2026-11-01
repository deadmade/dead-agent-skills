---
name: setup-night-city
description: Set up Night City using the native Claude Code theme or Codex theme picker.
---

# Night City

For Codex terminal CLI, use the packaged `../../themes/night-city.tmTheme` relative to this skill's directory. This works for direct marketplace installations and installer installations alike; no installer or build is required.

Resolve the active Codex home from CODEX_HOME when set, otherwise the user's home directory plus `.codex`. Create its `themes` directory and copy the packaged file to `themes/night-city.tmTheme` there. Use the host's native filesystem tools, with paths handled as data (including spaces); no Bash is required. Before writing, compare any existing file: leave an identical file alone; preserve a differing file and ask before replacement. Do not modify unrelated configuration or files.

Restart Codex if needed to discover the new file, then run `/theme`, preview Night City, and confirm the selection in the native picker. Let the picker save `tui.theme`; do not overwrite config.toml. Syntax highlighting, selections and diffs use TextMate colors. `codex.accent` is supplied as a scope for versions that support it. Claude's spinner words, shimmer effects, mod and other UI roles remain Claude-only; unsupported surfaces retain native behavior. This setup never writes terminal-wide OSC colors and uses no custom launcher.

For Claude Code, select the installed plugin's Night City theme through the native theme selection UI. Its native mod stays in the Claude package.

Official Codex setup: https://learn.chatgpt.com/docs/cli-customization .
