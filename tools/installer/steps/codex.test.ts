import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyCodex, type CodexIO } from './codex.ts';
import { buildTree } from '../../harness-compiler/src/emit/build.ts';
import { VERSION, failures } from '../context.ts';

// What install.real.test.ts can't reach in one fresh install: reruns, upgrades, foreign or lost entries, failures,
// darwin and the legacy rules block.

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
    // fake: Codex's state between runs (a rerun, an older release, a foreign or failing entry), which one fresh real
    // install can't produce; install.real.test.ts runs the real codex.
    command: (...args) => {
      calls.push(args);
      if (args[0] === 'plugin' && args[1] === 'list')
        return JSON.stringify({ installed: installed.map((name) => ({ pluginId: `${name}@dead-agent-skills` })) });
      // Codex writes the table; the fake does so for the servers whose table the installer then edits.
      if (
        args[0] === 'mcp' &&
        args[1] === 'add' &&
        ['dead-agent-skills-mcp-azure', 'dead-agent-skills-serena'].includes(args[2])
      )
        appendFileSync(join(home, 'config.toml'), `[mcp_servers.${args[2]}]\ncommand = "node"\n`);
      if (args[0] === 'mcp' && args[1] === 'list') return JSON.stringify(mcps.map((name) => ({ name })));
      if (args[0] === 'plugin' && args[1] === 'add') installed.push(args[2].split('@')[0]);
      if (args[0] === 'plugin' && args[1] === 'remove')
        installed = installed.filter((n) => n !== args[2].split('@')[0]);
      return '{}';
    },
    screen: async (state: any) =>
      ({ ...state, chosen: Object.fromEntries(selected.map((n) => [n, true])), result: 'apply' }) as any,
    ask: async () => true,
    // fake: serena-agent installs unpinned, which a gating test never runs (ADR 0018).
    serena: async () => undefined,
    // fake: graphify's CLI is unpinned too, and the real cleanup runs uv on the developer's own bin folder.
    cleanup: async () => {},
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
    installed: (names: string[]) => {
      installed = names;
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
test('Codex writes the GitHub and Atlassian url servers, and removes a deselected server on a rerun', async () => {
  const f = fixture();
  try {
    f.select(['mcp-github', 'atlassian']);
    await applyCodex(f.io);
    const config = readFileSync(join(f.home, 'config.toml'), 'utf8');
    assert.match(
      config,
      /^\[mcp_servers\.dead-agent-skills-mcp-github\]\nurl = "https:\/\/api\.githubcopilot\.com\/mcp"\nbearer_token_env_var = "GITHUB_PERSONAL_ACCESS_TOKEN"$/m,
    );
    assert.match(
      config,
      /^\[mcp_servers\.dead-agent-skills-atlassian\]\nurl = "https:\/\/mcp\.atlassian\.com\/v1\/mcp"$/m,
    );
    assert.ok(!f.calls.some((c) => c[0] === 'mcp' && c[1] === 'add'));
    assert.deepEqual(f.state().mcp, ['dead-skills', 'mcp-github', 'atlassian']);
    f.select([]);
    await applyCodex(f.io);
    assert.ok(f.calls.some((c) => c[0] === 'mcp' && c[1] === 'remove' && c[2] === 'dead-agent-skills-mcp-github'));
  } finally {
    f.close();
  }
});
test('a symlinked config.toml is edited at a writable target; a read-only one is failure lines, and the step goes on', async (t) => {
  const f = fixture();
  const target = join(f.temp, 'dotfiles', 'config.toml');
  try {
    mkdirSync(join(f.temp, 'dotfiles'));
    writeFileSync(target, 'model = "o3"\n');
    try {
      symlinkSync(target, join(f.home, 'config.toml'), 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      return t.skip('creating a symlink needs symlink rights here');
    }
    f.select(['mcp-github', 'mcp-azure', 'serena']);
    f.io.serena = async () => '/tools/uv-bin/serena';
    await applyCodex(f.io);
    assert.ok(lstatSync(join(f.home, 'config.toml')).isSymbolicLink());
    const written = readFileSync(target, 'utf8');
    assert.match(written, /^model = "o3"\n[\s\S]*\[mcp_servers\.dead-agent-skills-mcp-github\]/);
    assert.match(written, /\[mcp_servers\.dead-agent-skills-mcp-azure\]\nenv_vars = /);
    assert.match(written, /\[mcp_servers\.dead-agent-skills-serena\]\nstartup_timeout_sec = 15\n/);

    // home-manager's link points into the read-only nix store, which already holds the servers codex adds.
    const managed = [
      'model = "o3"',
      '[mcp_servers.dead-agent-skills-mcp-azure]',
      'command = "node"',
      '[mcp_servers.dead-agent-skills-serena]',
      'command = "node"',
      '',
    ].join('\n');
    writeFileSync(target, managed);
    chmodSync(target, 0o444);
    const command = f.io.command!;
    // fake: a codex that finds its stdio server already declared in a read-only config writes nothing there.
    f.io.command = (...args) => (args[0] === 'mcp' && args[1] === 'add' ? '{}' : command(...args));
    const before = failures.length;
    await applyCodex(f.io);
    assert.equal(readFileSync(target, 'utf8'), managed);
    const lines = failures.slice(before);
    assert.equal(lines.length, 3, lines.join('\n'));
    assert.match(lines[0], /env_vars = \[.*\] to \[mcp_servers\.dead-agent-skills-mcp-azure\]/);
    assert.match(lines[1], /startup_timeout_sec = 15 to \[mcp_servers\.dead-agent-skills-serena\]/);
    assert.match(lines[2], /dead-agent-skills-dead-skills\][\s\S]*dead-agent-skills-mcp-github\]/);
    for (const line of lines) assert.match(line, /read-only .*config\.toml; add .* where it is managed$/);
    assert.equal(f.state().version, VERSION);
  } finally {
    if (existsSync(target)) chmodSync(target, 0o644);
    f.close();
  }
});
test('Codex adds serena with the path uv installed it to, the built args and a start timeout', async () => {
  const f = fixture();
  try {
    f.select(['serena']);
    f.io.serena = async () => '/tools/uv-bin/serena';
    await applyCodex(f.io);
    const add = f.calls.find((c) => c[0] === 'mcp' && c[1] === 'add' && c[2] === 'dead-agent-skills-serena');
    assert.deepEqual(add, [
      'mcp',
      'add',
      'dead-agent-skills-serena',
      '--',
      '/tools/uv-bin/serena',
      'start-mcp-server',
      '--context',
      'ide',
      '--project-from-cwd',
      '--enable-web-dashboard',
      'False',
      '--open-web-dashboard',
      'False',
      '--add-mode',
      'no-memories',
    ]);
    assert.match(
      readFileSync(join(f.home, 'config.toml'), 'utf8'),
      /\[mcp_servers\.dead-agent-skills-serena\]\nstartup_timeout_sec = 15\n/,
    );
  } finally {
    f.close();
  }
});
test('a failed serena install adds no serena server', async () => {
  const f = fixture();
  try {
    let asked = 0;
    f.io.serena = async () => {
      asked++;
      return undefined;
    };
    f.select(['serena']);
    await applyCodex(f.io);
    assert.equal(asked, 1);
    assert.ok(!f.calls.some((c) => c[0] === 'mcp' && c[1] === 'add' && c[2] === 'dead-agent-skills-serena'));
  } finally {
    f.close();
  }
});
test('a rerun on a machine with graphify removes it and cleans up its CLI once', async () => {
  const f = fixture();
  try {
    let cleaned = 0;
    f.io.cleanup = async () => {
      cleaned++;
    };
    f.installed(['dead-skills', 'graphify']);
    f.select(['postgres']);
    await applyCodex(f.io);
    assert.ok(f.calls.some((c) => c[0] === 'plugin' && c[1] === 'remove' && c[2] === 'graphify@dead-agent-skills'));
    assert.equal(cleaned, 1);
  } finally {
    f.close();
  }
});
test('a graphify removal Codex refuses is one failure line, and the rest of the step still runs', async () => {
  const f = fixture();
  try {
    const command = f.io.command!;
    f.io.command = (...args) => {
      if (args[1] === 'remove' && args[2] === 'graphify@dead-agent-skills') throw new Error('not in marketplace');
      return command(...args);
    };
    f.installed(['dead-skills', 'graphify']);
    f.select(['postgres']);
    await applyCodex(f.io);
    assert.ok(f.calls.some((c) => c[1] === 'add' && c[2] === 'postgres@dead-agent-skills'));
    assert.ok(failures.some((line) => line.includes('codex plugin remove graphify@dead-agent-skills')));
    assert.equal(f.state().version, VERSION);
  } finally {
    f.close();
  }
});
test('a failed removal of a plugin still in the catalog stops the step', async () => {
  const f = fixture();
  try {
    const command = f.io.command!;
    f.io.command = (...args) => {
      if (args[1] === 'remove' && args[2] === 'postgres@dead-agent-skills') throw new Error('locked');
      return command(...args);
    };
    f.installed(['dead-skills', 'postgres']);
    f.select([]);
    await assert.rejects(applyCodex(f.io), /locked/);
  } finally {
    f.close();
  }
});
test('a machine without graphify gets no graphify cleanup', async () => {
  const f = fixture();
  try {
    let cleaned = 0;
    f.io.cleanup = async () => {
      cleaned++;
    };
    f.select(['postgres']);
    await applyCodex(f.io);
    assert.equal(cleaned, 0);
  } finally {
    f.close();
  }
});
test('Codex keeps a PATH agent-browser on a platform with no pinned build', async () => {
  const f = fixture();
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const arch = Object.getOwnPropertyDescriptor(process, 'arch')!;
  try {
    // fake: Windows and Linux runners can't be darwin.
    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    Object.defineProperty(process, 'arch', { ...arch, value: 'arm64' });
    f.select(['flows']);
    f.io.which = (name) => `/path/${name}`;
    const before = failures.length;
    await applyCodex(f.io);
    const add = f.calls.find((c) => c[0] === 'mcp' && c[1] === 'add' && c[2] === 'dead-agent-skills-web-mcp')!;
    assert.ok(add.includes('WEB_MCP_AGENT_BROWSER=/path/agent-browser'));
    assert.equal(failures.length, before);
  } finally {
    Object.defineProperty(process, 'platform', platform);
    Object.defineProperty(process, 'arch', arch);
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
test('Codex recovers an existing default Context7 connection and can rerun', async () => {
  const f = fixture();
  try {
    const command = f.io.command!;
    f.io.command = (...args) =>
      args[0] === 'mcp' && args[1] === 'list'
        ? readFileSync(new URL('../core/fixtures/codex-mcp-list.json', import.meta.url), 'utf8')
        : command(...args);
    await applyCodex(f.io);
    assert.deepEqual(f.state().mcp, ['dead-skills']);
    assert.ok(!existsSync(join(f.home, 'config.toml')));
    await applyCodex(f.io);
    assert.deepEqual(f.state().mcp, ['dead-skills']);
    assert.equal(f.state().version, VERSION);
  } finally {
    f.close();
  }
});
test('missing Codex and cancellation do not install anything', async () => {
  const count = failures.length;
  // fake: a machine with codex on PATH can't also lack it.
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
test('existing instructions and foreign configuration survive reruns', async () => {
  const f = fixture();
  try {
    const config = '[mcp_servers.foreign]\nurl = "https://example.com"\n';
    writeFileSync(join(f.home, 'config.toml'), config);
    writeFileSync(join(f.home, 'AGENTS.md'), 'personal rules');
    f.mcp(['foreign']);
    await applyCodex(f.io);
    await applyCodex(f.io);
    assert.ok(readFileSync(join(f.home, 'config.toml'), 'utf8').startsWith(config));
    assert.equal(readFileSync(join(f.home, 'AGENTS.md'), 'utf8'), 'personal rules');
    assert.equal(
      f.calls.some((c) => c[0] === 'mcp' && c[1] === 'remove' && c[2] === 'foreign'),
      false,
    );
  } finally {
    f.close();
  }
});

// The keys the installer offers: what every category page of the real screens lists.
async function offered(f: ReturnType<typeof fixture>, platform: string, arch: string, webMcpOnPath: boolean) {
  const keys: string[] = [];
  f.io.which = (name) => (name === 'web-mcp' && !webMcpOnPath ? undefined : `/tools/${name}`);
  f.io.screen = async (state, controls) => {
    for (let page = 0; ; page++) {
      let text: string;
      try {
        text = controls.render({ ...(state as any), screen: 'category', page }, { columns: 160, rows: 80 }).join('\n');
      } catch {
        break;
      }
      keys.push(...[...text.matchAll(/^│ [ ❯] ([a-z][a-z0-9-]*) /gm)].map((m) => m[1]));
    }
    return { ...(state as any), result: 'apply' };
  };
  // fake: Windows and Linux runners can't be darwin.
  const real = Object.getOwnPropertyDescriptors(process);
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
  try {
    await applyCodex(f.io);
  } finally {
    Object.defineProperty(process, 'platform', real.platform);
    Object.defineProperty(process, 'arch', real.arch);
  }
  return keys;
}

test('Codex hides every web-mcp-dependent plugin when web-mcp has no build for the platform', async () => {
  const f = fixture();
  try {
    const keys = await offered(f, 'darwin', 'arm64', false);
    assert.ok(keys.includes('hallmark'));
    for (const hidden of ['web-mcp', 'flows', 'shop']) assert.ok(!keys.includes(hidden), `${hidden} was offered`);
    assert.ok(!f.calls.some((c) => c[0] === 'plugin' && c[1] === 'add' && /^(shop|web-mcp|flows)@/.test(c[2])));
  } finally {
    f.close();
  }
});
