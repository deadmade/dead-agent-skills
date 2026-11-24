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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutProblems, realTool, suiteFiles } from './test.mjs';
import { which } from '../tools/installer/system/proc.ts';

const REAL = fileURLToPath(new URL('..', import.meta.url));
const WIN = process.platform === 'win32';
const TOML = 'excludes = [\n  "plugins/vendored/**",\n]\n';
// Each fake logs `<cwd> :: <args> :: <UV_PROJECT_ENVIRONMENT> <PYTHONDONTWRITEBYTECODE> :: <WEB_MCP_AGENT_BROWSER>` and
// fails when `fail` is in its cwd.
const SH =
  '#!/bin/sh\necho "$(pwd) :: $* :: $UV_PROJECT_ENVIRONMENT $PYTHONDONTWRITEBYTECODE :: $WEB_MCP_AGENT_BROWSER" >> "$FAKE_LOG"\n[ -f fail ] && exit 1\nexit 0\n';
const CMD =
  '@echo off\r\n>> "%FAKE_LOG%" echo %cd% :: %* :: %UV_PROJECT_ENVIRONMENT% %PYTHONDONTWRITEBYTECODE% :: %WEB_MCP_AGENT_BROWSER%\r\nif exist fail exit /b 1\r\nexit /b 0\r\n';
// The fake claude logs `<cwd> :: <args> :: <its hooks/ and tests/ test files>` and fails when `fail` is in its cwd.
// The cmd loop variable is %%x: cmd would also expand a %%f inside %%files%%.
const CLAUDE_SH =
  '#!/bin/sh\nfor f in hooks/*.test.ts* tests/*.test.ts*; do [ -f "$f" ] && files="$files $f"; done\necho "$(pwd) :: $* ::$files" >> "$FAKE_LOG"\n[ -f fail ] && exit 1\nexit 0\n';
const CLAUDE_CMD =
  '@echo off\r\nset files=\r\nfor %%x in (hooks\\*.test.ts* tests\\*.test.ts*) do call set files=%%files%% %%x\r\n>> "%FAKE_LOG%" echo %cd% :: %* ::%files%\r\nif exist fail exit /b 1\r\nexit /b 0\r\n';
