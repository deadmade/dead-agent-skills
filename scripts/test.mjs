// The one list of what runs: each suite, its test files and how it starts. It uses only the Node standard library and
// tools/installer/system/proc.ts, because crates.yml runs it without `npm ci`.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSync, which } from '../tools/installer/system/proc.ts';

// The extensions are named because, given no paths, `node --test` also runs .test.cjs, the stale .test.js that
// prepack's tsc writes, and target/.
const GLOBS = {
  node: ['{scripts,tools}/**/*.test.{ts,mjs}', 'plugins/**/*.test.mjs'], // not *.real.test.*, which only `real` runs
  real: ['plugins/**/*.real.test.mjs', 'tools/**/*.real.test.ts'],
  mods: ['plugins/**/*.test.{ts,tsx}'],
  python: ['plugins/opt-in/headroom-trim/server/tests/test*.py'],
};

// Whether a repo-relative `/` path is vendored: treefmt.toml's excludes name every vendored path.
function vendoredPath(root) {
  const toml = readFileSync(join(root, 'treefmt.toml'), 'utf8').replaceAll('\r\n', '\n');
  const excludes = /^excludes = \[([\s\S]*?)^\]/m.exec(toml);
  if (!excludes) throw new Error('treefmt.toml has no excludes list');
  const globs = [...excludes[1].matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
  return (p) => globs.some((g) => posix.matchesGlob(p, g));
}

// Sorted repo-relative `/` paths. `**` does not skip node_modules, so exclude lists them.
export function suiteFiles(root) {
  const vendored = vendoredPath(root);
  const files = (globs, keep = () => true) =>
    globSync(globs, { cwd: root, exclude: ['**/node_modules/**', '**/target/**'] })
      .map((p) => p.replaceAll('\\', '/'))
      .filter((p) => !vendored(p) && keep(p))
      .sort();
  const notReal = (p) => !/\.real\.test\./.test(posix.basename(p));
  return {
    node: files(GLOBS.node, notReal),
    real: files(GLOBS.real),
    mods: files(GLOBS.mods),
    python: files(GLOBS.python),
  };
}

export const isTestName = (path) => /\.test\.|^test_.*\.py$|_test\.py$/.test(posix.basename(path));

// One problem per tracked first-party test no suite runs.
export function layoutProblems(root, tracked) {
  const vendored = vendoredPath(root);
  const run = new Set(Object.values(suiteFiles(root)).flat());
  return tracked
    .filter((p) => isTestName(p) && !vendored(p) && !run.has(p))
    .map((p) => `${p}: no suite in scripts/test.mjs runs this test`);
}

const NODE_FLAGS = [
  '--test',
  '--test-timeout=300000',
  '--experimental-test-coverage',
  '--test-coverage-include=tools/installer/**',
  '--test-coverage-exclude=tools/installer/**/*.test.ts',
];
const COVERAGE_FLOOR = '--test-coverage-lines=84';
const TREES = { file: process.execPath, args: ['tools/harness-compiler/src/cli.ts', 'build'] };

const isInstaller = (path) => path.startsWith('tools/installer/');
const findTool = (name, candidates = []) => candidates.find((c) => existsSync(c)) ?? which(name);

// The packages whose tests drive the real agent-browser, and where they find it (real_agent_browser in browser-core):
// WEB_MCP_AGENT_BROWSER if set, else the installer's copy.
const BROWSER_PACKAGES = ['web-mcp', 'browser-core', 'http-runner'];
function agentBrowser() {
  const set = process.env.WEB_MCP_AGENT_BROWSER;
  const exe = process.platform === 'win32' ? 'agent-browser.exe' : 'agent-browser';
  const path = set || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'bin', exe);
  return existsSync(path) ? path : undefined;
}

// What the installer's end-to-end test needs, and why it is missing: claude, codex and this checkout's debug builds.
export const BUILD = 'run cargo build --locked -p web-mcp -p http-runner -p ado-mcp';
export const debugBuild = (root, name) =>
  join(root, 'target', 'debug', process.platform === 'win32' ? `${name}.exe` : name);
