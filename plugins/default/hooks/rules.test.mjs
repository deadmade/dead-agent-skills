import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupRules } from './rules.mjs';
import { effectiveGlobalInstructions } from '../../../tools/harness-compiler/src/runtime/codex.mjs';
const markers = { start: '<!-- dead-agent-skills:start -->', end: '<!-- dead-agent-skills:end -->' };
const block = `${markers.start}\npolicy\n${markers.end}`;
test('fresh startup supplies packaged context; active owned block suppresses duplication', () => {
  assert.deepEqual(startupRules({ rules: 'policy', globalInstructions: 'foreign', markers }), {
    context: 'policy',
    managedBlockPresent: false,
  });
  assert.deepEqual(startupRules({ rules: 'policy', globalInstructions: block, markers }), {
    context: '',
    managedBlockPresent: true,
  });
});
test('edited, unmatched and duplicate markers inject rules and diagnose unsafe cleanup', () => {
  for (const text of [markers.start, markers.end, block + block, markers.end + markers.start]) {
    assert.throws(() => startupRules({ rules: 'policy', globalInstructions: text, markers }), /managed|Malformed/);
  }
});
test('edited owned block cannot suppress packaged context', () => {
  assert.deepEqual(startupRules({ rules: 'policy', globalInstructions: block.replace('policy', 'edited'), markers }), {
    context: 'policy',
    managedBlockPresent: false,
  });
});
test('native first nonempty precedence prevents shadowed AGENTS suppression', () => {
  assert.deepEqual(effectiveGlobalInstructions({ override: 'override', agents: block }), {
    source: 'override',
    text: 'override',
  });
  assert.deepEqual(effectiveGlobalInstructions({ override: ' \n', agents: block }), { source: 'agents', text: block });
  assert.deepEqual(effectiveGlobalInstructions({}), { source: 'none', text: '' });
});
test('shared authored rules name both host instruction files without maintenance tool requirements', async () => {
  const { readFileSync } = await import('node:fs');
  const rules = readFileSync(new URL('../rules.md', import.meta.url), 'utf8');
  assert.match(rules, /AGENTS.md/);
  assert.match(rules, /CLAUDE.md/);
  assert.doesNotMatch(rules, /revise-claude-md/);
});