const REPO_STUB = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, 'check-repo :: ' + process.argv.slice(2).join(' ') + '\\n');
process.exit(Number(process.env.REPO_EXIT ?? 0));
`;
const BUILD_STUB = `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, 'build :: ' + process.argv.slice(2).join(' ') + '\\n');
`;

// A checkout with a space in its path: the door itself, the installer modules proc.ts loads, stubs for what it starts,
// and fake tools in their own folder, which are the only thing on the child's PATH. No agent-browser, unless a run
// sets WEB_MCP_AGENT_BROWSER or CLAUDE_CONFIG_DIR.
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

  const run = (args, extra = {}, script = join(root, 'scripts/test.mjs')) => {
    writeFileSync(logFile, '');
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== 'PATH'));
    delete env.MSYSTEM;
    delete env.UV_PROJECT_ENVIRONMENT;
    delete env.WEB_MCP_AGENT_BROWSER;
    env.CLAUDE_CONFIG_DIR = join(root, 'claude config');
    // Set by node --test, it makes a nested node --test skip its files.
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [script, ...args], {
      cwd: join(root, 'scripts'),
      env: { ...env, PATH: bin, FAKE_LOG: logFile, ...extra },
      encoding: 'utf8',
    });
    // cmd's %* keeps the quotes.
    const log = readFileSync(logFile, 'utf8').replaceAll('"', '').split(/\r?\n/).filter(Boolean);
    return { status: r.status, out: r.stdout, err: r.stderr, log };
  };
  // A file standing in for agent-browser.
  const agentBrowser = join(root, 'agent-browser');
  writeFileSync(agentBrowser, '');
  return { root, fake, put, run, agentBrowser };
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
  assert.deepEqual(d.run(['--strict', 'repo']).log, ['check-repo :: --strict']);

  const bare = door(t, { modules: false });
  const m = bare.run(['repo', 'node']);
  assert.equal(m.status, 1);
  assert.match(m.out, /^repo +failed +node_modules missing: run npm ci$/m);
  assert.match(m.out, /^node +failed +node_modules missing: run npm ci$/m);
  assert.deepEqual(m.log, []);
  bare.fake('claude', CLAUDE_SH, CLAUDE_CMD);
  assert.match(bare.run(['mods']).out, /^mods +NOT RUN +node_modules missing: run npm ci$/m);
});

test('started through a symlinked folder, the door still runs its suites', (t) => {
  const d = door(t);
  const outside = mkdtempSync(join(tmpdir(), 'door link '));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const link = join(outside, 'checkout');
  symlinkSync(d.root, link, WIN ? 'junction' : 'dir');
  const r = d.run(['repo'], {}, join(link, 'scripts/test.mjs'));
  assert.equal(r.status, 0);
  assert.match(r.out, /^repo +passed/m);
  assert.match(r.log[0], /^check-repo ::/);
});

test('under Git Bash the rust suite refuses to run cargo', (t) => {
  const r = door(t).run(['rust'], { MSYSTEM: 'MINGW64' });
  assert.equal(r.status, 0);
  assert.match(r.out, /^rust +NOT RUN +Git Bash \(MSYSTEM is set\): run cargo from PowerShell$/m);
  assert.deepEqual(r.log, []);
});

test('the rust suite builds the fake, tests the packages together, then each one', (t) => {
  const d = door(t);
  const cargo = (args) => d.run(args, { WEB_MCP_AGENT_BROWSER: d.agentBrowser }).log.map((l) => l.split(' :: ')[1]);
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
  const f = d.run(['rust', '--packages', 'web-mcp,ado-mcp', '--each-package'], {
    WEB_MCP_AGENT_BROWSER: d.agentBrowser,
  });
  assert.equal(f.status, 1);
  assert.equal(f.log.length, 4);
});

test('cargo gets the agent-browser it found, the installer copy when nothing is set', (t) => {
  const d = door(t);
  const config = join(d.root, 'claude config');
  const copy = join(config, 'bin', WIN ? 'agent-browser.exe' : 'agent-browser');
  mkdirSync(dirname(copy), { recursive: true });
  writeFileSync(copy, '');
  const passed = (extra) => d.run(['rust', '--packages', 'ado-mcp'], extra).log.map((l) => l.split(' :: ')[3]);
  assert.deepEqual(passed({}), [copy]);
  assert.deepEqual(passed({ WEB_MCP_AGENT_BROWSER: d.agentBrowser }), [d.agentBrowser]);
});

test('without agent-browser only the packages that drive it are NOT RUN', (t) => {
  const d = door(t);
  const run = (args) => {
    const r = d.run(args);
    return { status: r.status, out: r.out, cargo: r.log.map((l) => l.split(' :: ')[1]) };
  };
  const test = 'test --locked --no-fail-fast';
  const all = run(['rust']);
  assert.deepEqual(all.cargo, [`${test} --workspace --exclude web-mcp --exclude browser-core --exclude http-runner`]);
  assert.match(all.out, /^rust +NOT RUN +web-mcp, browser-core, http-runner: agent-browser not found$/m);
  assert.equal(all.status, 0);
  const some = run(['rust', '--packages', 'web-mcp,ado-mcp,browser-core', '--each-package']);
  assert.deepEqual(some.cargo, [`${test} -p ado-mcp`]);
  assert.match(some.out, /^rust +NOT RUN +web-mcp, browser-core: agent-browser not found$/m);
  assert.equal(run(['--strict', 'rust', '--packages', 'http-runner']).status, 1);
  // A path that names no file counts as missing.
  assert.deepEqual(d.run(['rust', '--packages', 'web-mcp'], { WEB_MCP_AGENT_BROWSER: join(d.root, 'none') }).log, []);
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
  // Without the orphan only the copied `fail` file can fail the run, so a package that is not copied in passes.
  rmSync(join(d.root, 'plugins/orphan'), { recursive: true });
  assert.equal(d.run(['mods']).status, 1);
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

test('without repo, the real suite builds the native trees first', (t) => {
  const d = door(t);
  d.put('plugins/x/a.real.test.mjs', '');
  assert.deepEqual(d.run(['real']).log, ['build :: build']);
  const r = d.run(['repo', 'real']);
  assert.equal(r.log.length, 1);
  assert.match(r.log[0], /^check-repo ::/);
});

test('the real suite runs the gating real tests, then the installer tests under the coverage floor', (t) => {
  const d = door(t, { tools: ['claude', 'codex'] });
  d.put('plugins/x/a.real.test.mjs', '');
  d.put('plugins/x/b.test.mjs', '');
  d.put('tools/installer/c.test.ts', '');
  d.put('tools/installer/d.real.test.ts', '');
  for (const name of ['web-mcp', 'http-runner', 'ado-mcp']) d.put(`target/debug/${WIN ? `${name}.exe` : name}`, '');
  const files = suiteFiles(d.root);
  assert.deepEqual(files.real, ['plugins/x/a.real.test.mjs', 'tools/installer/d.real.test.ts']);
  assert.deepEqual(files.node, ['plugins/x/b.test.mjs', 'tools/installer/c.test.ts']);
  const r = d.run(['--list', 'node', 'real']);
  const [own, installer] = r.out.split('\n').filter((l) => l.startsWith('real: ') && !l.endsWith(' build'));
  assert.ok(own.endsWith(' plugins/x/a.real.test.mjs') && !own.includes('--test-coverage-lines'));
  assert.ok(installer.includes('--test-coverage-lines=84'));
  assert.ok(installer.endsWith(' tools/installer/d.real.test.ts tools/installer/c.test.ts'));
  assert.doesNotMatch(r.out, /^node: .*--test-coverage-lines/m);
  assert.doesNotMatch(r.out, /^node: .*a[.]real[.]test/m);
});

test('without codex or a debug build the installer tests are NOT RUN, after the gating real tests ran', (t) => {
  const d = door(t, { tools: ['claude'] });
  d.put(
    'plugins/x/a.real.test.mjs',
    "import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.FAKE_LOG, 'a ran\\n');\n",
  );
  d.put('tools/installer/c.test.ts', '');
  const listed = d.run(['--list', 'real']).out;
  assert.match(listed, /^real: .* plugins\/x\/a\.real\.test\.mjs$/m);
  assert.match(listed, /^real: NOT RUN installer tests: codex not found$/m);
  const r = d.run(['real']);
  assert.equal(r.status, 0);
  assert.ok(r.log.includes('a ran'));
  assert.match(r.out, /^real +NOT RUN +installer tests: codex not found$/m);
  assert.equal(d.run(['--strict', 'real']).status, 1);
  d.fake('codex');
  assert.match(
    d.run(['--list', 'real']).out,
    /^real: NOT RUN installer tests: web-mcp not found: run cargo build --locked -p web-mcp -p http-runner -p ado-mcp$/m,
  );
});

test('realTool returns the path of a tool on PATH', (t) => {
  assert.equal(realTool(t, 'node'), which('node'));
});

test('realTool prefers an existing candidate', (t) => {
  assert.equal(realTool(t, 'nope', { candidates: [process.execPath] }), process.execPath);
});

test('realTool skips a missing tool without strict', () => {
  const skipped = [];
  assert.equal(realTool({ skip: (m) => skipped.push(m) }, 'no-such-tool-xyz', { strict: false }), undefined);
  assert.match(skipped.join(), /no-such-tool-xyz/);
});

test('realTool throws for a missing tool under strict', (t) => {
  assert.throws(() => realTool(t, 'no-such-tool-xyz', { strict: true }), /no-such-tool-xyz not found/);
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
  const d = door(t);
  const r = d.run(['--list', 'node', 'rust'], { WEB_MCP_AGENT_BROWSER: d.agentBrowser });
  assert.equal(r.status, 0);
  assert.match(r.out, /^node: .*--test-timeout=300000 /m);
  assert.doesNotMatch(r.out, /^node: .*--test-coverage-lines/m);
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
    real: [],
    mods: ['plugins/p/hooks/d.test.ts'],
    python: ['plugins/opt-in/headroom-trim/server/tests/test_x.py'],
  };
  writeFileSync(join(root, 'treefmt.toml'), TOML);
  assert.deepEqual(suiteFiles(root), expected);
  // A Windows checkout may have CRLF.
  writeFileSync(join(root, 'treefmt.toml'), TOML.replaceAll('\n', '\r\n'));
  assert.deepEqual(suiteFiles(root), expected);
});

test('layoutProblems names each tracked test no suite runs', (t) => {
  const d = door(t);
  d.put('scripts/a.test.mjs', '');
  const tracked = [
    'scripts/a.test.mjs',
    'docs/b.test.mjs',
    'scripts/c_test.py',
    'plugins/vendored/d.test.cjs',
    'plugins/opt-in/headroom-trim/server/tests/test_x.py',
    'scripts/a.mjs',
  ];
  assert.deepEqual(layoutProblems(d.root, tracked), [
    'docs/b.test.mjs: no suite in scripts/test.mjs runs this test',
    'scripts/c_test.py: no suite in scripts/test.mjs runs this test',
  ]);
});
