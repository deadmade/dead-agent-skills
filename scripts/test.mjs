// The one list of what runs: each suite, its test files and how it starts. It uses only the Node standard library and
// tools/installer/system/proc.ts, because crates.yml runs it without `npm ci`.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startSync, which } from '../tools/installer/system/proc.ts';

// The extensions are named because, given no paths, `node --test` also runs .test.cjs, the stale .test.js that
// prepack's tsc writes, and target/.
const GLOBS = {
  node: ['{scripts,tools}/**/*.test.{ts,mjs}', 'plugins/**/*.test.mjs'],
  mods: ['plugins/**/*.test.{ts,tsx}'],
  python: ['plugins/opt-in/headroom-trim/server/tests/test*.py'],
};

// Sorted repo-relative `/` paths. `**` does not skip node_modules, so exclude lists them.
export function suiteFiles(root) {
  const toml = readFileSync(join(root, 'treefmt.toml'), 'utf8').replaceAll('\r\n', '\n');
  const excludes = /^excludes = \[([\s\S]*?)^\]/m.exec(toml);
  if (!excludes) throw new Error('treefmt.toml has no excludes list');
  const vendored = [...excludes[1].matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
  const files = (globs) =>
    globSync(globs, { cwd: root, exclude: ['**/node_modules/**', '**/target/**'] })
      .map((p) => p.replaceAll('\\', '/'))
      .filter((p) => !vendored.some((g) => posix.matchesGlob(p, g)))
      .sort();
  return { node: files(GLOBS.node), mods: files(GLOBS.mods), python: files(GLOBS.python) };
}

const NODE_FLAGS = [
  '--test',
  '--test-timeout=300000',
  '--experimental-test-coverage',
  '--test-coverage-include=tools/installer/**',
  '--test-coverage-exclude=tools/installer/**/*.test.ts',
  '--test-coverage-lines=84',
];
const TREES = { file: process.execPath, args: ['tools/harness-compiler/src/cli.ts', 'build'] };

// Each suite gives { commands, fail } (fail: why it cannot start) or { notRun } (why it is skipped).
// A command is { file, args, cwd (relative to the root), env }, or { list, run } when it is more than one program start:
// `list` is what --list prints and `run` returns the status of what it ran.
const SUITES = {
  repo: ({ modules }) => ({
    commands: [{ file: process.execPath, args: ['scripts/check-repo.mjs'] }],
    fail: modules,
  }),
  node: ({ root, modules }) => {
    const files = suiteFiles(root).node;
    return {
      commands: [{ file: process.execPath, args: [...NODE_FLAGS, ...files] }],
      fail: modules ?? (files.length ? undefined : 'node: no test files'),
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
          } finally {
            rmSync(copy, { recursive: true, force: true });
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
    const test = (...select) => ({ file, args: ['test', '--locked', '--no-fail-fast', ...select] });
    const select = (p) => ['-p', p];
    return {
      commands: [
        ...(!packages || packages.includes('web-mcp')
          ? [{ file, args: ['build', '--locked', '-p', 'web-mcp', '--bin', 'fake-agent-browser'] }]
          : []),
        test(...(packages ? packages.flatMap(select) : ['--workspace'])),
        ...(each && packages.length > 1 ? packages.map((p) => test(...select(p))) : []),
      ],
    };
  },
};

const USAGE =
  'usage: node scripts/test.mjs [--strict] [--list] [--packages a,b] [--each-package] [repo|node|mods|python|rust ...]';

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
  const root = fileURLToPath(new URL('..', import.meta.url));
  const modules = existsSync(join(root, 'node_modules')) ? undefined : 'node_modules missing: run npm ci';
  const plan = (suite) => SUITES[suite]({ root, modules, packages, each });
  // When repo is selected, check-repo builds the generated trees itself.
  const needsTrees = (suite) => (suite === 'node' || suite === 'mods') && !suites.includes('repo');

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
        console.log(`${suite}: ${c.list ?? `${[c.file, ...c.args].join(' ')}${c.cwd ? ` (in ${c.cwd})` : ''}`}`);
    }
    return 0;
  }

  const run = (c) =>
    c.run?.() ??
    startSync(c.file, c.args, { cwd: join(root, c.cwd ?? ''), env: c.env ?? process.env, stdio: 'inherit' });
  let treesBuilt; // undefined until a suite needs the build
  // Returns [status, reason]; a missing reason means the suite ran, so the summary shows its time.
  const execute = (suite) => {
    const { commands, fail, notRun } = plan(suite);
    if (notRun) return ['NOT RUN', notRun];
    if (fail) return ['failed', fail];
    if (needsTrees(suite) && !(treesBuilt ??= run(TREES).status === 0)) return ['failed', 'native build failed'];
    let status = 'passed';
    let reason;
    // Every command runs, even after one fails.
    for (const r of commands.map(run)) {
      if (r.status === 0) continue;
      status = 'failed';
      // A killed child or one that cannot start has no exit status.
      if (r.status === null) reason ??= r.error?.message ?? `killed by ${r.signal}`;
    }
    return [status, reason];
  };

  const results = [];
  for (const suite of suites) {
    console.log(`== ${suite}`);
    const started = performance.now();
    const [status, reason] = execute(suite);
    results.push({ suite, status, reason: reason ?? `${((performance.now() - started) / 1000).toFixed(1)} s` });
  }
  for (const { suite, status, reason } of results) console.log(`${suite.padEnd(7)} ${status.padEnd(8)} ${reason}`);
  return results.some((r) => r.status === 'failed' || (strict && r.status === 'NOT RUN')) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Importing proc.ts loads ui.ts, whose SIGTERM and SIGHUP handlers never run in this synchronous script and replace
  // the default terminate, so a kill or a timeout would not stop the run. Only the CLI drops them: an importer keeps its own.
  for (const signal of ['SIGTERM', 'SIGHUP']) process.removeAllListeners(signal);
  process.exitCode = main(process.argv.slice(2));
}
