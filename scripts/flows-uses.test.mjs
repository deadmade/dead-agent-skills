import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { composeFlows, isConductor } from '../tools/harness-compiler/src/flows/compose.ts';
import { TOKENS as CLAUDE_CODE } from '../tools/harness-compiler/src/templates/hosts/claude-code.ts';
import { TOKENS as CODEX } from '../tools/harness-compiler/src/templates/hosts/codex.ts';
import {
  FLOWS,
  checkOverrides,
  checkPackPaths,
  checkTemplates,
  checkUseNames,
  currentDeps,
  expectedDeps,
  packs,
  renderTree,
  withTree,
} from './flows-uses.mjs';

const ROOT = join(import.meta.dirname, '..');

// A conductor's SKILL.md using `uses` (`plugin:name, …`): only skills with `disable-model-invocation: true` are conductors.
const conductor = (uses, body = '') => `---\nname: fix\ndisable-model-invocation: true\nuses: ${uses}\n---\n${body}`;

// A repo with one conductor `fix` (`skillText`), local plugins picks (a skill, an agent, an MCP server) and web (an
// MCP server), and the pack superpowers (a skill, no marketplace entry). `files` adds more ({ path: text }).
function repo(skillText, files = {}) {
  const fx = mkdtempSync(join(tmpdir(), 'fu-'));
  const put = (p, s) => (mkdirSync(dirname(join(fx, p)), { recursive: true }), writeFileSync(join(fx, p), s));
  put('plugins/flows/skills/fix/SKILL.md', skillText);
  for (const [p, s] of Object.entries(files)) put(p, s);
  put('plugins/picks/skills/how/SKILL.md', '');
  put('plugins/picks/agents/reviewer.md', '');
  put('plugins/picks/plugin.json', JSON.stringify({ mcpServers: { docs: { url: 'https://x.invalid' } } }));
  put('plugins/web/plugin.json', '{}');
  put('plugins/flows/packs/superpowers/skills/writing-plans/SKILL.md', '');
  put(
    'plugins/catalog.json',
    JSON.stringify([
      { name: 'picks', source: './plugins/picks' },
      { name: 'web', source: './plugins/web' },
      { name: 'remote', source: { source: 'url', url: 'https://example.invalid/remote.git' } },
    ]),
  );
  return fx;
}

// checkUseNames on a repo whose conductor uses `uses`, fed the uses composed for Claude Code.
function fixture(uses, files) {
  const fx = repo(conductor(uses), files);
  return checkUseNames(fx, composeFlows(join(fx, FLOWS), CLAUDE_CODE).uses);
}

test('isConductor reads only frontmatter and trims values across line endings', () => {
  for (const value of ['true', ' true', 'true ']) {
    for (const newline of ['\n', '\r\n']) {
      assert.equal(isConductor(['---', `disable-model-invocation: ${value}`, '---', 'body'].join(newline)), true);
    }
  }
  assert.equal(isConductor('---\ndisable-model-invocation: false\n---\n'), false);
  assert.equal(isConductor('disable-model-invocation: true\n'), false);
  assert.equal(isConductor('---\nname: plain\n---\ndisable-model-invocation: true\n'), false);
});

test('a valid map has no problems: local skill and agent, MCP tool, url plugin, official, builtin', () => {
  const uses =
    'picks:how, picks:reviewer, web:search, remote:deep, claude-security@claude-plugins-official:deep, claude-code:general-purpose';
  assert.deepEqual(fixture(uses), []);
});

test('a pack resolves to its folder under plugins/flows/packs, with no marketplace entry', () => {
  assert.deepEqual(fixture('superpowers:writing-plans'), []);
  assert.deepEqual(fixture('superpowers:nope'), [
    'plugins/flows/skills/fix/SKILL.md: superpowers has no skill, agent or workflow nope',
  ]);
});

test("an MCP server of a plugin that also has skills counts as that plugin's", () => {
  assert.deepEqual(fixture('picks:how, picks:docs'), []);
});

test('each kind of problem is reported', () => {
  assert.match(fixture('nope:how')[0], /nope is not a plugin/);
  assert.match(fixture('flows:fix')[0], /fix is a conductor/);
  assert.match(fixture('picks:gone')[0], /picks has no skill, agent or workflow gone/);
});

