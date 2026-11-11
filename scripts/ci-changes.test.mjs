import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { changedPaths, selectChecks } from './ci-changes.mjs';

const all = ['web-mcp', 'ado-mcp', 'http-runner'];

test('full runs select exactly the remaining binaries and workspace packages', () => {
  assert.deepEqual(selectChecks([], true).binaries, all);
  assert.deepEqual(selectChecks([], true).packages, ['web-mcp', 'ado-mcp', 'http-runner']);
});

test('an ado implementation change selects only ado checks', () => {
  assert.deepEqual(selectChecks(['tools/ado-mcp/src/wi.rs']), {
    node: false,
    skills: false,
    rust: true,
    binaries: ['ado-mcp'],
    packages: ['ado-mcp'],
  });
});

test('each crate selects its checks', () => {
  for (const crate of all) {
    const result = selectChecks([`tools/${crate}/src/lib.rs`]);
    assert.deepEqual(result.binaries, [crate]);
    assert.deepEqual(result.packages, [crate]);
  }
});

test('plugin changes select their native integration and Node checks', () => {
  for (const [path, crate] of [
    ['plugins/shared/web-mcp/.mcp.json', 'web-mcp'],
    ['plugins/opt-in/mcp/mcp-azure/.mcp.json', 'ado-mcp'],
    ['plugins/opt-in/mcp/http-runner/.mcp.json', 'http-runner'],
  ]) {
    const result = selectChecks([path]);
    assert.deepEqual(result.binaries, [crate]);
    assert.equal(result.node, true);
  }
});

test('flow and compiler changes select Node and skill checks, not Rust', () => {
  for (const path of ['plugins/flows/steps/run-rules.toml', 'tools/harness-compiler/src/flows/compose.ts']) {
    const result = selectChecks([path]);
    assert.deepEqual(result.binaries, []);
    assert.equal(result.rust, false);
    assert.equal(result.node, true);
    assert.equal(result.skills, true);
  }
});

test('shared dependencies, CI and unknown components select everything', () => {
  for (const path of [
    'Cargo.toml',
    'Cargo.lock',
    'flake.nix',
    'flake.lock',
    'package.json',
    'package-lock.json',
    '.cargo/config.toml',
    '.github/workflows/test.yml',
    'scripts/ci-changes.mjs',
    'tools/new-crate/src/lib.rs',
  ]) {
    assert.deepEqual(selectChecks([path]), selectChecks([], true), path);
  }
});

test('installer changes skip Rust and scanning; skill changes scan', () => {
  assert.deepEqual(selectChecks(['tools/installer/core/options.ts']), {
    node: true,
    skills: false,
    rust: false,
    binaries: [],
    packages: [],
  });
  assert.equal(selectChecks(['plugins/opt-in/implementation/rust-skills/skills/a/SKILL.md']).skills, true);
  assert.equal(selectChecks(['.github/skill-scanner.yaml']).skills, true);
});

test('docs skip expensive checks, but root readmes and crate manifests get consistency checks', () => {
  assert.equal(selectChecks(['docs/adr/example.md']).rust, false);
  assert.equal(selectChecks(['docs/adr/example.md']).node, false);
  assert.equal(selectChecks(['README.md']).node, true);
  assert.equal(selectChecks(['tools/ado-mcp/Cargo.toml']).node, true);
  assert.equal(selectChecks(['tools/web-mcp/Cargo.lock']).node, true);
});

test('mixed changes take a deterministic union', () => {
  assert.deepEqual(
    selectChecks(['tools/ado-mcp/src/wi.rs', 'tools/web-mcp/src/lib.rs', 'tools/ado-mcp/tests/mcp.rs']).binaries,
    ['web-mcp', 'ado-mcp'],
  );
});

test('manual runs and initial pushes select all; PR and push use their complete ranges', () => {
  assert.equal(changedPaths('workflow_dispatch', {}), null);
  assert.equal(changedPaths('push', { before: '0'.repeat(40) }), null);
  const git = (expected) => (args) => {
    assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', expected, '--']);
    return 'tools/ado-mcp/a b.rs\0tools/web-mcp/deleted.rs\0';
  };
  assert.equal(
    changedPaths('pull_request', { pull_request: { base: { sha: 'base' }, head: { sha: 'head' } } }, git('base...head'))
      .length,
    2,
  );
  assert.equal(changedPaths('push', { before: 'before', after: 'after' }, git('before..after')).length, 2);
  assert.throws(() =>
    changedPaths('push', { before: 'before', after: 'after' }, () => {
      throw Error('missing history');
    }),
  );
});

