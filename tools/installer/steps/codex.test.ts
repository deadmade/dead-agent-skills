import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyCodex, type CodexIO } from './codex.ts';
import { buildTree } from '../../harness-compiler/src/emit/build.ts';
import { VERSION, failures } from '../context.ts';

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'codex-installer-'));
  const home = join(temp, 'home with spaces'),
    source = join(temp, 'source');
  mkdirSync(home);
  buildTree(resolve(import.meta.dirname, '../../..'), source);
  const calls: string[][] = [];
  let installed: string[] = [];
  let selected = ['postgres'];
  let mcps: string[] = [];
  const io: CodexIO = {
    home,
    source,
    which: (name) => `/tools/${name}`,
    command: (...args) => {
      calls.push(args);
      if (args[0] === 'plugin' && args[1] === 'list')
        return JSON.stringify({ installed: installed.map((name) => ({ pluginId: `${name}@dead-agent-skills` })) });
      if (args[0] === 'mcp' && args[1] === 'add' && args[2] === 'dead-agent-skills-mcp-azure')
        writeFileSync(join(home, 'config.toml'), '[mcp_servers.dead-agent-skills-mcp-azure]\ncommand = "node"\n');
      if (args[0] === 'mcp' && args[1] === 'list') return JSON.stringify(mcps.map((name) => ({ name })));
      if (args[0] === 'plugin' && args[1] === 'add') installed.push(args[2].split('@')[0]);
      if (args[0] === 'plugin' && args[1] === 'remove')
        installed = installed.filter((n) => n !== args[2].split('@')[0]);
      return '{}';
    },
    screen: async (state: any) =>
      ({ ...state, chosen: Object.fromEntries(selected.map((n) => [n, true])), result: 'apply' }) as any,
    ask: async () => true,
    browser: async () => ({ path: '/tools/agent-browser', works: false }),
  };
  return {
    temp,
    home,
    source,
    calls,
    io,
    select: (names: string[]) => {
      selected = names;
    },
    mcp: (names: string[]) => {
      mcps = names;
    },
    state: () => JSON.parse(readFileSync(join(home, 'dead-agent-skills/state.json'), 'utf8')),
    close: () => rmSync(temp, { recursive: true, force: true }),
  };
}