test("uses may list flows' non-conductor skills", () => {
  // The plain skill's frontmatter is CRLF, as a Windows checkout writes it.
  const files = {
    'plugins/flows/skills/writing/SKILL.md': '---\r\nname: writing\r\ndescription: x\r\n---\r\nbody\r\n',
  };
  assert.deepEqual(fixture('flows:writing', files), []);
  assert.match(fixture('flows:fix', files)[0], /fix is a conductor/);
  assert.match(fixture('flows:nope', files)[0], /flows has no skill nope/);
  assert.ok(!expectedDeps({ fix: { flows: ['writing'], picks: ['how'] } }, []).includes('flows'));
});

test('a conductor that still has a uses.json is reported', () => {
  assert.deepEqual(fixture('picks:how', { 'plugins/flows/skills/fix/uses.json': '{"picks":["how"]}' }), [
    "plugins/flows/skills/fix/uses.json: move it into SKILL.md's uses: frontmatter",
  ]);
});

test('a skill folder without SKILL.md is reported', () => {
  const files = { 'plugins/flows/skills/gone/references/x.md': '' };
  assert.deepEqual(fixture('picks:how', files), ['plugins/flows/skills/gone: no SKILL.md']);
});

test('expectedDeps: every plugin once, sorted, builtins and packs left out', () => {
  const all = { a: { z: ['x'], 'claude-code': ['y'], superpowers: ['p'] }, b: { m: ['x'], z: ['q'] } };
  assert.deepEqual(expectedDeps(all, ['superpowers']), ['m', 'z']);
});

test("expectedDeps takes Claude Code's composed uses, host text included", () => {
  const fx = repo(conductor('picks:how', 'Ask how.\n[step: host]\n'));
  const claude = composeFlows(join(fx, FLOWS), CLAUDE_CODE).uses;
  assert.deepEqual(expectedDeps(claude, []), [
    'claude-md-management@claude-plugins-official',
    'claude-security@claude-plugins-official',
    'picks',
  ]);
  assert.deepEqual(expectedDeps(composeFlows(join(fx, FLOWS), CODEX).uses, []), ['picks']);
});

test('packs lists the folders under plugins/flows/packs', () => {
  const fx = mkdtempSync(join(tmpdir(), 'fu-'));
  mkdirSync(join(fx, 'plugins/flows/packs/b'), { recursive: true });
  mkdirSync(join(fx, 'plugins/flows/packs/a'), { recursive: true });
  writeFileSync(join(fx, 'plugins/flows/packs/notes.txt'), '');
  assert.deepEqual(packs(fx), ['a', 'b']);
});

test('renderTree draws one block per conductor from every harness, marking what only one host uses', () => {
  const codex = { fix: { picks: ['how', 'why'], web: ['search'] }, learn: { picks: ['recall'] } };
  const claude = { ...codex, fix: { 'claude-code': ['Monitor'], picks: ['how', 'why'], web: ['WebSearch', 'search'] } };
  assert.equal(
    renderTree({ 'claude-code': claude, codex }),
    [
      '```text',
      'fix',
      '├ claude-code: Monitor (claude-code)',
      '├ picks: how, why',
      '└ web: WebSearch (claude-code), search',
      '',
      'learn',
      '└ picks: recall',
      '```',
    ].join('\n'),
  );
});

test('withTree replaces only the marked block, and refuses a README without one', () => {
  const readme = 'top\n<!-- uses:start -->\nold\n<!-- uses:end -->\nbottom\n';
  assert.equal(withTree(readme, 'NEW'), 'top\n<!-- uses:start -->\n\nNEW\n\n<!-- uses:end -->\nbottom\n');
  assert.equal(withTree('no markers', 'NEW'), undefined);
});

test('the real conductors pass, and flows depends on exactly what they use on Claude Code', () => {
  const uses = composeFlows(join(ROOT, FLOWS), CLAUDE_CODE).uses;
  assert.deepEqual(checkUseNames(ROOT, uses), []);
  assert.deepEqual(currentDeps(ROOT), expectedDeps(uses, packs(ROOT)));
  assert.deepEqual(checkOverrides(ROOT), []);
  assert.deepEqual(checkPackPaths(ROOT), []);
});

