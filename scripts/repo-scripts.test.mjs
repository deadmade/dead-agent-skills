import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const root = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const COMPILER = 'tools/harness-compiler/src/cli.ts';

test('package scripts and prepack build through the harness compiler, and the package ships the built trees', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.scripts['build:harnesses'], `node ${COMPILER} build`);
  assert.match(pkg.scripts.prepack, /harness-compiler\/src\/cli\.ts build/);
  assert.ok(pkg.workspaces.includes('tools/harness-compiler'));
  assert.ok(pkg.files.includes('plugins/catalog.json'));
  assert.ok(pkg.files.includes('.claude-plugin/') && pkg.files.includes('.agents/plugins/'));
  assert.deepEqual(
    pkg.files.filter((f) => f.startsWith('plugins/')),
    ['plugins/catalog.json'],
    'only the catalog of authored plugins is published',
  );
});

test('a release commits only the version bumps, after the tests', () => {
  const release = source('scripts/release.mjs');
  assert.ok(release.indexOf('text.replace(version') < release.indexOf("run('npm', ['test'])"));
  assert.match(release, /const files = bumps\.map/);
  assert.doesNotMatch(release, /'\.claude-plugin'|'\.agents\/plugins'/);
});

test('main ignores the native distributions, and the release branch carries them', () => {
  const ignored = source('.gitignore').split('\n');
  assert.ok(ignored.includes('/.claude-plugin/') && ignored.includes('/.agents/plugins/'));
  const workflow = source('.github/workflows/release.yml');
  assert.match(workflow, /git add -f \.claude-plugin \.agents\/plugins/);
  assert.match(workflow, /HEAD:refs\/heads\/release/);
});

test('flow dependency changes regenerate native packages after source writes', () => {
  const flows = source('scripts/flows-uses.mjs');
  assert.ok(flows.indexOf('writeFileSync(readmePath, readme)') < flows.lastIndexOf('harness-compiler/src/cli.ts'));
  assert.match(flows, /execFileSync\(process.execPath/);
});

test('CI runs the tests on Windows and packs the generated distributions', () => {
  const workflow = source('.github/workflows/test.yml');
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /\.claude-plugin\/dead-skills\/\.claude-plugin\/plugin\.json/);
  assert.match(workflow, /\.agents\/plugins\/flows\/\.codex-plugin\/plugin\.json/);
});

test('releases require plugin/tool changes or shared build inputs', () => {
  const workflow = source('.github/workflows/release.yml');
  assert.doesNotMatch(workflow, /paths-ignore:/);
  const block = workflow.match(/^    paths:\n((?:      - '[^']+'\n)+)/m);
  assert.ok(block, 'release has an explicit push path allowlist');
  const patterns = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const triggers = (paths) => paths.some((path) => patterns.some((pattern) => posix.matchesGlob(path, pattern)));
  for (const path of [
    'plugins/flows/skills/build-feature/SKILL.md',
    'plugins/default/hooks/notify.mjs',
    'plugins/catalog.json',
    'tools/ado-mcp/src/wi.rs',
    'tools/web-mcp/src/search.rs',
    'tools/installer/install.ts',
    'tools/harness-compiler/src/cli.ts',
    'Cargo.toml',
    'Cargo.lock',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'flake.nix',
    'flake.lock',
    '.cargo/config.toml',
    'rust-toolchain.toml',
    '.gitattributes',
  ])
    assert.equal(triggers([path]), true, path);
  const maintenance = [
    '.github/workflows/release.yml',
    '.github/workflows/crates.yml',
    '.github/dependabot.yml',
    'README.md',
    'AGENTS.md',
    'docs/adr/example.md',
    'scripts/ci-changes.mjs',
    'scripts/repo-scripts.test.mjs',
    'scripts/fixtures/ci-pr122-paths.json',
    'treefmt.toml',
    '.gitignore',
  ];
  assert.equal(triggers(maintenance), false);
  assert.equal(triggers([...maintenance, 'tools/ado-mcp/src/wi.rs']), true);
});
