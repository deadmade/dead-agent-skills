import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildTree } from '../src/emit/build.ts';

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
test('a plugin without plugin.json or with a missing resource is rejected before output', () => {
  const root = fixture();
  put(root, 'plugins/catalog.json', [
    { name: 'a', source: 'plugins/a', resources: ['nope'], dependencies: [], targets: ['codex'] },
  ]);
  assert.throws(() => buildTree(root, join(root, 'out')), /Missing package resource a\/nope/);
  assert.equal(existsSync(join(root, 'out')), false);
});

// A flows plugin with one conductor, one other skill and one step.
function flows(conductor: string) {
  const root = mkdtempSync(join(tmpdir(), 'compiler-'));
  put(root, 'package.json', { version: '1.2.3' });
  put(root, 'plugins/catalog.json', [
    {
      name: 'flows',
      source: 'plugins/flows',
      resources: ['skills'],
      dependencies: [],
      targets: ['claude-code', 'codex'],
    },
  ]);
  put(root, 'plugins/flows/plugin.json', { description: 'Flows.' });
  put(root, 'plugins/flows/skills/f/SKILL.md', conductor);
  put(root, 'plugins/flows/skills/w/SKILL.md', '---\nname: w\ndescription: d\n---\nWrite.\n');
  put(root, 'plugins/flows/steps/a.toml', "text = '''\nThen {{ask-user}}.\n'''\n");
  return root;
}
const CONDUCTOR = '---\nname: f\ndescription: d\ndisable-model-invocation: true\n---\n';
test('flows compose per harness, and Codex conductors get an implicit-invocation policy', () => {
  const root = flows(`${CONDUCTOR}# f\n\n[step: a]\n`);
  const out = join(root, 'out');
  buildTree(root, out);
  const read = (path: string) => readFileSync(join(out, path), 'utf8');
  assert.equal(read('.claude-plugin/flows/skills/f/SKILL.md'), `${CONDUCTOR}# f\n\nThen the AskUserQuestion tool.\n`);
  assert.match(read('.agents/plugins/flows/skills/f/SKILL.md'), /^# f\n\nThen the host user-question tool/m);
  assert.doesNotMatch(read('.agents/plugins/flows/skills/f/SKILL.md'), /AskUserQuestion|\{\{|\[step:/);
  assert.equal(
    read('.agents/plugins/flows/skills/f/agents/openai.yaml'),
    'policy:\n  allow_implicit_invocation: false\n',
  );
  assert.equal(existsSync(join(out, '.agents/plugins/flows/skills/w/agents')), false);
  assert.equal(existsSync(join(out, '.claude-plugin/flows/skills/f/agents')), false);
  assert.throws(() => buildTree(flows('[step: nope]\n'), join(root, 'again')), /unknown step nope/);
});
// The built-text problems a build reports (check-repo and the CLI fail on them).
const checked = (conductor: string) => {
  const root = flows(conductor);
  return buildTree(root, join(root, 'built')).problems;
};
test('a build reports a conductor over budget', () => {
  const over = checked(`${CONDUCTOR}${'x'.repeat(20000)}\n## Phase 1: Read\n`);
  assert.equal(over.length, 2);
  assert.ok(
    over.every((p) => /^.*skills\/f\/SKILL\.md:\d+: /.test(p)),
    over.join('\n'),
  );
});
test('a build reports an unresolved node path', () => {
  const problems = checked(`${CONDUCTOR}Run node "<flow-root>/missing.mjs".\n`);
  assert.deepEqual(
    problems.map((p) => p.split(': ')[0]),
    ['[claude-code] skills/f/SKILL.md:6', '[codex] skills/f/SKILL.md:6'],
    problems.join('\n'),
  );
  assert.ok(
    problems.every((p) => /missing\.mjs/.test(p)),
    problems.join('\n'),
  );
});
test('a build reports Codex text naming a Claude-only phrase', () => {
  const problems = checked(`${CONDUCTOR}Search with WebSearch.\n`);
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /^\[codex\] skills\/f\/SKILL\.md:6: .*WebSearch/);
});

test('Codex flows README lists declared companion plugins in dependency order', () => {
  const root = flows(`${CONDUCTOR}# f\n`);
  put(root, 'plugins/catalog.json', [
    {
      name: 'flows',
      source: 'plugins/flows',
      resources: ['skills'],
      dependencies: ['alpha', 'beta'],
      targets: ['codex'],
    },
    ...['alpha', 'beta'].map((name) => ({
      name,
      source: `plugins/${name}`,
      resources: [],
      dependencies: [],
      targets: ['codex'],
    })),
  ]);
  for (const name of ['alpha', 'beta']) put(root, `plugins/${name}/plugin.json`, { description: name });
  const out = join(root, 'out');
  buildTree(root, out);
  const readme = readFileSync(join(out, '.agents/plugins/flows/README.md'), 'utf8');
  assert.deepEqual(readme.match(/^codex plugin add .*$/gm), [
    'codex plugin add flows@dead-agent-skills',
    'codex plugin add alpha@dead-agent-skills',
    'codex plugin add beta@dead-agent-skills',
  ]);
  assert.doesNotMatch(readme, /^codex plugin add graphify@/m);
});
