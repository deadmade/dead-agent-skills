import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { PKG } from '../context.ts';
import { readFileSync } from 'node:fs';
import { installedCodex, codexPlan, mcpTableLine, recoverableContext7 } from './codex.ts';

// Captured from Codex CLI 0.167.0's `mcp list --json` on 2026-11-06.
const URL7 = 'https://mcp.context7.com/mcp';
const context7 = JSON.parse(readFileSync(new URL('./fixtures/codex-mcp-list.json', import.meta.url), 'utf8'))[0];
test('recover default Context7 without accepting conflicting or customized connections', () => {
  assert.equal(recoverableContext7(context7, URL7), true);
  for (const change of [
    { name: 'another-server' },
    { enabled: false },
    { startup_timeout_sec: 30 },
    { transport: { ...context7.transport, url: 'https://example.com/mcp' } },
    { transport: { ...context7.transport, bearer_token_env_var: 'CONTEXT7_KEY' } },
    { transport: { ...context7.transport, http_headers: { Authorization: 'custom' } } },
    { transport: { ...context7.transport, type: 'stdio' } },
  ])
    assert.equal(recoverableContext7({ ...context7, ...change }, URL7), false);
  assert.equal(recoverableContext7({ name: context7.name }, URL7), false);
  assert.equal(recoverableContext7(null, URL7), false);
});
test('native discovery preserves foreign plugins and rejects unknown discovery', () => {
  assert.deepEqual(installedCodex({ installed: [{ id: 'foreign@other' }, { id: 'dead-skills@dead-agent-skills' }] }), [
    'dead-skills',
  ]);
  assert.throws(() => installedCodex({}), /Unrecognized/);
  assert.deepEqual(codexPlan(readCatalog(PKG), [], ['foreign'], '1').remove, []);
});
test('a rerun removes graphify, which left the catalog, and reports it as retired', () => {
  const plan = codexPlan(readCatalog(PKG), ['flows'], ['dead-skills', 'flows', 'graphify', 'web-mcp'], '1');
  assert.ok(plan.remove.includes('graphify'));
  assert.deepEqual(plan.retired, ['graphify']);
  assert.deepEqual(codexPlan(readCatalog(PKG), [], ['foreign'], '1').retired, []);
});
test('a table line goes under its native MCP table and keeps a value the user set', () => {
  const raw = '[mcp_servers.dead-agent-skills-serena]\ncommand = "serena"\n[mcp_servers.foreign]\nurl = "x"\n';
  const next = mcpTableLine(raw, 'dead-agent-skills-serena', 'startup_timeout_sec = 15');
  assert.equal(
    next,
    '[mcp_servers.dead-agent-skills-serena]\nstartup_timeout_sec = 15\ncommand = "serena"\n[mcp_servers.foreign]\nurl = "x"\n',
  );
  assert.equal(mcpTableLine(next, 'dead-agent-skills-serena', 'startup_timeout_sec = 15'), next);
  const own = raw.replace('command', 'startup_timeout_sec = 60\ncommand');
  assert.equal(mcpTableLine(own, 'dead-agent-skills-serena', 'startup_timeout_sec = 15'), own);
  assert.throws(() => mcpTableLine(raw, 'missing', 'startup_timeout_sec = 15'));
});
