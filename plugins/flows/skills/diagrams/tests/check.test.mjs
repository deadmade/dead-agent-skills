import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outlineFiles, parseDiagrams, parseFilesBlock, planMap } from '../scripts/check.mjs';
import { overviewMermaid } from '../scripts/render.mjs';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(SKILL, 'scripts', 'check.mjs');
const FIXTURE = readFileSync(join(SKILL, 'tests', 'fixtures', 'api-mcp-diagrams.md'), 'utf8');
const OUTLINED = join(SKILL, 'tests', 'fixtures', 'outline');
const WIN = process.platform === 'win32';

const temp = () => mkdtempSync(join(tmpdir(), 'diagrams-'));
const fence = (kind, body) => `\`\`\`${kind}\n${body}\n\`\`\`\n`;

// Runs the checker on `markdown` in a temp folder (also its --root unless `root` is given); returns exit code and text.
function check(markdown, { root = temp(), env, cwd } = {}) {
  const file = join(temp(), 'doc.md');
  writeFileSync(file, markdown);
  const r = spawnSync(process.execPath, [CHECK, file, '--root', root], {
    encoding: 'utf8',
    cwd,
    env: env ?? process.env,
  });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), root };
}

// This is the one test file that runs the checker on the user's cache. `node --test` runs test files at once, and two
// checkers on one cold cache run `npm ci` in one folder. Other test files give the checker a cache and a PATH of their own,
// as `render.test.mjs`'s `render()` does.
// The first run installs the parser into the user's cache; offline it cannot, and the tests that need it stand down.
const READY = !check(fence('mermaid', 'flowchart LR\n  a --> b')).out.includes('not parser-checked');
const NEEDS_PARSER = READY ? false : 'the parser cannot be installed (offline)';

// A checker run whose cache is an empty folder and whose PATH holds only `bin`.
function isolated(markdown, bin, root) {
  const cache = temp();
  return check(markdown, {
    root,
    env: { PATH: bin, HOME: cache, USERPROFILE: cache, XDG_CACHE_HOME: cache, LOCALAPPDATA: cache },
  });
}
const fake = (dir, name, script) => {
  writeFileSync(join(dir, name), script);
  chmodSync(join(dir, name), 0o755);
};

const put = (root, ...paths) =>
  paths.forEach((p) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), '');
  });

const chain = (n) => `flowchart LR\n${Array.from({ length: n - 1 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n')}`;

