import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rulesMigration } from './rules-migration.ts';
const block = '<!-- dead-agent-skills:start -->\npolicy\n<!-- dead-agent-skills:end -->';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const expected = { packageVersion: '0.6.0', rulesHash: hash('policy'), adapterHash: hash('adapter') };
const receipt = { ...expected, managedBlockPresent: true, source: 'agents', cleanupEligible: true };
test('receipt and explicit verification gate marker-only removal preserving unrelated current bytes', () => {
  const raw = `before\r\n${block}\nnew foreign edit\n`;
  const args = { raw, receipt, expected, userVerified: false, confirmedBlockHash: hash(block) };
  assert.deepEqual(rulesMigration(args), { action: 'offer-removal', next: raw });
  assert.deepEqual(rulesMigration({ ...args, userVerified: true }), {
    action: 'remove',
    next: 'before\r\n\nnew foreign edit\n',
  });
  for (const changed of [
    null,
    { ...receipt, rulesHash: 'stale' },
    { ...receipt, adapterHash: 'changed' },
    { ...receipt, packageVersion: 'old' },
    { ...receipt, cleanupEligible: false },
    { ...receipt, managedBlockPresent: false },
  ])
    assert.deepEqual(rulesMigration({ ...args, receipt: changed, userVerified: true }), { action: 'keep', next: raw });
  assert.equal(rulesMigration({ ...args, userVerified: true, confirmedBlockHash: 'changed' }).action, 'keep');
});
test('missing trust, user refusal and ambiguous or changed owned blocks retain working bytes', () => {
  for (const raw of [
    '',
    block + block,
    block.replace('policy', 'edited'),
    '<!-- dead-agent-skills:start -->',
    '<!-- dead-agent-skills:end -->',
  ]) {
    assert.deepEqual(rulesMigration({ raw, receipt, expected, userVerified: true, confirmedBlockHash: hash(block) }), {
      action: 'keep',
      next: raw,
    });
  }
});