// A repo whose conductor (or `file`) quotes `quote` from a pack file that reads `pack`.
function overrides(quote, pack = 'Always **write the\nplan** first.\n', file = 'plugins/flows/skills/fix/SKILL.md') {
  const fx = mkdtempSync(join(tmpdir(), 'ov-'));
  const put = (f, s) => (mkdirSync(dirname(join(fx, f)), { recursive: true }), writeFileSync(join(fx, f), s));
  put('plugins/flows/packs/p/skills/s/SKILL.md', pack);
  put(file, `intro\n<!-- overrides p/skills/s/SKILL.md: "${quote}" -->\n`);
  return checkOverrides(fx);
}

test('checkOverrides: a found sentence passes, also across a wrap and bold in the pack', () => {
  assert.deepEqual(overrides('Always write the plan first.'), []);
});

test('checkOverrides: a changed sentence fails, naming file and line', () => {
  assert.deepEqual(overrides('Never write the plan.'), [
    'plugins/flows/skills/fix/SKILL.md:2: p/skills/s/SKILL.md no longer contains "Never write the plan."',
  ]);
});

test('checkOverrides: a changed sentence in a steps/*.toml fails', () => {
  assert.deepEqual(overrides('Never write the plan.', undefined, 'plugins/flows/steps/x.toml'), [
    'plugins/flows/steps/x.toml:2: p/skills/s/SKILL.md no longer contains "Never write the plan."',
  ]);
});

test('checkOverrides: *emphasis*, _emphasis_ and __strong__ in the pack are ignored', () => {
  assert.deepEqual(overrides('Write the plan now.', 'Write *the* _plan_ __now__.\n'), []);
});

test('checkOverrides: a marker naming a directory is a problem, not a crash', () => {
  const fx = mkdtempSync(join(tmpdir(), 'ov-'));
  mkdirSync(join(fx, 'plugins/flows/packs/p/skills'), { recursive: true });
  mkdirSync(join(fx, 'plugins/flows/skills/fix'), { recursive: true });
  writeFileSync(join(fx, 'plugins/flows/skills/fix/SKILL.md'), '<!-- overrides p/skills: "x" -->');
  assert.equal(checkOverrides(fx).length, 1);
});

test('checkOverrides: a marker it cannot read is reported, not skipped', () => {
  const fx = mkdtempSync(join(tmpdir(), 'ov-'));
  mkdirSync(join(fx, 'plugins/flows/skills/fix'), { recursive: true });
  writeFileSync(
    join(fx, 'plugins/flows/skills/fix/SKILL.md'),
    'intro\n<!-- overrides ponytail/skills/ponytail/SKILL.md: lite level, unquoted -->\n',
  );
  assert.deepEqual(checkOverrides(fx), [
    'plugins/flows/skills/fix/SKILL.md:2: an overrides marker that cannot be read: <!-- overrides ponytail/skills/ponytail/SKILL.md: lite level, unquoted -->',
  ]);
});

test('checkOverrides: a missing pack file fails', () => {
  const fx = mkdtempSync(join(tmpdir(), 'ov-'));
  mkdirSync(join(fx, 'plugins/flows/skills/fix'), { recursive: true });
  writeFileSync(join(fx, 'plugins/flows/skills/fix/SKILL.md'), '<!-- overrides p/gone.md: "x" -->');
  assert.equal(checkOverrides(fx).length, 1);
});

// A repo whose conductor (or `file`) reads `text`, with one pack file p/skills/s/SKILL.md; packs/ and agents/ name a
// missing path.
function packPaths(text, file = 'plugins/flows/skills/fix/SKILL.md') {
  const fx = mkdtempSync(join(tmpdir(), 'pp-'));
  const put = (f, s) => (mkdirSync(dirname(join(fx, f)), { recursive: true }), writeFileSync(join(fx, f), s));
  put('plugins/flows/packs/p/skills/s/SKILL.md', '`<packs>/p/gone.md`');
  put('plugins/flows/agents/a.md', '`${CLAUDE_PLUGIN_ROOT}/packs/p/gone.md`');
  put(file, text);
  return checkPackPaths(fx);
}