const plan = (...tasks) =>
  `# Demo Implementation Plan\n\n${tasks
    .map(
      ([id, depends, ...files]) =>
        `### Task ${id}: t${id}\n\n**Does:** x\n**Depends on:** ${depends}\n\n**Files:**\n${files.join('\n')}\n\n- [ ] step\n`,
    )
    .join('\n')}`;

test('a document with no blocks exits 0', () => {
  const r = check('# Title\n\nJust prose.\n');
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), '');
});

test('passes the four api-mcp diagrams', { skip: NEEDS_PARSER }, () => {
  const r = check(FIXTURE);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^error/m);
});

test('fails a flowchart node named call', { skip: NEEDS_PARSER }, () => {
  const r = check(fence('mermaid', 'flowchart LR\n  call --> b'));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /error.*block 1.*Parse error/);
});

test('fails a syntax error', { skip: NEEDS_PARSER }, () => {
  const r = check(`${fence('mermaid', 'flowchart LR\n  a --> b')}\n${fence('mermaid', 'flowchart LR\n  a --> -->')}`);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /block 2.*Parse error/);
  assert.doesNotMatch(r.out, /block 1/);
});

test('fails a ninth node', { skip: NEEDS_PARSER }, () => {
  const r = check(fence('mermaid', chain(9)));
  assert.equal(r.code, 1);
  assert.match(r.out, /block 1.*9 nodes/);
  assert.equal(check(fence('mermaid', chain(8))).code, 0);
});

test('fails a node with no edge', { skip: NEEDS_PARSER }, () => {
  const r = check(fence('mermaid', 'flowchart LR\n  a --> b\n  lone["Lonely<br/>node"]'));
  assert.equal(r.code, 1);
  assert.match(r.out, /block 1.*lone/);
});

test('fails seven participants in a sequence', { skip: NEEDS_PARSER }, () => {
  const body = ['sequenceDiagram', ...[...'ABCDEFG'].map((n) => `  participant ${n}`), '  A->>B: hi'].join('\n');
  const r = check(fence('mermaid', body));
  assert.equal(r.code, 1);
  assert.match(r.out, /block 1.*7 participants/);
  assert.equal(check(fence('mermaid', body.replace('  participant G\n', ''))).code, 0);
});

test('parse-checks other diagram types', { skip: NEEDS_PARSER }, () => {
  const slices = Array.from({ length: 12 }, (_, i) => `  "slice ${i}" : ${i + 1}`).join('\n');
  for (const body of [
    `pie title Many\n${slices}`,
    'erDiagram\n  A ||--o{ B : has',
    'mindmap\n  root((x))\n    a\n    b',
  ])
    assert.equal(check(fence('mermaid', body)).code, 0, body);
  const broken = check(fence('mermaid', 'erDiagram\n  A ||--o{'));
  assert.equal(broken.code, 1);
  assert.match(broken.out, /block 1/);
});

test('a parser that cannot be installed is a warning', { skip: WIN }, () => {
  const doc = fence('mermaid', 'flowchart LR\n  a --> b');
  const failing = temp();
  fake(failing, 'npm', '#!/bin/sh\necho "no network" >&2\nexit 1\n');
  for (const bin of [failing, temp()]) {
    const r = isolated(doc, bin);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /warning.*not parser-checked: /);
  }
});

test('a helper that prints text that is not JSON is a warning too', { skip: WIN }, () => {
  // An npm that "installs" stand-ins for the two packages; the stand-in jsdom prints text on stdout when it loads.
  // It is a node script, because the isolated PATH holds no mkdir or cat.
  const modules = {
    jsdom: "process.stdout.write('hello'); export class JSDOM { constructor() { this.window = { document: {} }; } }",
    mermaid: 'export default { initialize() {}, mermaidAPI: { getDiagramFromText: async () => ({ type: "pie" }) } };',
  };
  const bin = temp();
  fake(
    bin,
    'npm',
    `#!${process.execPath}
const { mkdirSync, writeFileSync } = require('node:fs');
for (const [name, code] of Object.entries(${JSON.stringify(modules)})) {
  mkdirSync('node_modules/' + name, { recursive: true });
  writeFileSync('node_modules/' + name + '/package.json', JSON.stringify({ name, type: 'module', main: 'index.js' }));
  writeFileSync('node_modules/' + name + '/index.js', code);
}
`,
  );
  const r = isolated(fence('mermaid', 'flowchart LR\n  a --> b'), bin);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning.*not parser-checked: .*not JSON/);
});

test('a relative cache folder setting is ignored', () => {
  const home = temp();
  const cwd = temp();
  const env = { PATH: temp(), HOME: home, USERPROFILE: home, XDG_CACHE_HOME: 'rel-cache', LOCALAPPDATA: 'rel-cache' };
  check(fence('mermaid', 'flowchart LR\n  a --> b'), { env, cwd });
  assert.equal(existsSync(join(cwd, 'rel-cache')), false);
  const fallback = WIN ? join(home, 'AppData', 'Local') : join(home, '.cache');
  assert.equal(existsSync(join(fallback, 'dead-agent-skills', 'diagrams-node')), true);
});

test('works from another working directory', { skip: NEEDS_PARSER }, () => {
  const r = check(FIXTURE, { cwd: temp() });
  assert.equal(r.code, 0, r.out);
});

test('leaves no node_modules in the skill folder', () => {
  // The checker runs from a copy of the skill, on a cold cache with a stand-in npm, so a node_modules installed in the
  // real skill folder cannot fail the test and the test cannot pass when nothing was installed.
  const root = temp();
  const copy = join(root, 'diagrams');
  cpSync(join(SKILL, 'scripts'), join(copy, 'scripts'), { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) copyFileSync(join(SKILL, f), join(copy, f));
  mkdirSync(join(root, 'build-feature', 'scripts'), { recursive: true }); // check.mjs imports glance.mjs from here
  copyFileSync(
    join(SKILL, '..', 'build-feature', 'scripts', 'glance.mjs'),
    join(root, 'build-feature', 'scripts', 'glance.mjs'),
  );
  const modules = {
    jsdom: 'export class JSDOM { constructor() { this.window = { document: {} }; } }',
    mermaid: 'export default { initialize() {}, mermaidAPI: { getDiagramFromText: async () => ({ type: "pie" }) } };',
  };
  const script = `#!${process.execPath}