test('Codex installs, repeats, updates and removes only selected managed components', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.home, 'AGENTS.md'), '# Existing rules\n');
    await applyCodex(f.io);
    assert.deepEqual(f.state().selected, ['dead-skills', 'postgres']);
    assert.ok(readFileSync(join(f.home, 'AGENTS.md'), 'utf8').startsWith('# Existing rules\n'));
    f.calls.length = 0;
    await applyCodex(f.io);
    assert.ok(!f.calls.some((c) => c[0] === 'plugin' && c[1] === 'add'));
    f.select(['rust-skills']);
    await applyCodex(f.io);
    assert.ok(f.calls.some((c) => c[1] === 'remove' && c[2] === 'postgres@dead-agent-skills'));
    assert.equal(f.state().version, VERSION);
  } finally {
    f.close();
  }
});
test('Codex configures MCP using native CLI and emits environment-based authentication handoffs', async () => {
  const f = fixture();
  try {
    f.select(['flows', 'mcp-github', 'mcp-azure', 'atlassian']);
    await applyCodex(f.io);
    assert.ok(f.state().selected.includes('graphify'));
    assert.ok(f.calls.some((c) => c.includes('--bearer-token-env-var')));
    assert.ok(f.calls.some((c) => c.includes('/tools/web-mcp')));
    assert.ok(f.calls.some((c) => c.includes('/tools/ado-mcp')));
    assert.match(
      readFileSync(join(f.home, 'config.toml'), 'utf8'),
      /env_vars = \["ADO_ORG_URL","ADO_PAT","ADO_PROJECT_DIR"\]/,
    );
    f.select([]);
    await applyCodex(f.io);
    assert.ok(f.calls.some((c) => c[0] === 'mcp' && c[1] === 'remove' && c[2] === 'dead-agent-skills-web-mcp'));
  } finally {
    f.close();
  }
});
test('Codex downloads the ado-mcp release when it is absent from PATH', async () => {
  const f = fixture();
  try {
    f.select(['mcp-azure']);
    f.io.which = (name) => (name === 'ado-mcp' ? undefined : `/tools/${name}`);
    const downloads: string[] = [];
    f.io.download = async (name, _asset, destination) => {
      downloads.push(name);
      mkdirSync(join(destination, '..'), { recursive: true });
      writeFileSync(destination, 'binary fixture');
    };
    await applyCodex(f.io);
    assert.deepEqual(downloads, ['ado-mcp']);
    const add = f.calls.find((c) => c[0] === 'mcp' && c[1] === 'add' && c[2] === 'dead-agent-skills-mcp-azure')!;
    assert.equal(add[3], '--');
    assert.ok(add[4].startsWith(join(f.home, 'dead-agent-skills/bin', VERSION)));
    assert.match(add[4], /ado-mcp(?:\.exe)?$/);
    assert.ok(!add.some((arg) => arg.includes('npx')));
  } finally {
    f.close();
  }
});
test('Codex refuses to overwrite unowned MCP names', async () => {
  const f = fixture();
  try {
    f.mcp(['dead-agent-skills-dead-skills']);
    await assert.rejects(applyCodex(f.io), /outside this install/);
    assert.ok(!f.calls.some((c) => c[0] === 'mcp' && c[1] === 'add'));
  } finally {
    f.close();
  }
});
test('missing Codex and cancellation do not install anything', async () => {
  const count = failures.length;
  await applyCodex({ which: () => undefined });
  assert.equal(failures.length, count + 1);
  failures.splice(count);
  const f = fixture();
  try {
    f.io.screen = async (state: any) => ({ ...state, result: 'quit' }) as any;
    await applyCodex(f.io);
    assert.ok(!existsSync(join(f.home, 'dead-agent-skills')));
  } finally {
    f.close();
  }
});
test('interrupted upgrade keeps the previous version so it can be retried', async () => {
  const f = fixture();
  try {
    await applyCodex(f.io);
    const path = join(f.home, 'dead-agent-skills/state.json');
    writeFileSync(path, JSON.stringify({ ...f.state(), version: '0.0.1' }));
    const command = f.io.command!;
    f.io.command = (...args) => {
      if (args[0] === 'plugin' && args[1] === 'add' && args[2].startsWith('postgres@'))
        throw new Error('simulated failure');
      return command(...args);
    };
    await assert.rejects(applyCodex(f.io), /simulated failure/);
    assert.equal(f.state().version, '0.0.1');
  } finally {
    f.close();
  }
});

