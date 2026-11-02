// Rewrites authored Markdown for the target it ships to.
import { dirname, join, relative, sep } from 'node:path';
import type { TargetId } from '../model.ts';
import { applyRules } from './rules.ts';

export function portableText(text: string, file: string, root: string): string {
  const parts = relative(root, file).split(sep);
  const resourceRoot = parts[0] === 'packs' && parts.length > 2 ? join(root, 'packs', parts[1]) : root;
  const rel = relative(dirname(file), resourceRoot).split(sep).join('/') || '.';
  return (
    text
      .replaceAll('${CLAUDE_PLUGIN_ROOT}', rel)
      .replaceAll('${CLAUDE_SKILL_DIR}', '.')
      // Shared instructions may intentionally name both files. Adapt single-host lines only.
      .split('\n')
      .map((line) => (line.includes('AGENTS.md') ? line : line.replaceAll('CLAUDE.md', 'AGENTS.md')))
      .join('\n')
      .replaceAll('AskUserQuestion', 'the host user-question tool')
      .replaceAll('the Read tool', 'the host file-reading tool')
      .replaceAll('~/.claude/plugins/**/pstack-picks/**/skills/<name>/SKILL.md', `${rel}/skills/<name>/SKILL.md`)
  );
}

// Per-target rewriting of every shipped Markdown file.
export function transformMarkdown(target: TargetId, source: string, file: string, root: string): string {
  const relativePath = relative(root, file).split(sep).join('/');
  // A Windows checkout has CRLF sources, and the line rules match whole lines.
  const text = source.replaceAll('\r\n', '\n');
  const ruled = applyRules(target, relativePath, text);
  // The neutral root token becomes the agent's own variable, or a relative path where there is none.
  return target === 'codex'
    ? portableText(ruled.replaceAll('${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}'), file, root)
    : ruled.replaceAll('${PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT}');
}