function installerToolMissing(root) {
  for (const name of ['claude', 'codex']) if (!findTool(name)) return `${name} not found`;
  for (const name of ['web-mcp', 'http-runner', 'ado-mcp'])
    if (!findTool(name, [debugBuild(root, name)])) return `${name} not found: ${BUILD}`;
}

// A real tool for a test: the first existing candidate, else the one on PATH, else a failure under strict (the door's
// --strict sets DEAD_SKILLS_STRICT) and a skip otherwise.
export function realTool(t, name, { candidates = [], strict = process.env.DEAD_SKILLS_STRICT === '1' } = {}) {
  const found = findTool(name, candidates);
  if (found) return found;
  if (strict) throw new Error(`${name} not found`);
  t.skip(`${name} not found`);
}

// A loopback port nothing listens on right now.
export const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer()
      .once('error', reject)
      .listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
  });

// Copies a built tree with headroom-trim's port (47811, the developer's own trim server) moved to a free one in its
// hooks.json files, and throws when any other file still names 47811. Returns the port.
export async function portCopy(from, to) {
  cpSync(from, to, { recursive: true });
  const port = await freePort();
  const files = readdirSync(to, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
  for (const f of files.filter((e) => e.name === 'hooks.json')) {
    const file = join(f.parentPath, f.name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('47811', String(port)));
  }
  for (const f of files)
    if (readFileSync(join(f.parentPath, f.name), 'utf8').includes('47811'))
      throw new Error(`${join(f.parentPath, f.name)} still names the developer's port`);
  return port;
}

// Each suite gives { commands, fail } (fail: why it cannot start) or { notRun } (why it is skipped).
// A command is { file, args, cwd (relative to the root), env }, or { list, run } when it is more than one program start:
// `list` is what --list prints and `run` returns the status of what it ran, or { notRun } when it is skipped.
const SUITES = {
  repo: ({ modules, strict }) => ({
    commands: [{ file: process.execPath, args: ['scripts/check-repo.mjs', ...(strict ? ['--strict'] : [])] }],
    fail: modules,
  }),
  node: ({ root, modules }) => {
    const files = suiteFiles(root).node;
    return {
      commands: [{ file: process.execPath, args: [...NODE_FLAGS, ...files] }],
      fail: modules ?? (files.length ? undefined : 'node: no test files'),
    };
  },
  // The real tests that gate themselves; the installer's end-to-end test is the installer suite's.
  real: ({ root, modules }) => {
    const own = suiteFiles(root).real.filter((p) => !isInstaller(p));
    return {
      commands: [{ file: process.execPath, args: [...NODE_FLAGS, ...own] }],
      fail: modules ?? (own.length ? undefined : 'real: no test files'),
    };
  },
  // The installer's tests with its end-to-end run, which hold the coverage floor: without claude, codex or a debug
  // build the floor would fail for a skipped run, so the suite is NOT RUN instead.
  installer: ({ root, modules }) => {
    const { node, real } = suiteFiles(root);
    const files = [...real.filter(isInstaller), ...node.filter(isInstaller)];
    const missing = !modules && installerToolMissing(root);
    if (missing) return { notRun: missing };
    return {
      commands: [{ file: process.execPath, args: [...NODE_FLAGS, COVERAGE_FLOOR, ...files] }],
      fail: modules ?? (files.length ? undefined : 'installer: no test files'),
    };
  },
  mods: ({ root, modules }) => {
    if (modules) return { notRun: modules };
    const claude = which('claude');
    if (!claude) return { notRun: 'claude not on PATH' };
    const catalog = JSON.parse(readFileSync(join(root, 'plugins/catalog.json'), 'utf8'));
    const files = suiteFiles(root).mods;
    const orphans = new Set(files);
    const commands = [];
    // A url source (atlassian) has no folder.
    for (const { name, source } of catalog.filter((p) => typeof p.source === 'string')) {
      const mine = files.filter((f) => f.startsWith(`${source}/`));
      for (const f of mine) orphans.delete(f);
      if (!mine.length) continue;
      commands.push({
        list: `(in a copy of .claude-plugin/${name}, with ${mine.join(' ')}) claude plugin test .`,
        // A copy, so .claude-plugin/ never holds a test file.
        run: () => {
          const copy = mkdtempSync(join(tmpdir(), `mods-${name}-`));
          try {
            cpSync(join(root, '.claude-plugin', name), copy, { recursive: true });
            for (const f of mine) {
              const to = join(copy, f.slice(source.length + 1));
              mkdirSync(dirname(to), { recursive: true });
              copyFileSync(join(root, f), to);
            }
            return startSync(claude, ['plugin', 'test', '.'], { cwd: copy, stdio: 'inherit' });
          } catch (error) {
            // A copy that fails, such as a package not built, fails mods and shows its reason, not the door.
            return { status: null, error };
          } finally {
            // A file still held on Windows must not throw out of the door and take the later suites with it.
            try {
              rmSync(copy, { recursive: true, force: true, maxRetries: 3 });
            } catch (error) {
              console.error(`mods: could not remove ${copy}: ${error.message}`);
            }
          }
        },
      });
    }
    for (const f of orphans) {
      const message = `${f}: no catalog plugin holds this test`;
      commands.push({
        list: message,
        run: () => {
          console.error(message);
          return { status: 1 };
        },
      });
    }
    return { commands };
  },
  python: ({ root }) => {
    const file = which('uv');
    if (!file) return { notRun: 'uv not on PATH' };
    // server/ ships as a resource, so the venv and .pyc files stay out of the tree, one venv per checkout.
    const venv = join(
      tmpdir(),
      `dead-agent-skills-trim-venv-${createHash('sha256').update(root).digest('hex').slice(0, 8)}`,
    );
    return {
      commands: [
        {
          file,
          args: ['run', '--locked', 'python', '-m', 'unittest', 'discover', '-s', 'tests'],
          cwd: 'plugins/opt-in/headroom-trim/server',
          env: {
            ...process.env,
            UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || venv,
            PYTHONDONTWRITEBYTECODE: '1',
          },
        },
      ],
    };
  },
  rust: ({ packages, each }) => {
    const file = which('cargo');
    if (!file) return { notRun: 'cargo not on PATH' };
    // Git Bash's `link` shadows MSVC's.
    if (process.env.MSYSTEM) return { notRun: 'Git Bash (MSYSTEM is set): run cargo from PowerShell' };
    const browser = agentBrowser();
    const env = browser && { ...process.env, WEB_MCP_AGENT_BROWSER: browser };
    const test = (...select) => ({ file, args: ['test', '--locked', '--no-fail-fast', ...select], env });
    // Each package alone only builds its tests, so a feature another one turns on can't hide; the joint run ran them.
    const build = (p) => ({ file, args: ['test', '--locked', '--no-run', '-p', p], env });
    const select = (p) => ['-p', p];
    // Without agent-browser only the packages that don't drive it run.
    const skipped = browser ? [] : (packages ?? BROWSER_PACKAGES).filter((p) => BROWSER_PACKAGES.includes(p));
    const chosen = packages?.filter((p) => !skipped.includes(p));
    const workspace = ['--workspace', ...skipped.flatMap((p) => ['--exclude', p])];
    return {
      commands: [
        ...(chosen?.length === 0 ? [] : [test(...(chosen ? chosen.flatMap(select) : workspace))]),
        ...(each && chosen.length > 1 ? chosen.map(build) : []),
        ...(skipped.length ? [{ notRun: `${skipped.join(', ')}: agent-browser not found` }] : []),
      ],
    };
  },
};

const USAGE =
  'usage: node scripts/test.mjs [--strict] [--list] [--packages a,b] [--each-package] [repo|node|real|installer|mods|python|rust ...]';

function usage(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

function parse(argv) {
  const named = [];
  let strict = false;
  let list = false;
  let each = false;
  let packages;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') strict = true;
    else if (a === '--list') list = true;
    else if (a === '--each-package') each = true;
    else if (a === '--packages') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) usage('--packages needs a value, such as web-mcp,ado-mcp');
      packages = value.split(',').filter(Boolean);
    } else if (Object.hasOwn(SUITES, a)) named.push(a);
    else usage(`unknown suite or flag: ${a}`);
  }
  if (each && !packages) usage('--each-package needs --packages');
  // The table's order, whatever order they were named in.
  const suites = Object.keys(SUITES).filter((s) => !named.length || named.includes(s));
  return { suites, strict, list, packages, each };
}