const { mkdirSync, writeFileSync } = require('node:fs');
for (const [name, code] of Object.entries(${JSON.stringify(modules)})) {
  mkdirSync('node_modules/' + name, { recursive: true });
  writeFileSync('node_modules/' + name + '/package.json', JSON.stringify({ name, type: 'module', main: 'index.js' }));
  writeFileSync('node_modules/' + name + '/index.js', code);
}
`;
  const bin = temp();
  fake(bin, 'npm', script); // POSIX: findNpm runs `npm`
  mkdirSync(join(bin, 'node_modules', 'npm', 'bin'), { recursive: true }); // Windows: findNpm runs npm-cli.js beside npm.cmd
  writeFileSync(join(bin, 'npm.cmd'), '');
  writeFileSync(join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'), script);
  const doc = join(temp(), 'doc.md');
  writeFileSync(doc, fence('mermaid', 'flowchart LR\n  a --> b'));
  const cache = temp();
  const before = readdirSync(copy).sort();
  const r = spawnSync(process.execPath, [join(copy, 'scripts', 'check.mjs'), doc, '--root', temp()], {
    encoding: 'utf8',
    env: {
      PATH: bin,
      HOME: cache,
      USERPROFILE: cache,
      XDG_CACHE_HOME: cache,
      LOCALAPPDATA: cache,
      SystemRoot: process.env.SystemRoot,
    },
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out);
  assert.deepEqual(readdirSync(copy).sort(), before);
  assert.doesNotMatch(out, /not parser-checked/);
  assert.equal(existsSync(join(cache, 'dead-agent-skills', 'diagrams-node', 'node_modules', 'mermaid')), true);
});

test('files block: a missing ~ path is a warning for a hand-written block', () => {
  const r = check(fence('files', '~ src/gone.ts\n+ src/new.ts'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning.*block 1.*src\/gone\.ts/);
  assert.doesNotMatch(r.out, /src\/new\.ts/);
});

test("files block: a plan's generated map makes it an error", () => {
  const r = check(plan([1, 'none', '- Modify: `src/gone.ts`']));
  assert.equal(r.code, 1);
  assert.match(r.out, /error.*src\/gone\.ts/);
});

test('files block: a Modify of a file an earlier task creates passes', () => {
  const r = check(plan([1, 'none', '- Create: `src/new.ts`'], [2, 'Task 1', '- Modify: `src/new.ts`']));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^error/m);
});

test('files block: a trailing (note), a comma inside a note and a code span inside a note are not paths', () => {
  const root = temp();
  put(root, 'a.txt', 'b.txt', 'c.txt');
  const files = '- Modify: `a.txt` (trailing), `b.txt` (one, two), `c.txt` (see `nope/x.txt`, `y.txt`)';
  const r = check(plan([1, 'none', files]), { root });
  assert.doesNotMatch(r.out, /no plan map/);
  assert.equal(r.code, 0, r.out);
});

test('files block: a Files item with no backticked path gives "no plan map"', () => {
  const r = check(plan([1, 'none', '- Modify: src/a.ts']));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning.*no plan map/);
});

test('files block: a + path that exists, a malformed line and a backslash path are each reported', () => {
  const root = temp();
  put(root, 'here.txt');
  const r = check(fence('files', '+ here.txt'), { root });
  assert.match(r.out, /block 1.*here\.txt/);
  const bad = check(fence('files', '+ ok.txt\nmove it'), { root });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /block 1.*move it/);
  const slash = check(fence('files', '+ src\\win.txt'), { root });
  assert.equal(slash.code, 1);
  assert.match(slash.out, /block 1.*src\\win\.txt/);
});

const RENDER = 'plugins/flows/skills/diagrams/scripts/render.mjs';
const OUTLINE = 'plugins/flows/skills/diagrams/scripts/outline.mjs';

test('parseFilesBlock reads why, symbols, a symbol move and uses', () => {
  const block = [
    `~ ${RENDER}  draw the overview and cards`,
    '    + overviewMermaid  builds the flowchart text',
    '    ~ listHtml  becomes the file cards',
    '    - planMapHtml',
    '    > treeHtml -> plugins/flows/skills/diagrams/scripts/cards.mjs',
    `+ ${OUTLINE}  tree-sitter outlines`,
    `${RENDER} uses ${OUTLINE}`,
  ].join('\n');
  assert.deepEqual(parseFilesBlock(block), [
    {
      marker: '~',
      path: RENDER,
      why: 'draw the overview and cards',
      symbols: [
        { marker: '+', name: 'overviewMermaid', why: 'builds the flowchart text' },
        { marker: '~', name: 'listHtml', why: 'becomes the file cards' },
        { marker: '-', name: 'planMapHtml' },
        { marker: '>', name: 'treeHtml', to: 'plugins/flows/skills/diagrams/scripts/cards.mjs' },
      ],
      uses: [OUTLINE],
    },
    { marker: '+', path: OUTLINE, why: 'tree-sitter outlines', symbols: [], uses: [] },
  ]);
});

test('a why needs two spaces, so a path with one space is still an error', () => {
  assert.deepEqual(parseFilesBlock('+ new.txt  a why'), [
    { marker: '+', path: 'new.txt', why: 'a why', symbols: [], uses: [] },
  ]);
  const r = check(fence('files', '+ my file.txt'));
  assert.equal(r.code, 1);
  assert.match(r.out, /error.*block 1.*bad files line.*my file\.txt/);
});

test('a fence nested in a list keeps its file lines as files', () => {
  const root = temp();
  put(root, 'b.txt');
  const r = check(`- an item\n\n  \`\`\`files\n  + a.txt\n  ~ b.txt\n      ~ sym\n  \`\`\`\n`, { root });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});

