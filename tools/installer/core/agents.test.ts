import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectedAgents } from './agents.ts';
import { portableSelection } from './catalog.ts';
import { readCatalog } from '../system/catalog.ts';
import { resolve } from 'node:path';
const definitions = readCatalog(resolve(import.meta.dirname, '../../..'));
import { codexPlan, installedCodex, managedRules, mcpEnvironment } from './codex.ts';

test('host selection is explicit, validated and deduplicated', () => {
  assert.equal(selectedAgents([]), undefined);
  assert.deepEqual(selectedAgents(['--agents=codex,claude-code,codex']), ['codex', 'claude-code']);
  for (const flags of [['--agents='], ['--agents=other'], ['--agents=codex', '--agents=codex']])
    assert.throws(() => selectedAgents(flags));
});
test('portable flow dependencies exclude Claude UI and maintenance plugins', () => {
  assert.deepEqual(portableSelection(definitions, ['flows']), ['dead-skills', 'flows', 'graphify', 'web-mcp']);
  assert.throws(() => portableSelection(definitions, ['md-pane']));
});
test('Codex discovery rejects unknown formats and excludes other marketplaces', () => {
  assert.deepEqual(
    installedCodex({
      installed: [
        { pluginId: 'flows@dead-agent-skills' },
        { id: 'flows@foreign' },
        { name: 'postgres', marketplaceName: 'dead-agent-skills' },
        {},
      ],
    }),
    ['flows', 'postgres'],
  );
  for (const value of [null, [], {}, { installed: {} }]) assert.throws(() => installedCodex(value));
});
test('Codex plans preserve existing unrelated installs and update release versions', () => {
  const previous = { version: '1.0.0', selected: ['postgres'], mcp: [] };
  const plan = codexPlan(definitions, ['rust-skills'], ['dead-skills', 'postgres', 'foreign'], '1.0.0', previous);
  assert.deepEqual(plan.install, ['rust-skills']);
  assert.deepEqual(plan.remove, ['postgres']);
  assert.deepEqual(codexPlan(definitions, [], ['dead-skills'], '2.0.0', previous).install, ['dead-skills']);
});
test('bounded global rules preserve user instructions and are idempotent', () => {
  const once = managedRules('# Personal\nKeep this.', 'My rules');
  assert.equal(managedRules(once, 'My rules'), once);
  const updated = managedRules(once, 'New rules');
  assert.ok(updated.startsWith('# Personal\nKeep this.'));
  assert.ok(!updated.includes('My rules'));
  assert.ok(managedRules('', 'rules').includes('rules'));
  for (const raw of [
    '<!-- dead-agent-skills:start -->',
    '<!-- dead-agent-skills:end -->',
    '<!-- dead-agent-skills:end --><!-- dead-agent-skills:start -->',
    once + once,
  ])
    assert.throws(() => managedRules(raw, 'rules'));
});

test('MCP environment forwarding edits only the native server table', () => {
  const raw =
    '# keep\nmodel = "chosen"\n[mcp_servers.dead-agent-skills-mcp-azure]\ncommand = "node"\n[mcp_servers.foreign]\nurl = "https://example.com"\n';
  const next = mcpEnvironment(raw, 'dead-agent-skills-mcp-azure', ['TOKEN']);
  assert.ok(next.includes('env_vars = ["TOKEN"]'));
  assert.ok(next.startsWith('# keep\nmodel = "chosen"'));
  assert.ok(next.endsWith('[mcp_servers.foreign]\nurl = "https://example.com"\n'));
  assert.equal(mcpEnvironment(next, 'dead-agent-skills-mcp-azure', ['TOKEN']), next);
  assert.throws(() => mcpEnvironment(next, 'dead-agent-skills-mcp-azure', ['OTHER']));
  assert.throws(() => mcpEnvironment(raw, 'missing', []));
  assert.throws(() => mcpEnvironment(raw, 'bad.name', []));
});
