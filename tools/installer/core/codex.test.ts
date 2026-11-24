import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCatalog } from '../system/catalog.ts';
import { PKG } from '../context.ts';
import { readFileSync } from 'node:fs';
import { installedCodex, codexPlan, mcpUrlServer, recoverableContext7 } from './codex.ts';

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

const NAME = 'dead-agent-skills-mcp-github';
const TABLE = `[mcp_servers.${NAME}]\nurl = "https://api.example/mcp"\nbearer_token_env_var = "TOKEN"\n`;
test('mcpUrlServer writes the url table, with its bearer variable, into an empty or a foreign config', () => {
  assert.equal(mcpUrlServer('', NAME, 'https://api.example/mcp', 'TOKEN'), TABLE);
  assert.equal(mcpUrlServer('model = "o3"', NAME, 'https://api.example/mcp', 'TOKEN'), `model = "o3"\n\n${TABLE}`);
  assert.throws(() => mcpUrlServer('', 'bad.name', 'https://api.example/mcp'), /Unsafe/);
});
test('mcpUrlServer leaves a config that already holds the same table byte for byte', () => {
  const raw = `model = "o3"\r\n\r\n${TABLE.replaceAll('\n', '\r\n')}`;
  assert.equal(mcpUrlServer(raw, NAME, 'https://api.example/mcp', 'TOKEN'), raw);
  const once = mcpUrlServer('', NAME, 'https://api.example/mcp');
  assert.equal(mcpUrlServer(once, NAME, 'https://api.example/mcp'), once);
});
test('mcpUrlServer replaces only its own table and subtables, keeping every foreign entry', () => {
  const before = '[mcp_servers.foreign]\nurl = "https://foreign/mcp"\n\n';
  const after = '\n[mcp_servers.other]\ncommand = "x"\n';
  const old = `[mcp_servers.${NAME}]\nurl = "https://old/mcp"\n[mcp_servers.${NAME}.http_headers]\nX = "1"\n`;
  assert.equal(
    mcpUrlServer(before + old + after, NAME, 'https://api.example/mcp', 'TOKEN'),
    `${before}${TABLE}${after}`,
  );
});
