import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalog } from '../src/schema/catalog.ts';
import { parseHooks, parseManifest } from '../src/schema/manifest.ts';

const entry = { name: 'x', source: 'plugins/x', resources: [], dependencies: [], targets: ['codex'] };
test('catalog rejects unknown fields, duplicates, bad targets and escaping paths', () => {
  assert.equal(parseCatalog([entry]).length, 1);
  for (const bad of [
    [{ ...entry, overlays: {} }],
    [entry, entry],
    [{ ...entry, targets: ['vim'] }],
    [{ ...entry, source: '../x' }],
    [{ ...entry, resources: ['/etc'] }],
    [{ ...entry, dependencies: ['nope'] }],
    [{ ...entry, source: { source: 'url', url: 'https://x.git' } }],
  ])
    assert.throws(() => parseCatalog(bad));
});
test('manifest accepts the neutral shape and rejects harness leftovers', () => {
  const m = parseManifest(
    { description: 'd', mcpServers: { a: { url: 'https://x' } }, dependencies: ['y', { name: 'z', marketplace: 'm' }] },
    'x',
  );
  assert.deepEqual(m.dependencies, [{ name: 'y' }, { name: 'z', marketplace: 'm' }]);
  for (const bad of [
    { description: 'd', userConfig: {} },
    { description: 'd', mcpServers: { a: { url: 'https://x', command: 'y' } } },
    { description: 'd', extensions: [{ kind: 'ui-mod', targets: ['claude-code'], entry: 'a', copy: [] }] },
    { description: 'd', extensions: [{ kind: 'ui-mod', entry: '../a', copy: [] }] },
    { description: '' },
  ])
    assert.throws(() => parseManifest(bad, 'x'));
});
test('hooks need exactly one way to run and use neutral events', () => {
  const ok = { event: 'session.started', handler: 'rules' };
  assert.equal(parseHooks({ hooks: [ok] }, 'x').hooks[0].required, false);
  for (const bad of [
    { ...ok, script: 'a.mjs' },
    { event: 'SessionStart', handler: 'rules' },
    { event: 'session.started' },
    { ...ok, tools: ['shell'] },
    { event: 'tool.starting', script: 'a.mjs', tools: ['Bash'] },
    { ...ok, timeoutSeconds: 0 },
  ])
    assert.throws(() => parseHooks({ hooks: [bad] }, 'x'));
});
