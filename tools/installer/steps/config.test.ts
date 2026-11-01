import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectConfig } from './config.ts';
import { failures } from '../context.ts';
import { type Marketplace } from '../core/plugins.ts';
const id = 'mcp-azure@dead-claude-skills';
const manifest: Marketplace = {
  plugins: [{ name: 'mcp-azure', description: '', source: './.claude-plugin/mcp-azure' }],
};

test('self configuration skips complete settings, hands off unsupported installs and collects secrets separately', async () => {
  for (const scenario of ['complete', 'old', 'old-installed', 'new', 'missing', 'missing-installed', 'bad-json']) {
    const calls: string[][] = [];
    const isInstalled = ['complete', 'old-installed', 'missing-installed', 'bad-json'].includes(scenario);
    const services = {
      claude: async (_input: string | undefined, ...args: string[]) => {
        calls.push(args);
        return {
          ok: true,
          err: '',
          out:
            args[0] === '--version'
              ? scenario.startsWith('old')
                ? '2.1.284'
                : '2.1.302'
              : scenario === 'bad-json'
                ? '{'
                : JSON.stringify({ configured: scenario === 'complete' ? ['ado_org_url', 'ado_pat'] : [] }),
        };
      },
      line: async () => 'https://tfs.example/tfs/Coll',
      secret: async () => (scenario.startsWith('missing') ? '' : 'test-pat'),
      log: () => {},
    };
    const before = failures.length;
    const result = await collectConfig([id], isInstalled ? [id] : [], manifest, services);
    if (scenario === 'old' || scenario === 'missing') {
      assert.deepEqual(result.selfHandoff, [id]);
      assert.deepEqual(result.selected, []);
    } else {
      assert.deepEqual(result.selected, [id]);
      assert.deepEqual(result.selfHandoff, []);
    }
    if (['new', 'bad-json'].includes(scenario))
      assert.deepEqual(result.selfValues[id], { ado_org_url: 'https://tfs.example/tfs/Coll', ado_pat: 'test-pat' });
    if (scenario === 'missing-installed') {
      assert.match(failures.at(-1)!, /ado_pat not set/);
      assert.ok(!failures.at(-1)!.includes('https://'));
    }
    assert.ok(!JSON.stringify(calls).includes('test-pat'));
    failures.splice(before);
  }
});
