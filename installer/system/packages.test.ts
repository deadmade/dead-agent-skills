import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { buildPackages, nativeMarketplace } from './packages.ts';
import { portableText } from '../core/package-adapters.ts';
import { selectTarget } from '../core/catalog.ts';
import { readCatalog } from './catalog.ts';
const root = resolve(import.meta.dirname, '../..');
const plugins = selectTarget(readCatalog(root), 'codex').plugins;

test('packages contain their resources, attribution and only intended discovered skills', () => {
  const temp = mkdtempSync(join(tmpdir(), 'portable-'));
  try {
    buildPackages(resolve(import.meta.dirname, '../..'), temp);
    const catalog = JSON.parse(readFileSync(join(temp, '.agents/plugins/marketplace.json'), 'utf8'));
    assert.equal(catalog.plugins.length, plugins.length);
    for (const entry of catalog.plugins) {
      const root = join(temp, entry.source.path);
      const manifest = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
      assert.equal(manifest.name, entry.name);
      assert.ok(existsSync(join(root, manifest.skills)));
      if (entry.name === 'dead-skills') assert.ok(existsSync(join(root, 'hooks/hooks.json')));
      for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
        if (file.endsWith('.md'))
          assert.ok(!/\$\{CLAUDE_(PLUGIN_ROOT|SKILL_DIR)\}/.test(readFileSync(join(root, file), 'utf8')), file);
      }
    }
    assert.ok(existsSync(join(temp, 'plugins/flows/packs/superpowers/skills/brainstorming/SKILL.md')));
    assert.ok(!existsSync(join(temp, 'plugins/flows/skills/brainstorming/SKILL.md')));
    assert.ok(existsSync(join(temp, 'plugins/flows/resources/graphify/skills/graphify/SKILL.md')));
    assert.ok(existsSync(join(temp, 'plugins/csharp-skills/library/csharp-expert/SKILL.md')));
    assert.ok(existsSync(join(temp, 'azure-mcp.mjs')));
    assert.deepEqual(nativeMarketplace(root, 'codex', './portable/plugins').plugins[0].source, {
      source: 'local',
      path: './portable/plugins/dead-skills',
    });
    for (const name of ['web-mcp', 'mcp-github', 'mcp-azure', 'atlassian']) {
      const setup = readFileSync(join(temp, 'plugins', name, 'skills', `setup-${name}`, 'SKILL.md'), 'utf8');
      assert.ok(setup.includes('codex mcp add'));
      assert.ok(!setup.includes('Run the dead-agent-skills installer'));
    }
    assert.ok(existsSync(join(temp, 'THIRD_PARTY.md')));
    for (const file of ['rules.md', 'skills/project-rules/SKILL.md']) {
      const policy = readFileSync(join(temp, 'plugins/dead-skills', file), 'utf8');
      assert.match(policy, /AGENTS\.md and CLAUDE\.md are still accurate/);
      assert.doesNotMatch(policy, /AGENTS\.md and AGENTS\.md/);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
test('host variable adaptation resolves from the document, not shell cwd', () => {
  assert.equal(
    portableText('${CLAUDE_PLUGIN_ROOT}/skills', '/pkg/packs/example/skills/a/SKILL.md', '/pkg'),
    '../../skills',
  );
  assert.equal(
    portableText('${CLAUDE_PLUGIN_ROOT}/library ${CLAUDE_SKILL_DIR} CLAUDE.md', '/pkg/skills/core/SKILL.md', '/pkg'),
    '../../library . AGENTS.md',
  );
});

test('Claude packages preserve native extensions and configuration, and generated paths exist', () => {
  const temp = mkdtempSync(join(tmpdir(), 'native-packages-'));
  try {
    buildPackages(root, temp);
    const marketplace = JSON.parse(readFileSync(join(temp, 'claude-code/.claude-plugin/marketplace.json'), 'utf8'));
    assert.equal(marketplace.name, 'dead-claude-skills');
    for (const entry of marketplace.plugins)
      if (typeof entry.source === 'string')
        assert.ok(existsSync(join(temp, 'claude-code', entry.source, '.claude-plugin/plugin.json')));
    for (const name of ['tui-review', 'md-pane'])
      assert.ok(existsSync(join(temp, 'claude-code/plugins', name, 'types/index.d.ts')));
    assert.ok(existsSync(join(temp, 'claude-code/plugins/graphify/hooks/hooks.json')));
    const bundle = JSON.parse(
      readFileSync(join(temp, 'claude-code/plugins/dead-skills/.claude-plugin/plugin.json'), 'utf8'),
    );
    assert.ok(bundle.dependencies.includes('security-guidance@claude-plugins-official'));
    for (const file of readdirSync(temp, { recursive: true, encoding: 'utf8' }))
      assert.ok(!/node_modules|\.test\.|tsconfig|\.cache/.test(file), file);
    for (const targetRoot of [temp, join(temp, 'claude-code')]) {
      const plugin = join(targetRoot, 'plugins/dead-skills');
      for (const name of readdirSync(join(targetRoot, 'plugins'))) {
        const packageRoot = join(targetRoot, 'plugins', name);
        for (const file of readdirSync(packageRoot, { recursive: true, encoding: 'utf8' })) {
          if (!/^(?:hooks|types)[\\/]/.test(file) || !/\.(?:mjs|cjs|js|ts|tsx)$/.test(file)) continue;
          assertImportClosure(packageRoot, join(packageRoot, file));
        }
      }
      const registrations = readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8');
      assert.ok(!registrations.includes('notify.mjs'));
      assert.ok(!registrations.includes('node -e'));
    }
    for (const name of ['dead-skills', 'web-mcp', 'mcp-github', 'mcp-azure'])
      assert.deepEqual(
        readFileSync(join(temp, 'claude-code/plugins', name, '.mcp.json')),
        readFileSync(join(root, plugins.find((p) => p.name === name)!.source as string, '.mcp.json')),
      );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('minimal source validates required capabilities before output mutation and preserves overlays', () => {
  const source = mkdtempSync(join(tmpdir(), 'package-source-')),
    output = mkdtempSync(join(tmpdir(), 'package-output-'));
  const json = (path: string, value: unknown) => {
    mkdirSync(join(source, path, '..'), { recursive: true });
    writeFileSync(join(source, path), JSON.stringify(value));
  };
  try {
    const entry = {
      name: 'example',
      description: 'Example',
      source: 'plugins/example',
      resources: ['skills'],
      dependencies: [],
      targets: ['claude-code', 'codex'],
      overlays: { 'claude-code': ['.claude-plugin/plugin.json', 'native'] },
      hooks: 'hooks/shared.json',
    };
    json('catalog/plugins.json', [entry]);
    json('package.json', { version: '1.2.3' });
    json('plugins/example/.claude-plugin/plugin.json', {
      name: 'example',
      dependencies: ['external@official'],
      userConfig: { option: { type: 'string' } },
    });
    json('plugins/example/skills/demo/SKILL.md', {});
    json('plugins/example/skills/demo/skip.test.ts', {});
    json('plugins/example/native/component.json', {});
    json('plugins/example/hooks/shared.json', [
      { event: 'notification.received', handler: 'notifications', required: true, background: true, timeoutSeconds: 8 },
    ]);
    writeFileSync(join(output, 'keep'), 'untouched');
    assert.throws(() => buildPackages(source, output), /Required hook/);
    assert.deepEqual(readdirSync(output), ['keep']);
    json('plugins/example/hooks/shared.json', []);
    json('plugins/example/.claude-plugin/plugin.json', { name: 'other-plugin', version: '9.0.0' });
    assert.throws(() => buildPackages(source, output), /Conflicting.*identity.*example.*other-plugin/);
    assert.deepEqual(readdirSync(output), ['keep']);
    json('plugins/example/.claude-plugin/plugin.json', {
      name: 'example',
      version: '9.0.0',
      dependencies: ['external@official'],
    });
    buildPackages(source, output);
    assert.ok(existsSync(join(output, 'claude-code/plugins/example/native/component.json')));
    assert.ok(!existsSync(join(output, 'plugins/example/native')));
    assert.ok(!existsSync(join(output, 'plugins/example/skills/demo/skip.test.ts')));
    assert.equal(
      JSON.parse(readFileSync(join(output, 'claude-code/plugins/example/.claude-plugin/plugin.json'), 'utf8'))
        .dependencies[0],
      'external@official',
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('missing shared runtime fails before mutating output', () => {
  const source = mkdtempSync(join(tmpdir(), 'missing-runtime-')),
    output = mkdtempSync(join(tmpdir(), 'missing-runtime-output-'));
  try {
    mkdirSync(join(source, 'catalog'));
    mkdirSync(join(source, 'plugins/default'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(source, 'catalog/plugins.json'),
      JSON.stringify([
        {
          name: 'dead-skills',
          description: 'Rules',
          source: 'plugins/default',
          resources: [],
          dependencies: [],
          targets: ['claude-code', 'codex'],
          overlays: {},
        },
      ]),
    );
    writeFileSync(join(output, 'keep'), 'unchanged');
    assert.throws(() => buildPackages(source, output));
    assert.deepEqual(readdirSync(output), ['keep']);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('packaged startup rules include their handler and deterministic receipt metadata', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rules-build-'));
  try {
    buildPackages(root, temp);
    for (const prefix of ['', 'claude-code']) {
      const base = join(temp, prefix, 'plugins/dead-skills');
      assert.ok(existsSync(join(base, 'hooks/rules.mjs')));
      assert.deepEqual(JSON.parse(readFileSync(join(base, 'hooks/runtime/package.json'), 'utf8')), {
        version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
      });
      const home = join(temp, 'empty home');
      mkdirSync(home, { recursive: true });
      const run = spawnSync(
        process.execPath,
        [
          join(base, 'hooks/runtime/run.mjs'),
          '--harness',
          prefix || 'codex',
          '--event',
          'session.started',
          '--handler',
          'rules',
        ],
        {
          input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: temp, session_id: 'test' }),
          encoding: 'utf8',
          env: { ...process.env, CODEX_HOME: home },
          timeout: 10000,
        },
      );
      assert.equal(run.status, 0, run.stderr);
      assert.match(JSON.parse(run.stdout).hookSpecificOutput.additionalContext, /Commit messages/);
      if (!prefix) assert.doesNotMatch(readFileSync(join(base, 'README.md'), 'utf8'), /copy its body/);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Night City native packages render palette outputs and include safe standalone setup', async () => {
  const { renderClaudeTheme, renderCodexTheme } = await import('../core/themes.ts');
  const palette = JSON.parse(readFileSync(join(root, 'plugins/default/themes/palette.json'), 'utf8'));
  const temp = mkdtempSync(join(tmpdir(), 'theme-packages-'));
  try {
    buildPackages(root, temp);
    assert.deepEqual(
      JSON.parse(readFileSync(join(temp, 'claude-code/plugins/dead-skills/themes/night-city.json'), 'utf8')),
      renderClaudeTheme(palette),
    );
    assert.equal(
      readFileSync(join(temp, 'plugins/dead-skills/themes/night-city.tmTheme'), 'utf8'),
      renderCodexTheme(palette),
    );
    assert.ok(!existsSync(join(temp, 'plugins/dead-skills/hooks/register.tsx')));
    for (const prefix of ['', 'claude-code']) {
      const setup = readFileSync(join(temp, prefix, 'plugins/dead-skills/skills/setup-night-city/SKILL.md'), 'utf8');
      for (const phrase of ['CODEX_HOME', '/theme', 'differing', 'ask before', 'night-city.tmTheme'])
        assert.ok(setup.includes(phrase), phrase);
    }
    assert.match(readFileSync(join(temp, 'plugins/dead-skills/README.md'), 'utf8'), /setup-night-city/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('invalid palette fails before changing any package output', async () => {
  const { cpSync } = await import('node:fs');
  const source = mkdtempSync(join(tmpdir(), 'theme-source-'));
  const output = mkdtempSync(join(tmpdir(), 'theme-output-'));
  try {
    mkdirSync(join(source, 'catalog'));
    writeFileSync(
      join(source, 'catalog/plugins.json'),
      JSON.stringify([readCatalog(root).find((p) => p.name === 'dead-skills')]),
    );
    cpSync(join(root, 'package.json'), join(source, 'package.json'));
    cpSync(join(root, 'plugins/default'), join(source, 'plugins/default'), { recursive: true });
    const palettePath = join(source, 'plugins/default/themes/palette.json');
    const palette = JSON.parse(readFileSync(palettePath, 'utf8'));
    palette.colors.background = 'broken';
    writeFileSync(palettePath, JSON.stringify(palette));
    writeFileSync(join(output, 'keep'), 'untouched');
    assert.throws(() => buildPackages(source, output), /color/);
    assert.deepEqual(readdirSync(output), ['keep']);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('native freshness check detects missing, changed source theme and extra native output', async () => {
  const { cpSync } = await import('node:fs');
  const checker = '../../scripts/check-codex.mjs';
  const { checkCodex } = (await import(checker)) as { checkCodex: (root: string) => string[] };
  const source = mkdtempSync(join(tmpdir(), 'theme-check-'));
  try {
    mkdirSync(join(source, 'catalog'));
    mkdirSync(join(source, 'plugins/example'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    writeFileSync(
      join(source, 'catalog/plugins.json'),
      JSON.stringify([
        {
          name: 'example',
          description: 'Example',
          source: 'plugins/example',
          resources: [],
          dependencies: [],
          targets: ['claude-code', 'codex'],
          overlays: {},
        },
      ]),
    );
    cpSync(join(root, 'plugins/default/themes'), join(source, 'plugins/default/themes'), { recursive: true });
    buildPackages(source, join(source, 'portable'));
    for (const [target, file, prefix] of [
      ['codex', '.agents/plugins/marketplace.json', './portable/plugins'],
      ['claude-code', '.claude-plugin/marketplace.json', './portable/claude-code/plugins'],
    ] as const) {
      mkdirSync(join(source, file, '..'), { recursive: true });
      writeFileSync(join(source, file), JSON.stringify(nativeMarketplace(source, target, prefix)));
    }
    assert.deepEqual(checkCodex(source), []);
    const theme = join(source, 'plugins/default/themes/night-city.json');
    const original = readFileSync(theme);
    writeFileSync(theme, '{}');
    assert.ok(checkCodex(source).some((problem) => problem.includes('themes/night-city.json')));
    rmSync(theme);
    assert.ok(checkCodex(source).some((problem) => problem.includes('themes/night-city.json')));
    writeFileSync(theme, original);
    writeFileSync(join(source, 'portable/extra'), 'stale');
    assert.ok(checkCodex(source).some((problem) => problem.includes('portable/extra')));
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});

// Native TypeScript supports extensionless imports; every relative dependency must stay packaged.
function assertImportClosure(packageRoot: string, file: string) {
  for (const match of readFileSync(file, 'utf8').matchAll(
    /(?:from\s+|import\s*\(|import\s+|require\s*\()['"]([^'"]+)['"]/g,
  )) {
    if (!match[1].startsWith('.')) continue;
    const dependency = resolve(dirname(file), match[1]);
    const path = relative(packageRoot, dependency);
    assert.ok(
      path !== '..' && !path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(path),
      `${file}: escaping import ${match[1]}`,
    );
    assert.ok(
      ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.d.ts'].some((suffix) =>
        existsSync(dependency + suffix),
      ),
      `${file}: missing import ${match[1]}`,
    );
  }
}
test('import closure checks reject escaping imports even when the dependency exists', () => {
  const temp = mkdtempSync(join(tmpdir(), 'import-closure-'));
  try {
    const plugin = join(temp, 'plugin');
    mkdirSync(plugin);
    writeFileSync(join(temp, 'outside.ts'), 'export const value = 1;');
    writeFileSync(join(plugin, 'runtime.ts'), "import {value} from '../outside.ts';");
    assert.throws(() => assertImportClosure(plugin, join(plugin, 'runtime.ts')), /escaping import/);
    writeFileSync(join(plugin, 'runtime.ts'), "import {value} from './missing';");
    assert.throws(() => assertImportClosure(plugin, join(plugin, 'runtime.ts')), /missing import/);
    writeFileSync(join(plugin, 'value.ts'), 'export const value = 1;');
    writeFileSync(join(plugin, 'runtime.ts'), "import {value} from './value';");
    assert.doesNotThrow(() => assertImportClosure(plugin, join(plugin, 'runtime.ts')));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
