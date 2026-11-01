// Optional native CLI check; isolated from the user's profile and never starts a model or an MCP server.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectTarget } from '../tools/installer/core/catalog.ts';
import { readCatalog } from '../tools/installer/system/catalog.ts';
const definitions = selectTarget(readCatalog(resolve(import.meta.dirname, '..')), 'codex').plugins;
import { which, startSync } from '../tools/installer/system/proc.ts';

const codex = which('codex');
test('repository catalog installs directly with no installer or build', { skip: !codex }, () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-native-'));
  try {
    mkdirSync(join(root, 'profile'));
    const catalog = join(root, 'catalog');
    const source = resolve(import.meta.dirname, '..');
    // Mimic a checkout containing only the two catalogs and shipped Codex packages: no installer or build tools.
    for (const dir of ['.agents/plugins', '.claude-plugin', 'portable'])
      cpSync(join(source, dir), join(catalog, dir), { recursive: true });
    const run = (...args) => {
      const result = startSync(codex, args, { cwd: root, env: { ...process.env, CODEX_HOME: join(root, 'profile') } });
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
      return result.stdout;
    };
    run('plugin', 'marketplace', 'add', catalog);
    for (const { name } of definitions) run('plugin', 'add', `${name}@dead-agent-skills`, '--json');
    const plugins = JSON.parse(run('plugin', 'list', '--json')).installed;
    assert.equal(plugins.length, definitions.length);
    assert.ok(plugins.every((p) => p.source.path.includes('portable')));
    assert.equal(JSON.parse(run('plugin', 'list', '--available', '--json')).installed.length, definitions.length);
    run('plugin', 'add', 'flows@dead-agent-skills', '--json');
    run('mcp', 'add', 'dead-agent-skills-test', '--url', 'https://example.com/mcp');
    assert.ok(JSON.parse(run('mcp', 'list', '--json')).some((p) => p.name === 'dead-agent-skills-test'));
    run('mcp', 'remove', 'dead-agent-skills-test');
    run('plugin', 'remove', 'flows@dead-agent-skills', '--json');
    assert.ok(!JSON.parse(run('plugin', 'list', '--json')).installed.some((p) => p.name === 'flows'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const claude = which('claude');
test(
  'Claude marketplace discovers and installs a native-only package in an isolated profile',
  { skip: !claude },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'claude-native-'));
    try {
      const catalog = join(root, 'catalog');
      for (const dir of ['.claude-plugin', 'portable/claude-code'])
        cpSync(join(resolve(import.meta.dirname, '..'), dir), join(catalog, dir), { recursive: true });
      const run = (...args) => {
        const result = startSync(claude, args, {
          cwd: root,
          env: { ...process.env, CLAUDE_CONFIG_DIR: join(root, 'profile') },
          timeout: 30000,
        });
        assert.equal(result.status, 0, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
        return result.stdout;
      };
      run('plugin', 'marketplace', 'add', catalog);
      run('plugin', 'install', 'md-pane@dead-claude-skills');
      assert.match(run('plugin', 'list', '--json'), /md-pane@dead-claude-skills/);
      run('plugin', 'uninstall', 'md-pane@dead-claude-skills');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
