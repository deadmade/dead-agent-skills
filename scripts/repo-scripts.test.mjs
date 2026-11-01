import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const COMPILER = 'tools/harness-compiler/src/cli.ts';

test('package scripts build and check through the harness compiler, and prepack checks freshness', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.scripts['build:harnesses'], `node ${COMPILER} build`);
  assert.equal(pkg.scripts['check:harnesses'], `node ${COMPILER} check`);
  assert.match(pkg.scripts.prepack, /harness-compiler\/src\/cli\.ts check/);
  assert.ok(pkg.workspaces.includes('tools/harness-compiler'));
  assert.ok(pkg.files.includes('plugins/catalog.json'));
  assert.ok(pkg.files.includes('.claude-plugin/') && pkg.files.includes('.agents/plugins/'));
  assert.deepEqual(
    pkg.files.filter((f) => f.startsWith('plugins/')),
    ['plugins/catalog.json'],
    'only the catalog of authored plugins is published',
  );
});

test('release rebuilds both targets after version bumps and before checks', () => {
  const release = source('scripts/release.mjs');
  assert.ok(release.indexOf('text.replace(version') < release.indexOf(COMPILER));
  assert.match(release, /harness-compiler\/src\/cli\.ts', 'build'\]\) \|\| !run\('npm', \['test'\]/);
});

test('flow dependency changes regenerate native packages after source writes', () => {
  const flows = source('scripts/flows-uses.mjs');
  assert.ok(flows.indexOf('writeFileSync(readmePath, readme)') < flows.lastIndexOf('harness-compiler/src/cli.ts'));
  assert.match(flows, /execFileSync\(process.execPath/);
});

test('CI checks freshness, runs the tests on Windows and packs the generated distributions', () => {
  const workflow = source('.github/workflows/test.yml');
  assert.match(workflow, /check:harnesses/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /\.claude-plugin\/dead-skills\/\.claude-plugin\/plugin\.json/);
  assert.match(workflow, /\.agents\/plugins\/flows\/\.codex-plugin\/plugin\.json/);
});
