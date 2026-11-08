import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { PKG } from '../context.ts';
import { readFileSync } from 'node:fs';
import { installedCodex, codexPlan, recoverableContext7 } from './codex.ts';

// Captured from Codex CLI 0.167.0's `mcp list --json` on 2026-11-06.
const context7 = JSON.parse(readFileSync(new URL('./fixtures/codex-mcp-list.json', import.meta.url), 'utf8'))[0];
test('recover default Context7 without accepting conflicting or customized connections', () => {
  assert.equal(recoverableContext7(context7), true);
  for (const change of [
    { name: 'another-server' },
    { enabled: false },
    { startup_timeout_sec: 30 },
    { transport: { ...context7.transport, url: 'https://example.com/mcp' } },
    { transport: { ...context7.transport, bearer_token_env_var: 'CONTEXT7_KEY' } },
    { transport: { ...context7.transport, http_headers: { Authorization: 'custom' } } },
    { transport: { ...context7.transport, type: 'stdio' } },
  ])
    assert.equal(recoverableContext7({ ...context7, ...change }), false);
  assert.equal(recoverableContext7({ name: context7.name }), false);
  assert.equal(recoverableContext7(null), false);
});
test('native discovery preserves foreign plugins and rejects unknown discovery', () => {
  assert.deepEqual(installedCodex({ installed: [{ id: 'foreign@other' }, { id: 'dead-skills@dead-agent-skills' }] }), [
    'dead-skills',
  ]);
  assert.throws(() => installedCodex({}), /Unrecognized/);
  assert.deepEqual(codexPlan(readCatalog(PKG), [], ['foreign'], '1').remove, []);
});
