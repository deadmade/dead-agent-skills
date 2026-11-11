import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suiteFiles } from './test.mjs';

const REAL = fileURLToPath(new URL('..', import.meta.url));
const WIN = process.platform === 'win32';
const TOML = 'excludes = [\n  "plugins/vendored/**",\n]\n';
// Each fake logs `<cwd> :: <args> :: <UV_PROJECT_ENVIRONMENT> <PYTHONDONTWRITEBYTECODE>` and fails when `fail` is in its cwd.
const SH =
  '#!/bin/sh\necho "$(pwd) :: $* :: $UV_PROJECT_ENVIRONMENT $PYTHONDONTWRITEBYTECODE" >> "$FAKE_LOG"\n[ -f fail ] && exit 1\nexit 0\n';
const CMD =
  '@echo off\r\n>> "%FAKE_LOG%" echo %cd% :: %* :: %UV_PROJECT_ENVIRONMENT% %PYTHONDONTWRITEBYTECODE%\r\nif exist fail exit /b 1\r\nexit /b 0\r\n';
// The fake claude logs `<cwd> :: <args> :: <its hooks/ and tests/ test files>` and fails when `fail` is in its cwd.
const CLAUDE_SH =
  '#!/bin/sh\nfor f in hooks/*.test.ts* tests/*.test.ts*; do [ -f "$f" ] && files="$files $f"; done\necho "$(pwd) :: $* ::$files" >> "$FAKE_LOG"\n[ -f fail ] && exit 1\nexit 0\n';
const CLAUDE_CMD =
  '@echo off\r\nset files=\r\nfor %%f in (hooks\\*.test.ts* tests\\*.test.ts*) do call set files=%%files%% %%f\r\n>> "%FAKE_LOG%" echo %cd% :: %* ::%files%\r\nif exist fail exit /b 1\r\nexit /b 0\r\n';
const REPO_STUB = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, 'check-repo :: ' + process.argv.slice(2).join(' ') + '\\n');
process.exit(Number(process.env.REPO_EXIT ?? 0));
`;
const BUILD_STUB = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, 'build :: ' + process.argv.slice(2).join(' ') + '\\n');
`;

