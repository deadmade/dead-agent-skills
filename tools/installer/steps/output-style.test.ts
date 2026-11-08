import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyOutputStyle } from './output-style.ts';
import { asset, done } from '../context.ts';

test('the style is written when missing, left alone when current and replaced only on a yes', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'output-style-')), 'output-styles', 'concise.md');
  const never = async () => assert.fail('asked although nothing differs');
  const shipped = asset('concise-output-style.md');

  await applyOutputStyle(file, never);
  assert.equal(readFileSync(file, 'utf8'), shipped);
  assert.match(done.at(-1)!, /^wrote /);

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