test('Codex offers shared catalog choices and installs the flows dependency closure', async () => {
  const f = fixture();
  try {
    f.select(['flows']);
    const choose = f.io.screen!;
    f.io.screen = async (state, controls) => {
      const choices = (state as unknown as { chosen: Record<string, boolean> }).chosen;
      // These are the actual installer choices before the test user selects flows.
      assert.deepEqual(Object.keys(choices).sort(), [
        'atlassian',
        'csharp-skills',
        'flows',
        'graphify',
        'hallmark',
        'mcp-azure',
        'mcp-github',
        'postgres',
        'rust-skills',
        'web-mcp',
      ]);
      for (const native of ['nix-lsp', 'md-pane']) assert.equal(Object.hasOwn(choices, native), false);
      // The default component is automatic rather than an opt-out choice.
      assert.equal(Object.hasOwn(choices, 'dead-skills'), false);
      return choose(state, controls);
    };
    await applyCodex(f.io);
    const additions = f.calls.filter((call) => call[0] === 'plugin' && call[1] === 'add').map((call) => call[2]);
    assert.deepEqual(additions, [
      'dead-skills@dead-agent-skills',
      'flows@dead-agent-skills',
      'graphify@dead-agent-skills',
      'web-mcp@dead-agent-skills',
    ]);
    assert.deepEqual(f.state().selected, ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  } finally {
    f.close();
  }
});

for (const change of [
  'none',
  'append',
  'edit',
  'symlink',
  'override',
  'package',
  'decline',
  'stale',
  'empty-override',
  'shadowed',
  'untrusted',
  'receipt-source',
])
  test(`migration revalidates ${change}`, async () => {
    const f = fixture();
    try {
      const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
      const pkg = join(f.source, '.agents/plugins/dead-skills');
      const rules = readFileSync(join(pkg, 'rules.md'), 'utf8').trim();
      const file = join(f.home, 'AGENTS.md');
      const block = `<!-- dead-agent-skills:start -->\n${rules}\n<!-- dead-agent-skills:end -->`;
      writeFileSync(file, 'before\n' + block + '\nafter');
      const base = join(f.home, 'dead-agent-skills');
      mkdirSync(base);
      writeFileSync(
        join(base, 'rules-hook.json'),
        JSON.stringify({
          packageVersion: JSON.parse(readFileSync(join(pkg, 'hooks/runtime/package.json'), 'utf8')).version,
          rulesHash: hash(rules),
          adapterHash: change === 'stale' ? 'stale' : hash(readFileSync(join(pkg, 'hooks/runtime/codex.mjs'))),
          source: 'agents',
          managedBlockPresent: true,
          cleanupEligible: true,
        }),
      );
      if (change === 'untrusted') rmSync(join(base, 'rules-hook.json'));
      if (change === 'shadowed') writeFileSync(join(f.home, 'AGENTS.override.md'), 'foreign override');
      if (change === 'empty-override') writeFileSync(join(f.home, 'AGENTS.override.md'), '  ');
      let questions = 0;
      f.io.ask = async () => {
        questions++;
        if (change === 'receipt-source') {
          const path = join(base, 'rules-hook.json');
          writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), source: 'override' }));
        }
        if (change === 'append') writeFileSync(file, readFileSync(file, 'utf8') + '\nconcurrent');
        if (change === 'edit')
          writeFileSync(file, readFileSync(file, 'utf8').replace('Commit messages', 'Edited messages'));
        if (change === 'symlink') {
          rmSync(file);
          writeFileSync(join(f.home, 'foreign'), 'foreign');
          symlinkSync(join(f.home, 'foreign'), file);
        }
        if (change === 'override') writeFileSync(join(f.home, 'AGENTS.override.md'), 'new source');
        if (change === 'package')
          writeFileSync(join(base, `marketplace-${VERSION}/.agents/plugins/dead-skills/rules.md`), 'changed');
        return change !== 'decline';
      };
      await applyCodex(f.io);
      const result = readFileSync(file, 'utf8');
      if (['none', 'append', 'empty-override'].includes(change)) {
        assert.equal(result.includes(block), false);
        assert.ok(result.startsWith('before\n'));
        if (change === 'append') assert.ok(result.endsWith('concurrent'));
      } else if (change === 'symlink') assert.equal(result, 'foreign');
      else assert.ok(result.includes('<!-- dead-agent-skills:start -->'));
      if (['stale', 'untrusted', 'shadowed'].includes(change)) assert.equal(questions, 0);
    } finally {
      f.close();
    }
  });
test('fresh setup leaves global instructions absent and installs packaged theme', async () => {
  const f = fixture();
  try {
    await applyCodex(f.io);
    assert.equal(existsSync(join(f.home, 'AGENTS.md')), false);
    assert.equal(
      readFileSync(join(f.home, 'themes/night-city.tmTheme'), 'utf8'),
      readFileSync(join(f.source, '.agents/plugins/dead-skills/themes/night-city.tmTheme'), 'utf8'),
    );
  } finally {
    f.close();
  }
});

test('existing instructions and foreign configuration survive reruns', async () => {
  const f = fixture();
  try {
    const config = '[mcp_servers.foreign]\nurl = "https://example.com"\n';
    writeFileSync(join(f.home, 'config.toml'), config);
    writeFileSync(join(f.home, 'AGENTS.md'), 'personal rules');
    f.mcp(['foreign']);
    await applyCodex(f.io);
    await applyCodex(f.io);
    assert.equal(readFileSync(join(f.home, 'config.toml'), 'utf8'), config);
    assert.equal(readFileSync(join(f.home, 'AGENTS.md'), 'utf8'), 'personal rules');
    assert.equal(
      f.calls.some((c) => c[0] === 'mcp' && c[1] === 'remove' && c[2] === 'foreign'),
      false,
    );
  } finally {
    f.close();
  }
});
