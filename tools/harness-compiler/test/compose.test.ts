import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { ComposeError, composeFlows, type HostTokens } from '../src/flows/compose.ts';

const put = (root: string, path: string, value: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
};
const plugin = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'compose-'));
  for (const [path, value] of Object.entries(files)) put(root, path, value);
  return root;
};
const TOKENS: HostTokens = { 'ask-user': { text: 'ask the user' }, adapter: { text: 'Host adapter.' } };
const compose = (files: Record<string, string>, tokens = TOKENS) => composeFlows(plugin(files), tokens);
const refuses = (files: Record<string, string>, file: string, line: number, what: RegExp) =>
  assert.throws(
    () => compose(files),
    (e) => e instanceof ComposeError && e.file === file && e.line === line && what.test(e.message),
  );

const FLOW = {
  'skills/f/SKILL.md': [
    '---',
    'name: f',
    'uses: superpowers:writing-plans',
    '---',
    '# f',
    '',
    '[step: phases]',
    '',
    '## Rules for the whole run',
    '',
    '[step: host]',
    '',
    '## Phase 1: Read',
    '<!-- runs: a · output: b -->',
    '',
    'Read it, then {{ask-user}}.',
    '',
    '## Phase 2: Grill',
    '',
    '<!-- runs: c · output: d -->',
    '',
    '[step: gate]',
    '',
    '## Phase 3: Plan',
    '',
    '<!-- runs: e · output: f -->',
    '',
    '[step: gate]',
    '',
  ].join('\n'),
  'steps/gate.md': '---\nrepeat: true\n---\nAsk at the gate.\n',
};

test('composes a step in place', () => {
  const { files } = compose({
    'skills/f/SKILL.md': 'Before\n[step: a]\nAfter\n',
    'steps/a.md': '---\nuses: p:x\n---\nStep one.\n\n### a\n\nStep two.\n',
  });
  assert.equal(files.get('skills/f/SKILL.md'), 'Before\nStep one.\n\n### a\n\nStep two.\nAfter\n');
});

test('leaves a file with no step line, no token and no override marker byte-identical', () => {
  const sources = {
    'skills/w/SKILL.md': "---\nname: w\ndescription: 'Write: well.'\n---\n# w\n\nText with { and [a link](x.md).\n",
    'skills/w/references/r.md': '| a | b |\n| - | - |\n\nNo newline at the end',
    'references/shared.md': '## Findings\n\n<!-- uses:start -->\n',
  };
  const { files } = compose(sources);
  assert.deepEqual(Object.fromEntries(files), sources);
});

test('strips override-marker lines', () => {
  const marker = '<!-- overrides superpowers/skills/x/SKILL.md: "Say it." -->';
  const { files } = compose({
    'skills/f/SKILL.md': `A\n${marker}\nB\n[step: a]\n`,
    'steps/a.md': `C\n  ${marker}\nD\n`,
  });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\nB\nC\nD\n');
});

