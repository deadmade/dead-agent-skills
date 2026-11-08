import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(SKILL, 'scripts', 'check.mjs');
const FIXTURE = readFileSync(join(SKILL, 'tests', 'fixtures', 'api-mcp-diagrams.md'), 'utf8');
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

// The first run installs the parser into the user's cache; offline it cannot, and the tests that need it stand down.
const READY = !check(fence('mermaid', 'flowchart LR\n  a --> b')).out.includes('not parser-checked');
const NEEDS_PARSER = READY ? false : 'the parser cannot be installed (offline)';

// A checker run whose cache is an empty folder and whose PATH holds only `bin`.
function isolated(markdown, bin) {
  const cache = temp();
  return check(markdown, {
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

test('leaves no node_modules in the skill folder', { skip: NEEDS_PARSER }, () => {
  check(fence('mermaid', 'flowchart LR\n  a --> b'));
  assert.equal(existsSync(join(SKILL, 'node_modules')), false);
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