test('a uses line naming a path not in the block is an error', () => {
  const r = check(fence('files', '+ a.txt\n+ b.txt\na.txt uses c.txt'));
  assert.equal(r.code, 1);
  assert.match(r.out, /error.*block 1.*uses names a path not in the block.*c\.txt/);
  const source = check(fence('files', '+ a.txt\nc.txt uses a.txt'));
  assert.equal(source.code, 1);
  assert.match(source.out, /error.*block 1.*uses names a path not in the block.*c\.txt/);
});

test('a ~ file without symbols is a warning', () => {
  const root = temp();
  put(root, 'x.txt');
  const r = check(fence('files', '~ x.txt'), { root });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning.*block 1.*x\.txt.*no symbols/);
  assert.equal(check(fence('files', '~ x.txt\n  ~ f'), { root }).out.trim(), '');
});

test('an old paths-only block still passes', () => {
  const root = temp();
  put(root, 'a.txt', 'b.txt', 'c.txt');
  const r = check(fence('files', '~ a.txt\n- b.txt\n> c.txt -> d.txt\n+ e.txt'), { root });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^error/m);
});

test('an old block whose file lines are all indented still passes', () => {
  const root = temp();
  put(root, 'b.txt');
  assert.deepEqual(parseFilesBlock('  + a.txt\n  ~ b.txt\n      ~ f'), [
    { marker: '+', path: 'a.txt', symbols: [], uses: [] },
    { marker: '~', path: 'b.txt', symbols: [{ marker: '~', name: 'f' }], uses: [] },
  ]);
  const r = check(fence('files', '  + a.txt\n  ~ b.txt'), { root });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^error/m);
});

