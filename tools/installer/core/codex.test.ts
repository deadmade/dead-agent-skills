import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { PKG } from '../context.ts';
import { installedCodex, codexPlan } from './codex.ts';
test('native discovery preserves foreign plugins and rejects unknown discovery', () => {
  assert.deepEqual(installedCodex({ installed: [{ id: 'foreign@other' }, { id: 'dead-skills@dead-agent-skills' }] }), [
    'dead-skills',
  ]);
  assert.throws(() => installedCodex({}), /Unrecognized/);
  assert.deepEqual(codexPlan(readCatalog(PKG), [], ['foreign'], '1').remove, []);
});