// A checkout with a space in its path: the door itself, the installer modules proc.ts loads, stubs for what it starts,
// and fake tools in their own folder, which are the only thing on the child's PATH.
function door(t, { modules = true, tools = ['uv', 'cargo'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'door root '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  mkdirSync(join(root, 'scripts'));
  copyFileSync(join(REAL, 'scripts/test.mjs'), join(root, 'scripts/test.mjs'));
  copyFileSync(join(REAL, 'package.json'), join(root, 'package.json'));
  cpSync(join(REAL, 'tools/installer'), join(root, 'tools/installer'), {
    recursive: true,
    filter: (src) => !/\.test\.[^/\\]+$/.test(src),
  });
  put('scripts/check-repo.mjs', REPO_STUB);
  put('tools/harness-compiler/src/cli.ts', BUILD_STUB);
  mkdirSync(join(root, '.claude-plugin'));
  if (modules) mkdirSync(join(root, 'node_modules'));
  put('treefmt.toml', TOML);
  put('plugins/catalog.json', '[]');
  put('plugins/opt-in/headroom-trim/server/tests/test_x.py', '');

  const bin = join(root, 'fake tools');
  const logFile = join(root, 'log.txt');
  mkdirSync(bin);
  const fake = (name, sh = SH, cmd = CMD) =>
    writeFileSync(join(bin, WIN ? `${name}.cmd` : name), WIN ? cmd : sh, { mode: 0o755 });
  for (const name of tools) fake(name);

  const run = (args, extra = {}) => {
    writeFileSync(logFile, '');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    delete env.MSYSTEM;
    delete env.UV_PROJECT_ENVIRONMENT;
    const r = spawnSync(process.execPath, [join(root, 'scripts/test.mjs'), ...args], {
      cwd: join(root, 'scripts'),
      env: { ...env, PATH: bin, FAKE_LOG: logFile, ...extra },
      encoding: 'utf8',
    });
    // cmd's %* keeps the quotes.
    const log = readFileSync(logFile, 'utf8').replaceAll('"', '').split(/\r?\n/).filter(Boolean);
    return { status: r.status, out: r.stdout, err: r.stderr, log };
  };
  return { root, fake, put, run };
}

test('a failing suite does not stop the next, and fails the run', (t) => {
  const d = door(t);
  const r = d.run(['repo', 'python'], { REPO_EXIT: '1' });
  assert.equal(r.status, 1);
  assert.equal(r.log.length, 2);
  assert.match(r.log[0], /^check-repo ::/);
  assert.match(r.log[1], / :: run --locked python -m unittest discover -s tests :: /);
  assert.match(r.out, /^repo +failed/m);
  assert.match(r.out, /^python +passed/m);
  if (WIN) return;
  // A killed child and one that cannot start have no exit status.
  d.fake('uv', '#!/bin/sh\nkill -9 $$\n');
  d.fake('cargo', '#!/nonexistent/sh\n');
  const k = d.run(['python', 'rust']);
  assert.equal(k.status, 1);
  const [py, rs] = k.out.trimEnd().split('\n').slice(-2);
  assert.match(py, /^python +failed +killed by SIGKILL$/);
  assert.match(rs, /^rust +failed +\S/);
});

test('a missing tool is NOT RUN, which fails only under --strict; a missing node_modules fails repo and node', (t) => {
  const d = door(t, { tools: [] });
  const r = d.run(['python', 'mods']);
  assert.equal(r.status, 0);
  assert.match(r.out, /^python +NOT RUN +uv not on PATH$/m);
  assert.match(r.out, /^mods +NOT RUN +claude not on PATH$/m);
  assert.equal(d.run(['--strict', 'python']).status, 1);

  const bare = door(t, { modules: false });
  const m = bare.run(['repo', 'node']);
  assert.equal(m.status, 1);
  assert.match(m.out, /^repo +failed +node_modules missing: run npm ci$/m);
  assert.match(m.out, /^node +failed +node_modules missing: run npm ci$/m);
  assert.deepEqual(m.log, []);
});

test('under Git Bash the rust suite refuses to run cargo', (t) => {
  const r = door(t).run(['rust'], { MSYSTEM: 'MINGW64' });
  assert.equal(r.status, 0);
  assert.match(r.out, /^rust +NOT RUN +Git Bash \(MSYSTEM is set\): run cargo from PowerShell$/m);
  assert.deepEqual(r.log, []);
});

test('the rust suite builds the fake, tests the packages together, then each one', (t) => {
  const d = door(t);
  const cargo = (args) => d.run(args).log.map((l) => l.split(' :: ')[1]);
  const build = 'build --locked -p web-mcp --bin fake-agent-browser';
  const test = 'test --locked --no-fail-fast';
  assert.deepEqual(cargo(['rust', '--packages', 'web-mcp,ado-mcp', '--each-package']), [
    build,
    `${test} -p web-mcp -p ado-mcp`,
    `${test} -p web-mcp`,
    `${test} -p ado-mcp`,
  ]);
  assert.deepEqual(cargo(['rust', '--packages', 'ado-mcp', '--each-package']), [`${test} -p ado-mcp`]);
  assert.deepEqual(cargo(['rust']), [build, `${test} --workspace`]);
  // Every command runs, and one failing fails the suite.
  writeFileSync(join(d.root, 'fail'), '');
  const f = d.run(['rust', '--packages', 'web-mcp,ado-mcp', '--each-package']);
  assert.equal(f.status, 1);
  assert.equal(f.log.length, 4);
});

test('the python suite runs in the server folder with its venv outside the tree', (t) => {
  const uv = (d, extra) => {
    const [cwd, args, env] = d.run(['python'], extra).log[0].split(' :: ');
    return { cwd: cwd.replaceAll('\\', '/'), args, venv: env.slice(0, env.lastIndexOf(' ')), bytecode: env.slice(-1) };
  };
  const d = door(t);
  const a = uv(d);
  assert.ok(a.cwd.endsWith('headroom-trim/server'));
  assert.equal(a.args, 'run --locked python -m unittest discover -s tests');
  assert.ok(!a.venv.startsWith(d.root));
  assert.notEqual(a.venv, uv(door(t)).venv);
  assert.equal(a.bytecode, '1');
  const set = join(d.root, 'my venv');
  assert.equal(uv(d, { UV_PROJECT_ENVIRONMENT: set }).venv, set);
});

test('the mods suite tests each package in a temp copy with its tests copied in', (t) => {
  const d = door(t, { tools: [] });
  d.fake('claude', CLAUDE_SH, CLAUDE_CMD);
  d.put(
    'plugins/catalog.json',
    JSON.stringify([
      { name: 'bad', source: 'plugins/bad' },
      { name: 'good', source: 'plugins/good' },
    ]),
  );
  for (const f of [
    'plugins/bad/hooks/b.test.tsx',
    'plugins/good/hooks/a.test.ts',
    'plugins/orphan/hooks/c.test.ts',
    '.claude-plugin/bad/fail',
    '.claude-plugin/good/hooks/register.tsx',
  ])
    d.put(f, '');
  const tree = () => readdirSync(join(d.root, '.claude-plugin'), { recursive: true }).sort();
  const before = tree();

  const r = d.run(['mods']);
  assert.equal(r.status, 1);
  // The first line is the native build, which mods needs without repo.
  const runs = r.log.slice(1).map((l) => l.replaceAll('\\', '/').split(' :: '));
  assert.equal(runs.length, 2);
  for (const [cwd, args] of runs) {
    assert.equal(args, 'plugin test .');
    assert.ok(!cwd.startsWith(d.root.replaceAll('\\', '/')));
    assert.ok(!existsSync(cwd));
  }
  const [bad, good] = runs;
  assert.match(bad[0], /\/mods-bad-/);
  assert.equal(bad[2], 'hooks/b.test.tsx');
  assert.match(good[0], /\/mods-good-/);
  assert.equal(good[2], 'hooks/a.test.ts');
  assert.match(r.out + r.err, /^plugins\/orphan\/hooks\/c\.test\.ts: no catalog plugin holds this test$/m);
  assert.deepEqual(tree(), before);
  assert.match(r.out, /^mods +failed/m);
});

test('without repo, the door builds the native trees before mods', (t) => {
  const d = door(t, { tools: ['claude'] });
  const m = d.run(['mods']);
  assert.equal(m.status, 0);
  assert.deepEqual(m.log, ['build :: build']);
  assert.match(m.out, /^mods +passed/m);
  const r = d.run(['repo', 'mods']);
  assert.equal(r.status, 0);
  assert.equal(r.log.length, 1);
  assert.match(r.log[0], /^check-repo ::/);
});

test('usage errors exit 2 and run nothing', (t) => {
  const d = door(t);
  for (const args of [['lint'], ['--each-package'], ['--packages']]) {
    const r = d.run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.deepEqual(r.log, []);
  }
});

test('--list prints each command and runs nothing', (t) => {
  const r = door(t).run(['--list', 'node', 'rust']);
  assert.equal(r.status, 0);
  assert.match(r.out, /^node: .*--test-timeout=300000 .*--test-coverage-lines=84/m);
  assert.match(r.out, /^node: .* tools\/harness-compiler\/src\/cli\.ts build$/m);
  assert.match(r.out, /^rust: .*cargo(\.cmd)? build --locked -p web-mcp --bin fake-agent-browser$/m);
  assert.match(r.out, /^rust: .*cargo(\.cmd)? test --locked --no-fail-fast --workspace$/m);
  assert.deepEqual(r.log, []);
});

test("suiteFiles picks each suite's files and skips vendored ones", (t) => {
  const root = mkdtempSync(join(tmpdir(), 'door root '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = [
    'scripts/a.test.mjs',
    'tools/x/b.test.ts',
    'plugins/p/hooks/c.test.mjs',
    'plugins/p/hooks/d.test.ts',
    'plugins/opt-in/headroom-trim/server/tests/test_x.py',
    'plugins/vendored/e.test.mjs',
    'tools/x/f.test.js',
    'plugins/p/g.test.cjs',
    'tools/x/node_modules/y.test.mjs',
    'tools/x/target/z.test.mjs',
  ];
  for (const f of files) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), '');
  }
  const expected = {
    node: ['plugins/p/hooks/c.test.mjs', 'scripts/a.test.mjs', 'tools/x/b.test.ts'],
    mods: ['plugins/p/hooks/d.test.ts'],
    python: ['plugins/opt-in/headroom-trim/server/tests/test_x.py'],
  };
  writeFileSync(join(root, 'treefmt.toml'), TOML);
  assert.deepEqual(suiteFiles(root), expected);
  // A Windows checkout may have CRLF.
  writeFileSync(join(root, 'treefmt.toml'), TOML.replaceAll('\n', '\r\n'));
  assert.deepEqual(suiteFiles(root), expected);
});
