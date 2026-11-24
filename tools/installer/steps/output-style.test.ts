// What install.real.test.ts can't reach: a style file that is already there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyOutputStyle } from './output-style.ts';
import { asset, done } from '../context.ts';

test('a current style is left alone, a differing one replaced only on a yes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'output-style-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'output-styles', 'concise.md');
  const shipped = asset('concise-output-style.md');
  mkdirSync(join(dir, 'output-styles'));
  writeFileSync(file, shipped);
  // fake: the user's answer; a fresh install never finds a style file to ask about.
  const never = async () => assert.fail('asked although nothing differs');

  const count = done.length;
  await applyOutputStyle(file, never);
  assert.equal(done.length, count);

  writeFileSync(file, 'mine');
  await applyOutputStyle(file, async () => false);
  assert.equal(readFileSync(file, 'utf8'), 'mine');
  assert.match(done.at(-1)!, /^kept your /);

  await applyOutputStyle(file, async () => true);
  assert.equal(readFileSync(file, 'utf8'), shipped);
  assert.match(done.at(-1)!, /^replaced /);
});