// The exit code: 1 when a suite failed, or was NOT RUN under --strict.
function main(argv) {
  const { suites, strict, list, packages, each } = parse(argv);
  if (strict) process.env.DEAD_SKILLS_STRICT = '1';
  const root = fileURLToPath(new URL('..', import.meta.url));
  const modules = existsSync(join(root, 'node_modules')) ? undefined : 'node_modules missing: run npm ci';
  const plan = (suite) => SUITES[suite]({ root, modules, packages, each, strict });
  // When repo is selected, check-repo builds the generated trees itself.
  const needsTrees = (suite) => ['node', 'real', 'installer', 'mods'].includes(suite) && !suites.includes('repo');

  if (list) {
    let treesListed = false;
    for (const suite of suites) {
      const { commands, notRun } = plan(suite);
      if (notRun) {
        console.log(`${suite}: NOT RUN ${notRun}`);
        continue;
      }
      if (needsTrees(suite) && !treesListed) {
        treesListed = true;
        commands.unshift(TREES);
      }
      for (const c of commands)
        console.log(
          `${suite}: ${c.notRun ? `NOT RUN ${c.notRun}` : (c.list ?? `${[c.file, ...c.args].join(' ')}${c.cwd ? ` (in ${c.cwd})` : ''}`)}`,
        );
    }
    return 0;
  }

  const run = (c) =>
    c.notRun
      ? c
      : (c.run?.() ??
        startSync(c.file, c.args, { cwd: join(root, c.cwd ?? ''), env: c.env ?? process.env, stdio: 'inherit' }));
  let treesBuilt; // undefined until a suite needs the build
  // Returns [status, reason]; a missing reason means the suite ran, so the summary shows its time.
  const execute = (suite) => {
    const { commands, fail, notRun } = plan(suite);
    if (notRun) return ['NOT RUN', notRun];
    if (fail) return ['failed', fail];
    if (needsTrees(suite) && !(treesBuilt ??= run(TREES).status === 0)) return ['failed', 'native build failed'];
    let status = 'passed';
    let reason;
    let skipped;
    // Every command runs, even after one fails.
    for (const r of commands.map(run)) {
      if (r.notRun) skipped ??= r.notRun;
      if (r.notRun || r.status === 0) continue;
      status = 'failed';
      // A killed child or one that cannot start has no exit status.
      if (r.status === null) reason ??= r.error?.message ?? `killed by ${r.signal}`;
    }
    // A suite that passed what it ran but skipped a command is NOT RUN, which fails under --strict.
    return status === 'passed' && skipped ? ['NOT RUN', skipped] : [status, reason];
  };

  const results = [];
  for (const suite of suites) {
    console.log(`== ${suite}`);
    const started = performance.now();
    const [status, reason] = execute(suite);
    results.push({ suite, status, reason: reason ?? `${((performance.now() - started) / 1000).toFixed(1)} s` });
  }
  for (const { suite, status, reason } of results) console.log(`${suite.padEnd(9)} ${status.padEnd(8)} ${reason}`);
  return results.some((r) => r.status === 'failed' || (strict && r.status === 'NOT RUN')) ? 1 : 0;
}

// import.meta.main, not a comparison with argv[1], which keeps a symlinked path: the door would then run nothing and pass.
if (import.meta.main) {
  // Importing proc.ts loads ui.ts, whose SIGTERM and SIGHUP handlers never run in this synchronous script and replace
  // the default terminate, so a kill or a timeout would not stop the run. Only the CLI drops them: an importer keeps its own.
  for (const signal of ['SIGTERM', 'SIGHUP']) process.removeAllListeners(signal);
  process.exitCode = main(process.argv.slice(2));
}
