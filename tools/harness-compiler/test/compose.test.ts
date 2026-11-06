import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { ComposeError, checkBuilt, composeFlows, type HostTokens } from '../src/flows/compose.ts';
import type { TargetId } from '../src/model.ts';
import { TOKENS as CLAUDE_CODE } from '../src/templates/hosts/claude-code.ts';
import { TOKENS as CODEX } from '../src/templates/hosts/codex.ts';

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
// A step file: its `keys` lines, then `text` in a ''' literal string, so text line n is file line keys.length + 1 + n.
const step = (text: string, ...keys: string[]) => [...keys, "text = '''", `${text}'''`, ''].join('\n');

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
  'steps/gate.toml': step('Ask at the gate.\n', 'repeat = true'),
};

test('composes a step in place', () => {
  const { files } = compose({
    'skills/f/SKILL.md': 'Before\n[step: a]\nAfter\n',
    'steps/a.toml': step('Step one.\n\n### a\n\nStep two.\n', 'uses = ["p:x"]'),
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

test('leaves out .md files in folders that never ship (tests/, evals/)', () => {
  const { files } = compose({
    'skills/f/SKILL.md': 'A\n',
    'skills/f/tests/fixtures/plan.md': '[step: missing]\n{{nope}}\n',
    'references/evals/case.md': '{{nope}}\n',
  });
  assert.deepEqual([...files.keys()], ['skills/f/SKILL.md']);
});

test('strips override-marker lines', () => {
  const marker = '<!-- overrides superpowers/skills/x/SKILL.md: "Say it." -->';
  const { files } = compose({
    'skills/f/SKILL.md': `A\n${marker}\nB\n[step: a]\n`,
    'steps/a.toml': step(`C\n  ${marker}\nD\n`),
  });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\nB\nC\nD\n');
});

test('resolves tokens per target', () => {
  const source = {
    'skills/f/SKILL.md': 'Use {{ask-user}}.\n[step: a]\n',
    'steps/a.toml': step('Then {{ask-user}} again.\n'),
  };
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
  for (const near of ['{{ ask-user }}', '{{ask-user }}', '{{model: fast}}'])
    refuses({ 'skills/f/SKILL.md': `A\nUse ${near}.\n` }, 'skills/f/SKILL.md', 2, /unknown token/);
  refuses(
    { 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.toml': step('A\nUse {{nope}}.\n') },
    'steps/a.toml',
    3,
    /\{\{nope\}\}/,
  );
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

test("resolves a token in a phase's runs/output comment, records its uses, and refuses an unknown one", () => {
  const conductor = (comment: string) => ({
    'skills/f/SKILL.md': `---\nname: f\ndisable-model-invocation: true\n---\n[step: phases]\n\n## Phase 1: Read\n\n${comment}\n`,
  });
  const tokens = { ...TOKENS, explore: { text: 'Explore agents', uses: { 'claude-code': ['Explore'] } } };
  const { files, uses } = compose(conductor('<!-- runs: {{explore}} · output: {{ask-user}} -->'), tokens);
  assert.match(files.get('skills/f/SKILL.md') ?? '', /^\| 1 Read \| Explore agents \| ask the user \|$/m);
  assert.deepEqual(uses.f, { 'claude-code': ['Explore'] });
  refuses(
    conductor('<!-- runs: {{ask user}} · output: b -->'),
    'skills/f/SKILL.md',
    9,
    /unknown token \{\{ask user\}\}/,
  );
});

test('inlines the adapter', () => {
  const { files } = compose({ 'skills/f/SKILL.md': 'A\n[step: host]\nB\n' });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\nHost adapter.\nB\n');
});

test('refuses an unknown step', () => {
  refuses({ 'skills/f/SKILL.md': 'A\n[step: missing]\n' }, 'skills/f/SKILL.md', 2, /missing/);
});

test('refuses a step without repeat: true used twice in one file', () => {
  refuses(
    { 'skills/f/SKILL.md': '[step: a]\n\n[step: a]\n', 'steps/a.toml': step('A.\n') },
    'skills/f/SKILL.md',
    3,
    /\ba\b/,
  );
});

test('refuses a [step: line inside a step', () => {
  refuses(
    {
      'skills/f/SKILL.md': '[step: a]\n',
      'steps/a.toml': step('A.\n[step: b]\n', 'uses = ["p:x"]'),
      'steps/b.toml': step('B.\n'),
    },
    'steps/a.toml',
    4,
    /\ba\b/,
  );
});

test('refuses a # or ## heading inside a step', () => {
  refuses({ 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.toml': step('A.\n## Heading\n') }, 'steps/a.toml', 3, /\ba\b/);
  refuses({ 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.toml': step('# Title\n') }, 'steps/a.toml', 2, /\ba\b/);
});

test('refuses <skill-dir> inside a step', () => {
  refuses(
    { 'skills/f/SKILL.md': '[step: a]\n', 'steps/a.toml': step('Run node "<skill-dir>/x.mjs".\n') },
    'steps/a.toml',
    2,
    /\ba\b/,
  );
});

test('checks only the steps a file uses', () => {
  const { files } = compose({
    'skills/f/SKILL.md': 'A\n',
    'steps/unused.toml': step('## Heading\n\nRun node "<skill-dir>/x.mjs".\n', 'needs = "subagents"'),
  });
  assert.equal(files.get('skills/f/SKILL.md'), 'A\n');
});

// A step no file uses, refused at `line` of steps/a.toml: keys, types and the text opener are checked on every step.
const refusesStep = (content: string, line: number, what: RegExp) =>
  refuses({ 'skills/f/SKILL.md': 'A\n', 'steps/a.toml': content }, 'steps/a.toml', line, what);

test('refuses a step that is not TOML, at its line with the caret', () => {
  refusesStep(step('A.\n', 'needs = subagents'), 1, /needs = subagents\n.*\^/s);
});

test("refuses a ''' inside a step's text, with the hint that it ends the text", () => {
  refusesStep(step("Quote ''' here.\n"), 2, /''' inside the text ends it/);
  refusesStep(step("Quote '''\nmore\n"), 3, /''' inside the text ends it/);
});

test('refuses an unknown step key, listing the valid keys', () => {
  refusesStep(step('A.\n', 'require = ["b"]'), 1, /unknown key require\b.*\buses, requires, writes\b.*\btext\b/);
});

test('refuses a step key of the wrong type, and a uses entry that is not plugin:name', () => {
  refusesStep(step('A.\n', 'repeat = "true"'), 1, /\brepeat\b/);
  refusesStep(step('A.\n', 'uses = "a:b"'), 1, /\buses\b/);
  refusesStep(step('A.\n', 'requires = ["b"]', 'uses = ["p:x", "how"]'), 2, /"how" is not plugin:name/);
});

test('refuses a needs or in value outside its one allowed value', () => {
  refusesStep(step('A.\n', 'needs = "subagent"'), 1, /\bneeds\b.*"subagents"/);
  refusesStep(step('A.\n', 'in = "every-flow"'), 1, /\bin\b.*"every-conductor"/);
});

test("refuses a step without text, or whose text opener isn't alone on its line", () => {
  refusesStep('uses = ["p:x"]\n', 1, /\btext\b/);
  refusesStep("uses = [\"p:x\"]\ntext = '''A.\n'''\n", 2, /text = '''/);
  refusesStep('text = """\nA.\n"""\n', 1, /text = '''/);
});

test('does not load a dotfile in steps/', () => {
  assert.doesNotThrow(() => compose({ 'skills/f/SKILL.md': 'A\n', 'steps/.draft.toml': 'not = toml =\n' }));
  refuses(
    { 'skills/f/SKILL.md': '[step: .draft]\n', 'steps/.draft.toml': step('A.\n') },
    'skills/f/SKILL.md',
    1,
    /draft/,
  );
});

test('refuses a converted conductor missing a step that says in = "every-conductor"', () => {
  const steps = { 'steps/rules.toml': step('R.\n', 'in = "every-conductor"'), 'steps/a.toml': step('A.\n') };
  refuses({ ...steps, 'skills/f/SKILL.md': '[step: phases]\n\n[step: a]\n' }, 'skills/f/SKILL.md', 1, /\brules\b/);
  assert.doesNotThrow(() => compose({ ...steps, 'skills/f/SKILL.md': '[step: phases]\n\n[step: rules]\n' }));
  assert.doesNotThrow(() => compose({ ...steps, 'skills/g/SKILL.md': '[step: a]\n' }));
});

test('refuses a near-miss step line in a file with [step: phases], and leaves it alone elsewhere', () => {
  for (const line of ['[step:a]', '[Step: a]', '[step: a] ']) {
    const files = { 'steps/a.toml': step('A.\n') };
    refuses({ ...files, 'skills/f/SKILL.md': `[step: phases]\n\n${line}\n` }, 'skills/f/SKILL.md', 3, /step line/);
    const unconverted = { ...files, 'skills/g/SKILL.md': `${line}\n` };
    assert.equal(compose(unconverted).files.get('skills/g/SKILL.md'), `${line}\n`);
  }
});

test('refuses an unmet requires:', () => {
  refuses(
    {
      'skills/f/SKILL.md': 'A\n[step: a]\n',
      'steps/a.toml': step('A.\n', 'requires = ["b"]'),
      'steps/b.toml': step('B.\n'),
    },
    'skills/f/SKILL.md',
    2,
    /\ba\b.*\bb\b/,
  );
});

test("refuses a writes: section missing from any of the flow's templates", () => {
  const flow = {
    'skills/f/SKILL.md': '---\nname: f\ntemplate: references/t1.md, references/t2.md\n---\n[step: a]\n',
    'steps/a.toml': step('A.\n', 'writes = ["Rulings", "Parking lot"]'),
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
    { 'skills/f/SKILL.md': '---\nname: f\n---\n[step: a]\n', 'steps/a.toml': step('A.\n', 'writes = ["Rulings"]') },
    'skills/f/SKILL.md',
    4,
    /\ba\b.*template/,
  );
});

test('refuses a needs: subagents step without a Without subagents: line', () => {
  const flow = { 'skills/f/SKILL.md': '[step: a]\n' };
  refuses({ ...flow, 'steps/a.toml': step('Dispatch agents.\n', 'needs = "subagents"') }, 'steps/a.toml', 1, /\ba\b/);
  assert.doesNotThrow(() =>
    compose({
      ...flow,
      'steps/a.toml': step('Dispatch agents.\nWithout subagents: do it yourself.\n', 'needs = "subagents"'),
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
      'steps/a.toml': step(
        'A.\n',
        'uses = ["pstack-picks:why", "pstack-picks:how", "claude-md-management@claude-plugins-official:claude-md-improver"]',
      ),
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

// checkBuilt on the composed files written over their sources, as the build writes them into the target tree.
const checked = (files: Record<string, string>, target: TargetId = 'claude-code', tokens = TOKENS) => {
  const dir = plugin(files);
  const composed = composeFlows(dir, tokens);
  for (const [path, text] of composed.files) put(dir, path, text);
  return checkBuilt(dir, target, composed);
};
const CONDUCTOR = '---\nname: c\ndisable-model-invocation: true\n---\n';

test("checkBuilt: a conductor's rules plus Start over 4,500 estimated tokens is a problem", () => {
  const start = (bytes: number) => `${CONDUCTOR}${'x'.repeat(bytes - CONDUCTOR.length - 1)}\n`;
  const over = checked({ 'skills/c/SKILL.md': `${start(4501 * 4)}## Phase 1: Read\n\n${'y'.repeat(40000)}\n` });
  assert.equal(over.problems.length, 1);
  assert.match(over.problems[0], /skills\/c\/SKILL\.md:\d+: .*4501.*4500/);
  assert.deepEqual(over.estimates, { c: 4501 });
  const under = checked({ 'skills/c/SKILL.md': `${start(4500 * 4)}## Phase 1: Read\n\n${'y'.repeat(40000)}\n` });
  assert.deepEqual(under, { problems: [], estimates: { c: 4500 } });
});

test('checkBuilt: a 20,000-byte non-conductor skill with no ## Phase heading is clean', () => {
  const big = checked({ 'skills/w/SKILL.md': `---\nname: w\n---\n${'x'.repeat(20000)}\n` });
  assert.deepEqual(big, { problems: [], estimates: {} });
});

test("checkBuilt: a node command or references link that doesn't resolve is a problem", () => {
  const files = { 'skills/c/x.mjs': '', 'skills/c/references/r.md': 'Run node "<skill-dir>/x.mjs".\n' };
  for (const line of [
    'node "./x.mjs"',
    'node "<flow-root>/missing.mjs"',
    'node "<skill-dir>/missing.mjs"',
    'See [r](references/missing.md).',
  ]) {
    const { problems } = checked({ ...files, 'skills/c/SKILL.md': `A\n${line}\n` });
    assert.equal(problems.length, 1, line);
    assert.match(problems[0], /skills\/c\/SKILL\.md:2: /, line);
  }
  assert.deepEqual(checked({ ...files, 'skills/c/SKILL.md': 'See [r](references/r.md).\n' }).problems, []);
});

test('checkBuilt: built text naming flow-rules is a problem', () => {
  for (const file of ['skills/c/SKILL.md', 'references/r.md']) {
    const { problems } = checked({ [file]: 'A\nAs the flow-rules say.\n' });
    assert.equal(problems.length, 1, file);
    assert.ok(problems[0].startsWith(`[claude-code] ${file}:2: `) && problems[0].includes('flow-rules'), problems[0]);
  }
});

test('checkBuilt: Codex text naming a Claude-only phrase outside packs/ and resources/ is a problem', () => {
  const files = {
    'skills/c/SKILL.md': 'A\nUse AskUserQuestion.\n',
    'packs/p/skills/s/SKILL.md': 'Use WebFetch.\n',
    'resources/g/skills/g/SKILL.md': 'Use Monitor.\n',
  };
  const codex = checked(files, 'codex');
  assert.equal(codex.problems.length, 1);
  assert.match(codex.problems[0], /skills\/c\/SKILL\.md:2: .*AskUserQuestion/);
  assert.deepEqual(checked(files, 'claude-code').problems, []);
});

// A conductor whose frontmatter uses `uses` and whose body reads `body`.
const usesFlow = (uses: string, body: string) =>
  `---\nname: c\ndisable-model-invocation: true\nuses: ${uses}\n---\n${body}\n`;

test("checkBuilt: a uses name absent from the conductor's SKILL.md and linked references is a problem, per target", () => {
  const uses = 'superpowers:writing-plans, ponytail:ponytail-review';
  const ref = { 'skills/c/references/r.md': 'Then ponytail-review.\n' };
  const linked = checked({
    ...ref,
    'skills/c/SKILL.md': usesFlow(uses, 'Run writing-plans. See [r](references/r.md).'),
  });
  assert.deepEqual(linked, { problems: [], estimates: { c: linked.estimates.c } });
  const unlinked = checked({ ...ref, 'skills/c/SKILL.md': usesFlow(uses, 'Run writing-plans.') });
  assert.equal(unlinked.problems.length, 1);
  assert.match(unlinked.problems[0], /^\[claude-code\] skills\/c\/SKILL\.md:\d+: .*ponytail:ponytail-review/);
  // Each target checks its own uses against its own text: only Claude Code's token uses Monitor without naming it.
  const files = { 'skills/c/SKILL.md': usesFlow('superpowers:writing-plans', 'Run writing-plans, then {{watch}}.') };
  const claude = checked(files, 'claude-code', { watch: { text: 'watch it', uses: { 'claude-code': ['Monitor'] } } });
  assert.equal(claude.problems.length, 1);
  assert.match(claude.problems[0], /^\[claude-code\] .*claude-code:Monitor/);
  assert.deepEqual(checked(files, 'codex', { watch: { text: 'poll it' } }).problems, []);
});

test('checkBuilt: a short-name use counts only as plugin:name or a pack path, and bare words are never flagged', () => {
  const plain = checked({
    'skills/c/SKILL.md': usesFlow('superpowers:writing-plans', 'Run writing-plans: how and why.'),
  });
  assert.deepEqual(plain.problems, []);
  for (const mention of ['pstack-picks:how', '<packs>/pstack-picks/skills/how/SKILL.md'])
    assert.deepEqual(checked({ 'skills/c/SKILL.md': usesFlow('pstack-picks:how', `Read ${mention}.`) }).problems, []);
  const bare = checked({ 'skills/c/SKILL.md': usesFlow('pstack-picks:how', 'Ask how it works.') });
  assert.equal(bare.problems.length, 1);
  assert.match(bare.problems[0], /^\[claude-code\] skills\/c\/SKILL\.md:\d+: .*pstack-picks:how/);
});

test("checkBuilt: a pack path in a conductor's text that isn't in its uses is a problem", () => {
  const body = [
    'Read <packs>/superpowers/skills/writing-plans/SKILL.md and <packs>/<pack>/skills/<name>/SKILL.md.',
    'Then <packs>/ponytail/skills/ponytail/SKILL.md and `<flow-root>/packs/tob-picks/skills/sharp-edges/SKILL.md`.',
  ].join('\n');
  const { problems } = checked({ 'skills/c/SKILL.md': usesFlow('superpowers:writing-plans', body) });
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.match(problems[0], /skills\/c\/SKILL\.md:6: .*ponytail:ponytail/);
  assert.match(problems[1], /skills\/c\/SKILL\.md:6: .*tob-picks:sharp-edges/);
});

test('the host maps agree', () => {
  assert.deepEqual(Object.keys(CLAUDE_CODE).sort(), Object.keys(CODEX).sort());
});
