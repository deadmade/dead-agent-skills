import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildTree } from '../src/emit/build.ts';
import { check } from '../src/emit/commands.ts';

const put = (root: string, path: string, value: string | object) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'compiler-'));
  put(root, 'package.json', { version: '1.2.3' });
  put(root, 'plugins/catalog.json', [
    { name: 'a', source: 'plugins/a', resources: ['skills'], dependencies: [], targets: ['claude-code', 'codex'] },
    { name: 'only-claude', source: 'plugins/b', resources: [], dependencies: ['a'], targets: ['claude-code'] },
    { name: 'modded', source: 'plugins/c', resources: [], dependencies: [], targets: ['claude-code', 'codex'] },
  ]);
  put(root, 'plugins/a/plugin.json', {
    description: 'Plugin A for Claude.',
    author: { name: 'me' },
    dependencies: [{ name: 'official', marketplace: 'claude-plugins-official' }],
    mcpServers: { s: { url: 'https://x/mcp', headers: { Authorization: 'Bearer ${config.token}' } } },
    config: { token: { type: 'string', title: 'Token', sensitive: true } },
    hooks: 'hooks/hooks.json',
  });
  put(
    root,
    'plugins/a/skills/s/SKILL.md',
    '---\nname: s\ndescription: d\n---\nUse AskUserQuestion; see ${CLAUDE_PLUGIN_ROOT}/x.',
  );
  put(root, 'plugins/a/hooks/hooks.json', {
    hooks: [
      { event: 'session.started', handler: 'rules' },
      { event: 'tool.completed', script: 'hooks/p.mjs', tools: ['shell'] },
    ],
  });
  put(root, 'plugins/a/hooks/p.mjs', '');
  put(root, 'plugins/c/plugin.json', {
    description: 'C',
    extensions: [{ kind: 'ui-mod', entry: 'ui.tsx', copy: ['ui.tsx'] }],
  });
  put(root, 'plugins/c/ui.tsx', 'export {}');
  put(root, 'plugins/b/plugin.json', {
    description: 'B',
    extensions: [{ kind: 'ui-mod', entry: 'hooks/register.tsx', copy: ['hooks/register.tsx'] }],
  });
  put(root, 'plugins/b/hooks/register.tsx', 'export {}');
  return root;
}
test('one neutral source compiles to two native distributions', () => {
  const root = fixture();
  const out = join(root, 'out');
  const { diagnostics } = buildTree(root, out);
  assert.ok(
    diagnostics.some((d) => d.target === 'codex' && d.plugin === 'modded' && /ui\.tsx/.test(d.message)),
    'codex warns about the mod',
  );
  assert.equal(diagnostics.filter((d) => d.target === 'claude-code' && /ui-mod/.test(d.message)).length, 0);
  assert.ok(existsSync(join(out, '.claude-plugin/modded/ui.tsx')));
  assert.equal(existsSync(join(out, '.agents/plugins/modded/ui.tsx')), false);
  const cc = (p: string) => JSON.parse(readFileSync(join(out, '.claude-plugin', p), 'utf8'));
  const cx = (p: string) => JSON.parse(readFileSync(join(out, '.agents/plugins', p), 'utf8'));
  assert.equal(cc('a/.claude-plugin/plugin.json').version, '1.2.3');
  assert.deepEqual(cc('a/.claude-plugin/plugin.json').dependencies, ['official@claude-plugins-official']);
  assert.ok(cc('a/.claude-plugin/plugin.json').userConfig.token.sensitive);
  assert.equal(cc('a/.mcp.json').mcpServers.s.headers.Authorization, 'Bearer ${user_config.token}');
  assert.equal(cc('a/hooks/hooks.json').hooks.PostToolUse[0].matcher, 'Bash');
  assert.deepEqual(cc('only-claude/hooks/hooks.json'), { modules: ['./register.tsx'] });
  assert.deepEqual(cc('only-claude/.claude-plugin/plugin.json').dependencies, ['a']);
  assert.ok(existsSync(join(out, '.claude-plugin/only-claude/hooks/register.tsx')));
  assert.equal(cx('a/.codex-plugin/plugin.json').skills, './skills/');
  assert.equal(existsSync(join(out, '.agents/plugins/only-claude')), false);
  assert.equal(cx('a/hooks/hooks.json').hooks.SessionStart.length, 1);
  assert.equal(existsSync(join(out, '.agents/plugins/a/.mcp.json')), false);
  const skill = (dir: string) => readFileSync(join(out, dir, 'a/skills/s/SKILL.md'), 'utf8');
  assert.match(skill('.agents/plugins'), /host user-question tool/);
  assert.match(skill('.claude-plugin'), /AskUserQuestion/);
  assert.equal(
    JSON.parse(readFileSync(join(out, '.agents/plugins/marketplace.json'), 'utf8')).plugins[0].source.path,
    './.agents/plugins/a',
  );
});
test('check reports stale, missing and extra files and passes after a build', () => {
  const root = fixture();
  buildTree(root, join(root, 'built'));
  cpSync(join(root, 'built/.agents'), join(root, '.agents'), { recursive: true });
  cpSync(join(root, 'built/.claude-plugin'), join(root, '.claude-plugin'), { recursive: true });
  assert.deepEqual(check(root), []);
  writeFileSync(join(root, '.agents/plugins/a/README.md'), 'x');
  writeFileSync(join(root, '.claude-plugin/a/.mcp.json'), '{}');
  const problems = check(root);
  assert.ok(problems.includes('extra: .agents/plugins/a/README.md'));
  assert.ok(problems.includes('stale: .claude-plugin/a/.mcp.json'));
});
test('a plugin without plugin.json or with a missing resource is rejected before output', () => {
  const root = fixture();
  put(root, 'plugins/catalog.json', [
    { name: 'a', source: 'plugins/a', resources: ['nope'], dependencies: [], targets: ['codex'] },
  ]);
  assert.throws(() => buildTree(root, join(root, 'out')), /Missing package resource a\/nope/);
  assert.equal(existsSync(join(root, 'out')), false);
});