test("a task's uses naming a path not in the plan's map is an error", () => {
  const root = temp();
  put(root, 'a.txt');
  const r = check(plan([1, 'none', '- Modify: `a.txt`', '', fence('files', '~ a.txt\n  ~ f\na.txt uses c.txt')]), {
    root,
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /error.*block 1.*Task 1.*uses names a path not in the plan's map.*c\.txt/);
});

test("planMap takes a task's files fence", () => {
  const md = plan(
    [1, 'none', '- Modify: `a.txt`', '', fence('files', '~ a.txt  why\n    + f  new\na.txt uses b.txt')],
    [2, 'Task 1', '- Create: `b.txt`'],
  );
  assert.deepEqual(planMap(md), [
    {
      task: 'Task 1: t1',
      marker: '~',
      path: 'a.txt',
      why: 'why',
      symbols: [{ marker: '+', name: 'f', why: 'new' }],
      uses: ['b.txt'],
    },
    { task: 'Task 2: t2', marker: '+', path: 'b.txt', symbols: [], uses: [] },
  ]);
  const root = temp();
  put(root, 'a.txt');
  const r = check(md, { root });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});

test("a task's fence naming a path outside its Files list is an error and the path checks still run", () => {
  const r = check(
    plan([1, 'none', '- Modify: `gone.txt`', '', fence('files', '~ gone.txt\n  ~ f\n~ other.txt\n  ~ g')]),
  );
  assert.equal(r.code, 1);
  assert.match(r.out, /error.*block 1.*Task 1.*other\.txt.*Files list/);
  assert.match(r.out, /error.*Task 1.*gone\.txt does not exist/);
  assert.doesNotMatch(r.out, /warning.*does not exist/);
});

test('a Files bullet wrapped onto an indented line is still one entry', () => {
  const files = '- Modify: `a.txt` (one note)\n  continues the note, naming `nope.txt` and + b.txt';
  const md = plan([1, 'none', files, '', fence('files', '~ a.txt\n    ~ f')]);
  assert.deepEqual(planMap(md), [
    { task: 'Task 1: t1', marker: '~', path: 'a.txt', symbols: [{ marker: '~', name: 'f' }], uses: [] },
  ]);
  const root = temp();
  put(root, 'a.txt');
  const r = check(md, { root });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});

const outline = (rows) => rows.map(([name, kind, line]) => ({ name, kind, line }));

test('outlineFiles lists the declarations of a TS, Rust, C# and Python file', { skip: NEEDS_PARSER }, async () => {
  const outlines = await outlineFiles(['sample.ts', 'sample.rs', 'Sample.cs', 'sample.py'], OUTLINED);
  assert.deepEqual(
    outlines,
    new Map([
      [
        'sample.ts',
        outline([
          ['load', 'function', 1],
          ['save', 'function', 5],
          ['Store', 'class', 7],
          ['Store.get', 'method', 8],
          ['Shape', 'interface', 13],
          ['Shape.area', 'method', 14],
        ]),
      ],
      [
        'sample.rs',
        outline([
          ['Counter', 'struct', 1],
          ['Counter', 'impl', 5],
          ['Counter.bump', 'method', 6],
          ['start', 'function', 12],
          ['tests', 'mod', 17],
          ['tests.bumps', 'function', 21],
        ]),
      ],
      [
        'Sample.cs',
        outline([
          ['Demo', 'namespace', 1],
          ['Demo.Runner', 'class', 3],
          ['Demo.Runner.Run', 'method', 5],
          ['Demo.Runner.Run', 'method', 9],
        ]),
      ],
      [
        'sample.py',
        outline([
          ['load', 'function', 5],
          ['Store', 'class', 9],
          ['Store.size', 'method', 11],
          ['Store.get', 'method', 14],
        ]),
      ],
    ]),
  );
});

test('a C# file-scoped namespace names the declarations after it', { skip: NEEDS_PARSER }, async () => {
  assert.deepEqual(
    await outlineFiles(['Scoped.cs'], OUTLINED),
    new Map([
      [
        'Scoped.cs',
        outline([
          ['Demo', 'namespace', 1],
          ['Demo.Runner', 'class', 3],
          ['Demo.Runner.Run', 'method', 5],
        ]),
      ],
    ]),
  );
});

test('a ~ ../ path outside the root gets no outline', { skip: NEEDS_PARSER }, () => {
  const dir = temp();
  writeFileSync(join(dir, 'outside.ts'), 'export function secret() {}\n');
  mkdirSync(join(dir, 'root'));
  const r = check(fence('files', '~ ../outside.ts\n    + secret'), { root: join(dir, 'root') });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});

test('a .md file has no outline (null)', { skip: NEEDS_PARSER }, async () => {
  assert.deepEqual(await outlineFiles(['README.md'], temp()), new Map([['README.md', null]]));
});

test('a ~, - and > symbol missing from the outline is a warning', { skip: NEEDS_PARSER }, () => {
  const block =
    '~ sample.ts\n    ~ load\n    ~ missing\n- sample.py\n    - Store.gone\n> sample.rs -> moved.rs\n    ~ absent';
  const r = check(fence('files', block), { root: OUTLINED });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning: block 1: ~ sample\.ts: missing not found/);
  assert.match(r.out, /warning: block 1: - sample\.py: Store\.gone not found/);
  assert.match(r.out, /warning: block 1: ~ sample\.rs: absent not found/);
  assert.doesNotMatch(r.out, /load/);
});

test('a + symbol already in the outline is a warning', { skip: NEEDS_PARSER }, () => {
  const r = check(fence('files', '~ sample.ts\n    + get\n    + fresh'), { root: OUTLINED });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning: block 1: \+ sample\.ts: get already exists/);
  assert.doesNotMatch(r.out, /fresh/);
});

