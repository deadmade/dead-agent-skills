// plugins/ is the neutral source: no file or phrase in it may belong to one agent, except vendored upstream text.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CLAUDE_ONLY, OVERRIDE } from './flows/compose.ts';

export interface Allowed {
  // Path prefix or exact path, relative to the repository root, `/`-separated.
  path: string;
  reason: string;
}
export interface Problem {
  file: string;
  line?: number;
  message: string;
}

const PHRASES: [RegExp, string][] = [
  [/\.claude-plugin/, '.claude-plugin'],
  [/\.codex-plugin/, '.codex-plugin'],
  [/CLAUDE_PLUGIN_ROOT/, 'CLAUDE_PLUGIN_ROOT'],
  [/CODEX_PLUGIN_ROOT/, 'CODEX_PLUGIN_ROOT'],
  [/\bcodex (plugin|mcp)\b/i, 'a codex plugin/mcp command'],
  [/\bclaude (plugin|mcp)\b/i, 'a claude plugin/mcp command'],
  [/~\/\.codex/, '~/.codex'],
  [/~\/\.claude/, '~/.claude'],
  [/\bCODEX_HOME\b/, 'CODEX_HOME'],
  [/CLAUDE_CONFIG_DIR/, 'CLAUDE_CONFIG_DIR'],
];
// The files flows' compose reads, whose Claude-only phrases would reach Codex; README.md's uses tree names them.
const FLOWS_TEXT = /^plugins\/flows\/(steps\/|(skills|references)\/.*\.md$)/;
const NATIVE_FILE = /(^|\/)(\.mcp\.json|\.lsp\.json)$|(^|\/)(claude-[^/]*|codex)\.[^/]+$|\.claude\.[^/]+$/;
const NATIVE_EVENTS =
  /"(SessionStart|SessionEnd|UserPromptSubmit|PreToolUse|PostToolUse|PostToolUseFailure|Stop|SubagentStart|SubagentStop|Notification|PermissionRequest)"/;
const SKIPPED = ['node_modules', '.git', 'target', 'dist', 'build', '.web', '.cache'];
const TEXT = /\.(md|mjs|js|cjs|ts|tsx|json|ya?ml|toml|txt|sh|ps1|py|html|css)$/i;

export function isAllowed(file: string, allowlist: Allowed[]) {
  return allowlist.some((a) => file === a.path || file.startsWith(a.path.endsWith('/') ? a.path : a.path + '/'));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

export function lintPlugins(root: string, allowlist: Allowed[], catalogSources: string[]): Problem[] {
  const problems: Problem[] = [];
  const base = join(root, 'plugins');
  const rel = (p: string) => relative(root, p).split(sep).join('/');
  for (const path of existsSync(base) ? walk(base) : []) {
    const file = rel(path);
    if (isAllowed(file, allowlist)) continue;
    if (file.split('/').some((part) => part === '.claude-plugin' || part === '.codex-plugin')) {
      problems.push({ file, message: 'harness manifest directory belongs in the generated distribution' });
      continue;
    }
    if (NATIVE_FILE.test(file)) problems.push({ file, message: 'harness-specific file name' });
    if (!TEXT.test(file)) continue;
    const text = readFileSync(path, 'utf8');
    if (file.endsWith('hooks.json') && NATIVE_EVENTS.test(text))
      problems.push({ file, message: 'native hook event name; declare neutral events instead' });
    text.split('\n').forEach((line, i) => {
      for (const [re, name] of PHRASES)
        if (re.test(line)) problems.push({ file, line: i + 1, message: `mentions ${name}` });
      if (FLOWS_TEXT.test(file) && !OVERRIDE.test(line))
        for (const re of CLAUDE_ONLY) {
          const found = re.exec(line)?.[0];
          if (found) problems.push({ file, line: i + 1, message: `mentions ${found}` });
        }
    });
  }
  for (const source of catalogSources)
    if (!existsSync(join(root, source, 'plugin.json')))
      problems.push({ file: `${source}/plugin.json`, message: 'missing neutral manifest' });
  return problems;
}

export function loadAllowlist(file: string): Allowed[] {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${file}: expected an array`);
  return value.map((a, i) => {
    if (!a || typeof a.path !== 'string' || typeof a.reason !== 'string' || !a.reason.trim())
      throw new Error(`${file}[${i}]: every entry needs a path and a reason`);
    return a as Allowed;
  });
}
