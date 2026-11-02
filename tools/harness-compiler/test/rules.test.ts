import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { RULES, applyEdit, applyRules } from '../src/transforms/rules.ts';
import { transformMarkdown } from '../src/transforms/text.ts';

test('line, bullet, paragraph and section edits remove only what they name', () => {
  assert.equal(applyEdit('a\nX one\nb', { kind: 'lines', match: '^X' }), 'a\nb');
  assert.equal(
    applyEdit('- keep\n- X it\n  more\n  still\n- keep2', { kind: 'bullet', match: '^- X' }),
    '- keep\n- keep2',
  );
  assert.equal(applyEdit('p1\n\nX p2\nline\n\np3', { kind: 'paragraph', match: '^X' }), 'p1\n\np3');
  assert.equal(
    applyEdit('# T\n## Drop\ntext\n### sub\nmore\n## Keep\nok', { kind: 'section', match: '^## Drop$' }),
    '# T\n## Keep\nok',
  );
});

const root = join(import.meta.dirname, '../../../plugins');
for (const rule of RULES) {
  test(`rule ${rule.file} (${rule.why}) drops its passage only for ${rule.drop}`, () => {
    const text = readFileSync(
      join(root, rule.file.startsWith('packs/') ? 'flows/' + rule.file : lookup(rule.file)),
      'utf8',
    );
    const dropped = applyRules(rule.drop, rule.file, text);
    assert.ok(dropped.length < text.length, 'the rule matches something in the real file');
    const other = rule.drop === 'codex' ? 'claude-code' : 'codex';
    const re = new RegExp(rule.edit.match, 'm');
    assert.ok(!re.test(dropped), 'the passage is gone');
    assert.ok(re.test(applyRules(other, rule.file, text)), 'the other distribution keeps it');
  });
}
function lookup(file: string) {
  if (file.startsWith('skills/hallmark')) return 'opt-in/hallmark/' + file;
  if (file.startsWith('library/')) return 'opt-in/implementation/csharp-skills/' + file;
  throw new Error(file);
}

test("the neutral root token becomes each agent's own root", () => {
  const file = '/o/agents/a.md';
  assert.equal(transformMarkdown('claude-code', 'x ${PLUGIN_ROOT}/p', file, '/o'), 'x ${CLAUDE_PLUGIN_ROOT}/p');
  assert.equal(transformMarkdown('codex', 'x ${PLUGIN_ROOT}/p', file, '/o'), 'x ../p');
});