test('checkPackPaths: existing paths in both spellings pass, placeholders are skipped', () => {
  const text =
    'Read `<packs>/p/skills/s/SKILL.md`, then ${CLAUDE_PLUGIN_ROOT}/packs/p/skills/s/SKILL.md.\n' +
    '`<packs>/<pack>/skills/<name>/SKILL.md` and `<packs>/…` are not paths.';
  assert.deepEqual(packPaths(text), []);
});

test('checkPackPaths: a missing path fails, naming file and line', () => {
  assert.deepEqual(packPaths('intro\nby `<packs>/p/skills/gone.md` and ${CLAUDE_PLUGIN_ROOT}/packs/q/x.md.'), [
    'plugins/flows/skills/fix/SKILL.md:2: <packs>/p/skills/gone.md does not exist',
    'plugins/flows/skills/fix/SKILL.md:2: <packs>/q/x.md does not exist',
  ]);
});

test('checkPackPaths: a missing path in a steps/*.toml fails', () => {
  assert.deepEqual(packPaths("text = '''\nRead `<packs>/p/gone.md`.\n'''\n", 'plugins/flows/steps/x.toml'), [
    'plugins/flows/steps/x.toml:2: <packs>/p/gone.md does not exist',
  ]);
});

// checkTemplates: the parts the flow cockpit reads must stay in the templates and the conductor text.
const TEMPLATES = [
  'plugins/flows/skills/build-feature/references/flow-template.md',
  'plugins/flows/skills/research-feature/references/research-template.md',
  'plugins/flows/references/build-template.md',
];
const AUDIT = 'plugins/flows/skills/review-code/references/audit-template.md';
const STEPS = 'plugins/flows/steps';

// A copy of the real files with `needle` taken out of `file`.
function without(file, needle) {
  const fx = mkdtempSync(join(tmpdir(), 'ct-'));
  for (const f of [...TEMPLATES, AUDIT, STEPS]) {
    mkdirSync(dirname(join(fx, f)), { recursive: true });
    cpSync(join(ROOT, f), join(fx, f), { recursive: true });
  }
  const text = readFileSync(join(fx, file), 'utf8');
  assert.ok(text.includes(needle), `${file} has ${needle}`);
  writeFileSync(join(fx, file), text.split(needle).join('<removed>'));
  return checkTemplates(fx);
}

test('checkTemplates on the real repo returns []', () => {
  assert.deepEqual(checkTemplates(ROOT), []);
});

for (const t of TEMPLATES) {
  // A research run builds nothing, so its template has no Deviations and no `Status:`.
  const research = t.includes('research');
  for (const [what, needle] of [
    ['now:', 'now: <'],
    ['the Gates line shape', '- Gate <n>, <what>:'],
    ['Picked:', 'Picked:'],
    ...(research ? [] : [['Status:', 'Status: open']]),
  ]) {
    test(`checkTemplates names ${t} without ${what}`, () => {
      const problems = without(t, needle);
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.ok(problems[0].startsWith(t), problems[0]);
    });
  }
}

for (const [file, what, needle] of [
  [`${STEPS}/deviations.toml`, 'the Waiting for you rule', 'Waiting for you'],
  [`${STEPS}/deviations.toml`, 'Status: decided', 'Status: decided'],
  [`${STEPS}/gate.toml`, 'the gate line shape', '- Gate <n>, <what>:'],
  [`${STEPS}/plan-shape.toml`, '**Does:**', '**Does:**'],
  [`${STEPS}/plan-shape.toml`, '**Depends on:**', '**Depends on:**'],
  [AUDIT, 'Picks:', 'Picks:'],
  [AUDIT, 'Fixed', 'Fixed <date>'],
]) {
  test(`checkTemplates names ${file} without ${what}`, () => {
    const problems = without(file, needle);
    assert.ok(problems.length >= 1 && problems.every((p) => p.startsWith(file)), problems.join('\n'));
  });
}
