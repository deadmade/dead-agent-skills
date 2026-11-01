import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCatalog } from './catalog.ts';
import { startSync } from './proc.ts';
const root = resolve(import.meta.dirname, '../..');
test('catalog loader needs only shipped JSON and rejects malformed definitions', () => {
  const temp = mkdtempSync(join(tmpdir(), 'catalog-'));
  try {
    mkdirSync(join(temp, 'catalog'));
    const file = join(temp, 'catalog/plugins.json');
    cpSync(join(root, 'catalog/plugins.json'), file);
    assert.deepEqual(readCatalog(temp), readCatalog(root));
    const base = readCatalog(root)[0];
    for (const value of [
      null,
      {},
      [null],
      [{ ...base, name: '' }],
      [{ ...base, targets: ['other'] }],
      [{ ...base, resources: ['../escape'] }],
      [{ ...base, dependencies: ['missing'] }],
      [{ ...base, source: '/absolute' }],
      [base, base],
    ]) {
      writeFileSync(file, JSON.stringify(value));
      assert.throws(() => readCatalog(temp));
    }
    writeFileSync(file, '{');
    assert.throws(() => readCatalog(temp));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
test('packed compiled installer loads catalog and selects without authored plugin folders', () => {
  const temp = mkdtempSync(join(tmpdir(), 'packed installer '));
  try {
    const tsc = join(root, 'node_modules/typescript/bin/tsc');
    const build = startSync(process.execPath, [tsc, '--rootDir', '.', '--outDir', temp], { cwd: root });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    cpSync(join(root, 'catalog'), join(temp, 'catalog'), { recursive: true });
    writeFileSync(join(temp, 'package.json'), JSON.stringify({ type: 'module' }));
    assert.equal(existsSync(join(temp, 'plugins')), false);
    const load = pathToFileURL(join(temp, 'installer/system/catalog.js')).href;
    const select = pathToFileURL(join(temp, 'installer/core/catalog.js')).href;
    const run = startSync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { readCatalog } from ${JSON.stringify(load)}; import { portableSelection } from ${JSON.stringify(select)}; console.log(JSON.stringify(portableSelection(readCatalog(${JSON.stringify(temp)}), ['flows'])));`,
    ]);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.trim(), JSON.stringify(run));
    assert.deepEqual(JSON.parse(run.stdout), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
    const files = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files;
    assert.ok(files.includes('catalog/plugins.json'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