test('resolves tokens per target', () => {
  const source = { 'skills/f/SKILL.md': 'Use {{ask-user}}.\n[step: a]\n', 'steps/a.md': 'Then {{ask-user}} again.\n' };
  const claude = compose(source, { 'ask-user': { text: 'the AskUserQuestion tool' } });
  const codex = compose(source, { 'ask-user': { text: 'the host user-question tool' } });
  assert.equal(
    claude.files.get('skills/f/SKILL.md'),
    'Use the AskUserQuestion tool.\nThen the AskUserQuestion tool again.\n',
  );
  assert.equal(
    codex.files.get('skills/f/SKILL.md'),
    'Use the host user-question tool.\nThen the host user-question tool again.\n',
  );
  refuses({ 'skills/f/SKILL.md': 'A\nUse {{nope}}.\n' }, 'skills/f/SKILL.md', 2, /\{\{nope\}\}/);
  refuses({ 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.md': 'A\nUse {{nope}}.\n' }, 'steps/a.md', 2, /\{\{nope\}\}/);
});

test('draws the phase table', () => {
  const { files } = compose(FLOW);
  assert.equal(
    files.get('skills/f/SKILL.md'),
    [
      '---',
      'name: f',
      '---',
      '# f',
      '',
      '| Phase | Runs | Output |',
      '| --- | --- | --- |',
      '| 1 Read | a | b |',
      '| 2 Grill | c | d. **Gate 1** |',
      '| 3 Plan | e | f. **Gate 2** |',
      '',
      'phases: read | grill | plan | done',
      '',
      '## Rules for the whole run',
      '',
      'Host adapter.',
      '',
      '## Phase 1: Read',
      '',
      'Read it, then ask the user.',
      '',
      '## Phase 2: Grill',
      '',
      'Ask at the gate.',
      '',
      '## Phase 3: Plan',
      '',
      'Ask at the gate.',
      '',
    ].join('\n'),
  );
  refuses({ 'skills/f/SKILL.md': '[step: phases]\n\n## Phase 1: Read more\n' }, 'skills/f/SKILL.md', 3, /Read more/);
  const unconverted = { 'skills/g/SKILL.md': '## Phase 1: Read more\n\nText.\n' };
  assert.equal(compose(unconverted).files.get('skills/g/SKILL.md'), unconverted['skills/g/SKILL.md']);
});

test('inlines the adapter', () => {
  const { files } = compose({ 'skills/f/SKILL.md': 'A\n[step: host]\nB\n' });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\nHost adapter.\nB\n');
});

test('refuses an unknown step', () => {
  refuses({ 'skills/f/SKILL.md': 'A\n[step: missing]\n' }, 'skills/f/SKILL.md', 2, /missing/);
});

test('refuses a step without repeat: true used twice in one file', () => {
  refuses({ 'skills/f/SKILL.md': '[step: a]\n\n[step: a]\n', 'steps/a.md': 'A.\n' }, 'skills/f/SKILL.md', 3, /\ba\b/);
});

test('refuses a [step: line inside a step', () => {
  refuses(
    { 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.md': '---\nuses: p:x\n---\nA.\n[step: b]\n', 'steps/b.md': 'B.\n' },
    'steps/a.md',
    5,
    /\ba\b/,
  );
});

test('refuses a # or ## heading inside a step', () => {
  refuses({ 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.md': 'A.\n## Heading\n' }, 'steps/a.md', 2, /\ba\b/);
  refuses({ 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.md': '# Title\n' }, 'steps/a.md', 1, /\ba\b/);
});

test('refuses <skill-dir> inside a step', () => {
  refuses(
    { 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.md': 'Run node "<skill-dir>/x.mjs".\n' },
    'steps/a.md',
    1,
    /\ba\b/,
  );
});

test('checks only the steps a file uses', () => {
  const { files } = compose({
    'skills/f/SKILL.md': 'A\n',
    'steps/unused.md': '## Heading\n\nRun node "<skill-dir>/x.mjs".\n',
  });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\n');
});

test('refuses an unmet requires:', () => {
  refuses(
    { 'skills/f/SKILL.md': 'A\n[step: a]\n', 'steps/a.md': '---\nrequires: b\n---\nA.\n', 'steps/b.md': 'B.\n' },
    'skills/f/SKILL.md',
    2,
    /\ba\b.*\bb\b/,
  );
});

test("refuses a writes: section missing from any of the flow's templates", () => {
  const flow = {
    'skills/f/SKILL.md': '---\nname: f\ntemplate: references/t1.md, references/t2.md\n---\n[step: a]\n',
    'steps/a.md': '---\nwrites: Rulings, Parking lot\n---\nA.\n',
    'references/t1.md': '# T1\n\n## Rulings\n\n## Parking lot\n',
  };
  refuses(
    { ...flow, 'references/t2.md': '# T2\n\n## Rulings\n' },
    'skills/f/SKILL.md',
    5,
    /\ba\b.*Parking lot.*references\/t2\.md/,
  );
  assert.doesNotThrow(() => compose({ ...flow, 'references/t2.md': '## Parking lot\n## Rulings\n' }));
});

test('refuses a flow with no template: using a step that writes:', () => {
  refuses(
    { 'skills/f/SKILL.md': '---\nname: f\n---\n[step: a]\n', 'steps/a.md': '---\nwrites: Rulings\n---\nA.\n' },
    'skills/f/SKILL.md',
    4,
    /\ba\b.*template/,
  );
});

test('refuses a needs: subagents step without a Without subagents: line', () => {
  const flow = { 'skills/f/SKILL.md': '[step: a]\n' };
  refuses({ ...flow, 'steps/a.md': '---\nneeds: subagents\n---\nDispatch agents.\n' }, 'steps/a.md', 2, /\ba\b/);
  assert.doesNotThrow(() =>
    compose({
      ...flow,
      'steps/a.md': '---\nneeds: subagents\n---\nDispatch agents.\nWithout subagents: do it yourself.\n',
    }),
  );
});

test('strips uses and template from frontmatter', () => {
  const { files } = compose({
    'skills/f/SKILL.md':
      '---\nname: f\nuses: p:x\ndescription: d\ntemplate: references/t.md\ndisable-model-invocation: true\n---\nBody\n',
  });
  assert.equal(
    files.get('skills/f/SKILL.md'),
    '---\nname: f\ndescription: d\ndisable-model-invocation: true\n---\nBody\n',
  );
});

test('computes uses', () => {
  const { uses } = compose(
    {
      'skills/f/SKILL.md':
        '---\nname: f\ndisable-model-invocation: true\nuses: superpowers:writing-plans, pstack-picks:how\n---\n[step: a]\n{{watch}}\n',
      'steps/a.md':
        '---\nuses: pstack-picks:why, pstack-picks:how, claude-md-management@claude-plugins-official:claude-md-improver\n---\nA.\n',
      'skills/writing/SKILL.md': '---\nname: writing\nuses: p:x\n---\nWrite.\n',
    },
    { watch: { text: 'Watch.', uses: { 'claude-code': ['Monitor'] } } },
  );
  assert.deepEqual(Object.keys(uses), ['f']);
  assert.deepEqual(Object.keys(uses.f), [
    'claude-code',
    'claude-md-management@claude-plugins-official',
    'pstack-picks',
    'superpowers',
  ]);
  assert.deepEqual(uses.f, {
    'claude-code': ['Monitor'],
    'claude-md-management@claude-plugins-official': ['claude-md-improver'],
    'pstack-picks': ['how', 'why'],
    superpowers: ['writing-plans'],
  });
});

test('reads CRLF as LF', () => {
  const crlf = Object.fromEntries(Object.entries(FLOW).map(([path, text]) => [path, text.replaceAll('\n', '\r\n')]));
  assert.deepEqual(compose(crlf), compose(FLOW));
});