test('real git diff includes both sides of a rename and excludes base-only changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-changes-'));
  // A commit hook's GIT_INDEX_FILE would make these commands write to the caller's index.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env });
  try {
    git(['init', '-q']);
    git(['config', 'user.name', 'CI test']);
    git(['config', 'user.email', 'ci@example.test']);
    writeFileSync(join(dir, 'old file'), 'same content\n');
    git(['add', '.']);
    git(['commit', '-qm', 'Initial']);
    const initial = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '-qb', 'feature']);
    git(['mv', 'old file', 'new file']);
    git(['commit', '-qm', 'Rename']);
    const head = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '--detach', initial]);
    writeFileSync(join(dir, 'base only'), 'base\n');
    git(['add', '.']);
    git(['commit', '-qm', 'Base advances']);
    const base = git(['rev-parse', 'HEAD']).trim();
    assert.deepEqual(
      changedPaths('pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } }, git).sort(),
      ['new file', 'old file'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Captured from PR #122 at 0b9dca7: web-mcp changes plus docs.
test('PR 122 selects only web-mcp', () => {
  const paths = JSON.parse(readFileSync(new URL('./fixtures/ci-pr122-paths.json', import.meta.url), 'utf8'));
  assert.deepEqual(selectChecks(paths), {
    node: true,
    skills: true,
    rust: true,
    binaries: ['web-mcp'],
    packages: ['web-mcp'],
  });
});

for (const path of ['Cargo.toml', 'flake.nix']) {
  test(`repository fact ${path} selects Node checks`, () => {
    assert.equal(selectChecks([path]).node, true, path);
  });
}

test('the web API slug participates in Node repository checks', () => {
  assert.equal(selectChecks(['tools/web-mcp/src/api.rs']).node, true);
});

test("test files and fixtures route like their component, at today's path and in its tests/ folder", () => {
  for (const [today, moved, source] of [
    [
      'tools/installer/core/settings.test.ts',
      'tools/installer/tests/core/settings.test.ts',
      'tools/installer/core/settings.ts',
    ],
    [
      'tools/installer/core/fixtures/dcg-hooks.json',
      'tools/installer/tests/core/fixtures/dcg-hooks.json',
      'tools/installer/core/settings.ts',
    ],
    ['tools/installer/modules.test.ts', 'tools/installer/tests/modules.test.ts', 'tools/installer/install.ts'],
    [
      'tools/harness-compiler/test/build.test.ts',
      'tools/harness-compiler/tests/build.test.ts',
      'tools/harness-compiler/src/emit/build.ts',
    ],
    [
      'tools/harness-compiler/test/fixtures/codex.json',
      'tools/harness-compiler/tests/fixtures/codex.json',
      'tools/harness-compiler/src/emit/build.ts',
    ],
    ['tools/upstream-sync/src/cli.test.ts', 'tools/upstream-sync/tests/cli.test.ts', 'tools/upstream-sync/src/cli.ts'],
    ['scripts/flows-uses.test.mjs', 'scripts/tests/flows-uses.test.mjs', 'scripts/flows-uses.mjs'],
    ['scripts/fixtures/ci-pr122-paths.json', 'scripts/tests/fixtures/ci-pr122-paths.json', 'scripts/flows-uses.mjs'],
    ['plugins/default/hooks/lib.test.mjs', 'plugins/default/tests/lib.test.mjs', 'plugins/default/hooks/lib.mjs'],
    [
      'plugins/default/hooks/register.test.ts',
      'plugins/default/tests/register.test.ts',
      'plugins/default/hooks/register.tsx',
    ],
    [
      'plugins/opt-in/headroom-trim/hooks/launcher.test.mjs',
      'plugins/opt-in/headroom-trim/tests/launcher.test.mjs',
      'plugins/opt-in/headroom-trim/hooks/launcher.mjs',
    ],
  ]) {
    assert.deepEqual(selectChecks([today]), selectChecks([source]), today);
    assert.deepEqual(selectChecks([moved]), selectChecks([source]), moved);
  }
  // The one pair that routes differently after the move: the Node job runs this test, and nothing in it changes which checks run.
  assert.deepEqual(selectChecks(['scripts/ci-changes.test.mjs']), selectChecks([], true));
  assert.deepEqual(selectChecks(['scripts/tests/ci-changes.test.mjs']), selectChecks(['scripts/flows-uses.mjs']));
});
