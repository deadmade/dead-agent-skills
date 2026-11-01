import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installCodexTheme, readRulesReceipt } from './harness-setup.ts';
test('theme installs atomically, preserves conflicts and symlinked directories; receipt is untrusted data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'theme space '));
  try {
    const source = join(dir, 'source');
    writeFileSync(source, 'theme');
    const home = join(dir, 'home');
    mkdirSync(home);
    assert.deepEqual(installCodexTheme(home, source), { installed: true, conflict: false });
    assert.deepEqual(installCodexTheme(home, source), { installed: false, conflict: false });
    writeFileSync(join(home, 'themes/night-city.tmTheme'), 'foreign');
    assert.equal(installCodexTheme(home, source).conflict, true);
    assert.equal(readFileSync(join(home, 'themes/night-city.tmTheme'), 'utf8'), 'foreign');
    rmSync(join(home, 'themes/night-city.tmTheme'));
    symlinkSync(source, join(home, 'themes/night-city.tmTheme'));
    assert.equal(installCodexTheme(home, source).conflict, true);
    rmSync(join(home, 'themes'), { recursive: true });
    symlinkSync(dir, join(home, 'themes'), 'dir');
    assert.equal(installCodexTheme(home, source).conflict, true);
    assert.equal(readRulesReceipt(home), undefined);
    mkdirSync(join(home, 'dead-agent-skills'));
    writeFileSync(join(home, 'dead-agent-skills/rules-hook.json'), 'invalid');
    assert.equal(readRulesReceipt(home), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const kind of ['differing file', 'identical file', 'symlink'])
  test(`theme publication preserves a concurrently created ${kind}`, async (t) => {
    const fs = (await import('node:fs')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const directory = mkdtempSync(join(tmpdir(), 'theme-publication-'));
    const source = join(directory, 'packaged');
    const home = join(directory, 'home');
    const destination = join(home, 'themes/night-city.tmTheme');
    writeFileSync(source, 'packaged theme');
    mkdirSync(home);
    const rename = fs.renameSync;
    const link = fs.linkSync;
    const intervene = () =>
      kind === 'symlink'
        ? symlinkSync(source, destination)
        : writeFileSync(destination, kind === 'identical file' ? 'packaged theme' : 'foreign concurrent theme');
    t.mock.method(fs, 'renameSync', (...args: Parameters<typeof rename>) => {
      intervene();
      return rename(...args);
    });
    t.mock.method(fs, 'linkSync', (...args: Parameters<typeof link>) => {
      intervene();
      return link(...args);
    });
    syncBuiltinESMExports();
    try {
      assert.deepEqual(installCodexTheme(home, source), { installed: false, conflict: kind !== 'identical file' });
      assert.equal(
        readFileSync(destination, 'utf8'),
        kind === 'differing file' ? 'foreign concurrent theme' : 'packaged theme',
      );
      if (kind === 'symlink') assert.equal(fs.lstatSync(destination).isSymbolicLink(), true);
      assert.deepEqual(fs.readdirSync(join(home, 'themes')), ['night-city.tmTheme']);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
      rmSync(directory, { recursive: true, force: true });
    }
  });
