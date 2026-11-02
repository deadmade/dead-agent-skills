// Per-file rewrites of vendored Markdown. Upstream text stays byte-identical in plugins/; a distribution drops the
// passages that tell its reader to install or configure a different agent.
import type { TargetId } from '../model.ts';

export type Edit =
  // Remove every line that matches.
  | { kind: 'lines'; match: string }
  // Remove a bullet (the matching line and its indented continuation lines).
  | { kind: 'bullet'; match: string }
  // Remove a paragraph (blank-line separated) that starts with the match.
  | { kind: 'paragraph'; match: string }
  // Remove a heading and everything up to the next heading of the same or a higher level.
  | { kind: 'section'; match: string };

export interface Rule {
  // Path inside the plugin, `/`-separated; matched exactly.
  file: string;
  // The target whose distribution loses the passage.
  drop: TargetId;
  edit: Edit;
  why: string;
}

export const RULES: Rule[] = [
  {
    file: 'skills/hallmark/SKILL.md',
    drop: 'claude-code',
    edit: { kind: 'lines', match: '^Codex CLI and OpenCode read ' },
    why: 'harness hint for Codex and OpenCode',
  },
  {
    file: 'library/csharp-expert/SKILL.md',
    drop: 'claude-code',
    edit: { kind: 'bullet', match: '^- For Codex CLI, VS Code, Cursor' },
    why: 'points at install commands for other hosts',
  },
  {
    file: 'library/csharp-expert/references/dotnet-skills-marketplace.md',
    drop: 'claude-code',
    edit: { kind: 'section', match: '^## Codex CLI$' },
    why: 'Codex install instructions',
  },
  {
    file: 'packs/ponytail/skills/ponytail-help/SKILL.md',
    drop: 'claude-code',
    edit: { kind: 'paragraph', match: '^In Codex CLI and the IDE extension' },
    why: 'Codex invocation syntax',
  },
  {
    file: 'packs/superpowers/skills/using-superpowers/SKILL.md',
    drop: 'claude-code',
    edit: { kind: 'lines', match: '^- Codex: `references/codex-tools\\.md`$' },
    why: 'pointer to the Codex tool map',
  },
  {
    file: 'packs/superpowers/skills/using-superpowers/SKILL.md',
    drop: 'codex',
    edit: { kind: 'lines', match: '^- Claude Code: `references/claude-code-tools\\.md`$' },
    why: 'pointer to the Claude Code tool map',
  },
];

export function applyEdit(text: string, edit: Edit): string {
  const re = new RegExp(edit.match);
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!re.test(line)) {
      out.push(line);
      continue;
    }
    if (edit.kind === 'lines') continue;
    if (edit.kind === 'bullet') {
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++;
      continue;
    }
    if (edit.kind === 'paragraph') {
      while (i + 1 < lines.length && lines[i + 1].trim() !== '') i++;
      // Drop the blank line that separated it, so no double gap remains.
      if (lines[i + 1] === '' && (out.at(-1) ?? '') === '') i++;
      continue;
    }
    const level = /^(#+)/.exec(line)![1].length;
    while (i + 1 < lines.length) {
      const next = /^(#+)\s/.exec(lines[i + 1]);
      if (next && next[1].length <= level) break;
      i++;
    }
  }
  return out.join('\n');
}

// `relative` is the file's path inside the plugin, with `/` separators.
export function applyRules(target: TargetId, relative: string, text: string): string {
  // A Windows checkout has CRLF sources, and the edits match whole lines.
  let result = text.replaceAll('\r\n', '\n');
  for (const rule of RULES) if (rule.drop === target && rule.file === relative) result = applyEdit(result, rule.edit);
  return result;
}
