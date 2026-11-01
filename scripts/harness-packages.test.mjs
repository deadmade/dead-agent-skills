import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { checkHarnesses } from './check-harnesses.mjs';

const root = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
test('canonical freshness interface and compatibility alias agree', async () => {
  const { checkCodex } = await import('./check-codex.mjs');
  assert.equal(checkCodex, checkHarnesses);
});
test('release rebuilds both targets after version bumps and before checks', () => {
  const release = source('scripts/release.mjs');
  assert.ok(release.indexOf('text.replace(version') < release.indexOf("['scripts/build-harnesses.mjs']"));
  assert.match(release, /build-harnesses\.mjs'\]\) \|\| !run\('npm', \['test'\]/);
  assert.ok(release.includes('pluginDirs()'));
});
test('flow dependency changes regenerate native packages after source writes', () => {
  const flows = source('scripts/flows-uses.mjs');
  assert.ok(flows.indexOf('writeFileSync(readmePath, readme)') < flows.lastIndexOf('scripts/build-harnesses.mjs'));
  assert.match(flows, /execFileSync\(process.execPath/);
});
test('shared runtime cases and canonical freshness run in CI and prepack', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.match(pkg.scripts.test, /hooks\/\*\.test\.mjs/);
  assert.match(pkg.scripts.prepack, /check-harnesses/);
  assert.equal(pkg.scripts['check:harnesses'], 'node scripts/check-harnesses.mjs');
  assert.match(source('.github/workflows/test.yml'), /windows-latest/);
  assert.ok(pkg.files.includes('catalog/plugins.json'));
});

test('source-only CRLF checkout builds identical isolated targets and resolves every native source', async () => {
  const { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { buildPackages, nativeMarketplace } = await import('../tools/installer/system/packages.ts');
  const temp = mkdtempSync(join(tmpdir(), 'harness-source-'));
  const put = (path, value) => {
    mkdirSync(join(temp, path, '..'), { recursive: true });
    writeFileSync(join(temp, path), value);
  };
  const inventory = (path) =>
    readdirSync(path, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => [join(e.parentPath, e.name).slice(path.length + 1), readFileSync(join(e.parentPath, e.name), 'hex')])
      .sort();
  try {
    put('package.json', '{"version":"1.0.0"}');
    put(
      'catalog/plugins.json',
      JSON.stringify([
        {
          name: 'example',
          description: 'Example',
          source: 'plugins/example',
          resources: ['skills'],
          dependencies: [],
          targets: ['claude-code', 'codex'],
          overlays: { 'claude-code': ['native'] },
        },
      ]),
    );
    put('plugins/example/skills/demo/SKILL.md', '---\r\nname: demo\r\n---\r\nHello\r\n');
    put('plugins/example/native/extension.json', '{}\r\n');
    cpSync(new URL('../plugins/default/themes/', import.meta.url), join(temp, 'plugins/default/themes'), {
      recursive: true,
    });
    put('unrelated/user.txt', 'keep');
    buildPackages(temp, join(temp, 'portable'));
    buildPackages(temp, join(temp, 'again'));
    assert.deepEqual(inventory(join(temp, 'portable')), inventory(join(temp, 'again')));
    assert.equal(
      readFileSync(join(temp, 'portable/plugins/example/skills/demo/SKILL.md'), 'utf8'),
      '---\nname: demo\n---\nHello\n',
    );
    assert.ok(!existsSync(join(temp, 'portable/plugins/example/native')));
    assert.ok(existsSync(join(temp, 'portable/claude-code/plugins/example/native/extension.json')));
    for (const [target, file, prefix] of [
      ['codex', '.agents/plugins/marketplace.json', './portable/plugins'],
      ['claude-code', '.claude-plugin/marketplace.json', './portable/claude-code/plugins'],
    ]) {
      const catalog = nativeMarketplace(temp, target, prefix);
      put(file, JSON.stringify(catalog));
      for (const entry of catalog.plugins)
        assert.ok(existsSync(join(temp, typeof entry.source === 'string' ? entry.source : entry.source.path)));
    }
    put(
      'plugins/default/themes/night-city.json',
      readFileSync(join(temp, 'plugins/default/themes/night-city.json'), 'utf8').replaceAll('\n', '\r\n'),
    );
    assert.deepEqual(checkHarnesses(temp), []);
    assert.equal(readFileSync(join(temp, 'unrelated/user.txt'), 'utf8'), 'keep');
    put('portable/extra', 'stale');
    assert.match(checkHarnesses(temp).join('\n'), /portable\/extra/);
    assert.equal(readFileSync(join(temp, 'portable/extra'), 'utf8'), 'stale');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('npm tarball ships neutral catalog and loads selection without authored resources', async () => {
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { which, startSync } = await import('../tools/installer/system/proc.ts');
  const { readCatalog } = await import('../tools/installer/system/catalog.ts');
  const { selectTarget } = await import('../tools/installer/core/catalog.ts');
  const temp = mkdtempSync(join(tmpdir(), 'harness-tarball-'));
  try {
    const result = startSync(which('npm'), ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const packed = JSON.parse(result.stdout)[0];
    assert.ok(packed.files.some((f) => f.path === 'catalog/plugins.json'));
    const unpack = startSync(which('tar'), ['-xzf', join(temp, packed.filename), '-C', temp], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(unpack.status, 0, unpack.stderr);
    assert.ok(!existsSync(join(temp, 'package/plugins/default/rules.md')));
    for (const target of ['codex', 'claude-code'])
      assert.ok(selectTarget(readCatalog(join(temp, 'package')), target).plugins.length > 0);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('native runtime fixtures retain their recorded provenance', () => {
  const provenance = source('plugins/default/hooks/fixtures/README.md');
  assert.match(provenance, /0\.166\.0/);
  assert.match(provenance, /2\.1\.314/);
  assert.match(provenance, /captur|observ|authoritative/i);
});

test('authoring docs describe combined generation and native acceptance limits', () => {
  for (const path of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/vendor-a-pack.md'])
    assert.match(source(path), /build:harnesses/);
  assert.match(source('README.md'), /hook trust/i);
  assert.match(source('README.md'), /0\.166\.0/);
});

test('build CLI reports optional omissions with target, plugin and event before success', async () => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const temp = mkdtempSync(join(tmpdir(), 'build-cli-'));
  const put = (path, value) => {
    mkdirSync(join(temp, path, '..'), { recursive: true });
    writeFileSync(join(temp, path), value);
  };
  try {
    put(
      'scripts/build-harnesses.mjs',
      source('scripts/build-harnesses.mjs').replaceAll(
        "'../tools/installer/",
        "'" + new URL('../tools/installer/', import.meta.url).href,
      ),
    );
    put('package.json', '{"version":"1.0.0"}');
    put(
      'catalog/plugins.json',
      JSON.stringify([
        {
          name: 'example',
          description: 'Example',
          source: 'plugins/example',
          resources: [],
          dependencies: [],
          targets: ['claude-code', 'codex'],
          overlays: {},
          hooks: 'hooks/shared.json',
        },
      ]),
    );
    put(
      'plugins/example/hooks/shared.json',
      JSON.stringify([
        {
          event: 'notification.received',
          handler: 'notifications',
          required: false,
          background: true,
          timeoutSeconds: 8,
        },
      ]),
    );
    cpSync(new URL('../plugins/default/themes/', import.meta.url), join(temp, 'plugins/default/themes'), {
      recursive: true,
    });
    const run = spawnSync(process.execPath, [join(temp, 'scripts/build-harnesses.mjs')], {
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /codex.*example.*notification\.received/);
    assert.ok(run.stdout.indexOf('notification.received') < run.stdout.indexOf('Updated both'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
