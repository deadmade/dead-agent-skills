import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { portableSelection, selectTarget } from './catalog.ts';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const definitions = () => readCatalog(root);
test('neutral catalog preserves names, default and dependency closure without native-only plugins', () => {
  const all = definitions();
  assert.equal(all.length, 16);
  assert.deepEqual(
    selectTarget(all, 'codex').plugins.map((p) => p.name),
    [
      'dead-skills',
      'flows',
      'graphify',
      'hallmark',
      'rust-skills',
      'csharp-skills',
      'postgres',
      'web-mcp',
      'mcp-github',
      'mcp-azure',
      'atlassian',
    ],
  );
  assert.equal(selectTarget(all, 'claude-code').plugins.length, 15);
  assert.deepEqual(portableSelection(all, []), ['dead-skills']);
  assert.deepEqual(portableSelection(all, ['flows']), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  assert.deepEqual(portableSelection(all, ['flows', 'flows']), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  assert.throws(() => portableSelection(all, ['md-pane']), /Unknown portable/);
  assert.throws(() => portableSelection(all, ['unknown']), /Unknown portable/);
});
test('dependency validation rejects unknown references, cycles and duplicate identities', () => {
  const base = definitions()[0];
  for (const entries of [
    [{ ...base, dependencies: ['unknown'] }],
    [{ ...base, dependencies: [base.name] }],
    [base, { ...base }],
    [
      { ...base, dependencies: ['other'] },
      { ...base, name: 'other', dependencies: [base.name] },
    ],
  ])
    assert.throws(() => selectTarget(entries, 'codex'), /dependency|cycle|Duplicate/i);
});