test('an overloaded name marks every match', { skip: NEEDS_PARSER }, () => {
  const r = check(fence('files', '~ Sample.cs\n    ~ Run\n    ~ Demo.Runner.Run\n    + Run'), { root: OUTLINED });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'warning: block 1: + Sample.cs: Run already exists');
});

test('a symbol an earlier task adds is not reported missing in a later task', { skip: NEEDS_PARSER }, () => {
  const md = plan(
    [1, 'none', '- Modify: `sample.ts`', '', fence('files', '~ sample.ts\n    + fresh')],
    [2, 'Task 1', '- Modify: `sample.ts`', '', fence('files', '~ sample.ts\n    ~ fresh\n    ~ other')],
  );
  const r = check(md, { root: OUTLINED });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), 'warning: Task 2: t2: ~ sample.ts: other not found');
});

test('no npm gives "not outlined" and exit 0', { skip: WIN }, () => {
  const root = temp();
  put(root, 'a.ts');
  const r = isolated(fence('files', '~ a.ts\n    ~ f'), temp(), root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /warning: not outlined: npm was not found/);
});

test('check.mjs on a doc with only a .md files block installs nothing', () => {
  const root = temp();
  put(root, 'notes.md');
  const r = isolated(fence('files', '~ notes.md\n    ~ Intro'), temp(), root);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});

test('parseDiagrams accepts generated overviews of 3 and 13 files', { skip: NEEDS_PARSER }, async () => {
  const small = parseFilesBlock(
    '~ a/x.ts  why\n    + f\n    > g -> lib/"q".ts\n> a/old.ts -> b/new.ts\n- <c>.md\na/x.ts uses b/new.ts',
  );
  const big = parseFilesBlock(
    [...Array.from({ length: 13 }, (_, i) => `+ d${i % 3}/f${i}.ts`), 'd0/f0.ts uses d1/f1.ts'].join('\n'),
  );
  const results = await parseDiagrams([overviewMermaid(small, 'b1'), overviewMermaid(big, 'p')]);
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true],
    JSON.stringify(results),
  );
});
