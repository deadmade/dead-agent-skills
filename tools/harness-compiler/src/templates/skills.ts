// Generated skills and their per-harness wording. Harness-specific instructions live here and nowhere in plugins/.
export const claudeThemeSetup = (name: string) =>
  `---\nname: setup-${name}\ndescription: Select the ${name} theme packaged with this plugin.\n---\n\n# ${name}\n\nSelect the installed plugin's ${name} theme through Claude Code's native theme selection UI. Its native mod stays in the Claude package.\n`;

export const codexThemeSetup = (name: string) => `---
name: setup-${name}
description: Set up ${name} using the native Codex theme picker.
---

# ${name}

Use the packaged \`../../themes/${name}.tmTheme\` relative to this skill's directory. This works for direct marketplace installations and installer installations alike; no installer or build is required.

Resolve the active Codex home from CODEX_HOME when set, otherwise the user's home directory plus \`.codex\`. Create its \`themes\` directory and copy the packaged file to \`themes/${name}.tmTheme\` there. Use the host's native filesystem tools, with paths handled as data (including spaces); no Bash is required. Before writing, compare any existing file: leave an identical file alone; preserve a differing file and ask before replacement. Do not modify unrelated configuration or files.

Restart Codex if needed to discover the new file, then run \`/theme\`, preview the theme, and confirm the selection in the native picker. Let the picker save \`tui.theme\`; do not overwrite config.toml. Syntax highlighting, selections and diffs use TextMate colors. \`codex.accent\` is supplied as a scope for versions that support it. Spinner words, shimmer effects, mods and other UI roles are not available here; unsupported surfaces retain native behavior. This setup never writes terminal-wide OSC colors and uses no custom launcher.

Official Codex setup: https://learn.chatgpt.com/docs/cli-customization .
`;

export const projectRulesSkill = (rules: string) =>
  '---\nname: project-rules\ndescription: Personal coding conventions for projects using dead-agent-skills.\n---\n\n' +
  rules;
