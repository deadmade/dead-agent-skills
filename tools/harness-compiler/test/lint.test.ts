import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { isAllowed, lintPlugins, loadAllowlist } from '../src/lint.ts';

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'lint-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const messages = (root: string, allow: { path: string; reason: string }[] = [], sources = ['plugins/a']) =>
  lintPlugins(root, allow, sources).map((p) => `${p.file}${p.line ? ':' + p.line : ''} ${p.message}`);

test('a neutral plugin is clean', () => {
  const root = fixture({ 'plugins/a/plugin.json': '{}', 'plugins/a/README.md': 'Rules and notifications.\n' });
  try {
    assert.deepEqual(messages(root), []);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('harness phrases are reported with file and line', () => {
  const root = fixture({
    'plugins/a/plugin.json': '{}',
    'plugins/a/README.md': 'ok\nRun codex mcp add x\nand `${CLAUDE_PLUGIN_ROOT}`\n',
    'plugins/a/doc.md': 'see ~/.claude/bin and $CODEX_HOME and CLAUDE_CONFIG_DIR\n',
  });
  try {
    const found = messages(root);
    assert.ok(found.includes('plugins/a/README.md:2 mentions a codex plugin/mcp command'));
    assert.ok(found.includes('plugins/a/README.md:3 mentions CLAUDE_PLUGIN_ROOT'));
    for (const name of ['~/.claude', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR'])
      assert.ok(found.includes(`plugins/a/doc.md:1 mentions ${name}`), name);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('native manifests, native file names and native hook events are reported', () => {
  const root = fixture({
    'plugins/a/plugin.json': '{}',
    'plugins/a/.claude-plugin/plugin.json': '{}',
    'plugins/a/.mcp.json': '{}',
    'plugins/a/hooks/codex.mjs': '',
    'plugins/a/hooks/hooks.json': '{"hooks":{"SessionStart":[]}}',
  });
  try {
    const found = messages(root).join('\n');
    assert.match(found, /\.claude-plugin\/plugin\.json harness manifest directory/);
    assert.match(found, /\.mcp\.json harness-specific file name/);
    assert.match(found, /hooks\/codex\.mjs harness-specific file name/);
    assert.match(found, /hooks\/hooks\.json native hook event name/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('allowlisted paths are skipped and a catalog source without plugin.json is reported', () => {
  const root = fixture({ 'plugins/a/plugin.json': '{}', 'plugins/a/packs/x/SKILL.md': 'codex plugin add x\n' });
  try {
    assert.deepEqual(messages(root, [{ path: 'plugins/a/packs', reason: 'vendored' }]), []);
    assert.deepEqual(
      messages(root, [], ['plugins/a', 'plugins/b']).filter((m) => m.includes('plugins/b')),
      ['plugins/b/plugin.json missing neutral manifest'],
    );
    assert.ok(isAllowed('plugins/a/packs/x', [{ path: 'plugins/a/packs', reason: 'r' }]));
    assert.ok(!isAllowed('plugins/a/packsx', [{ path: 'plugins/a/packs', reason: 'r' }]));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("a Claude-only phrase in a flows step is a problem, but not on an override-marker line or in flows' README", () => {
  const ask = 'Ask with AskUserQuestion.\n';
  const root = fixture({
    'plugins/flows/plugin.json': '{}',
    'plugins/flows/steps/x.toml': `text = '''\n${ask}'''\n`,
    'plugins/flows/steps/y.toml': `text = '''\n<!-- overrides p/SKILL.md: "${ask.trim()}" -->\n'''\n`,
    'plugins/flows/README.md': ask,
  });
  try {
    assert.deepEqual(messages(root, [], ['plugins/flows']), ['plugins/flows/steps/x.toml:2 mentions AskUserQuestion']);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('allowlist entries need a reason', () => {
  const root = fixture({ 'allow.json': '[{"path":"plugins/x","reason":""}]' });
  try {
    assert.throws(() => loadAllowlist(join(root, 'allow.json')), /path and a reason/);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('the repository plugins/ tree is agent-neutral', async () => {
  const { loadPlugins } = await import('../src/load.ts');
  const repo = join(import.meta.dirname, '../../..');
  const sources = loadPlugins(repo).flatMap((p) => (typeof p.source === 'string' ? [p.source] : []));
  assert.deepEqual(messages(repo, loadAllowlist(join(import.meta.dirname, '../src/lint-allowlist.json')), sources), []);
});
