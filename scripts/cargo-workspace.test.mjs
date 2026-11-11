import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkCargoWorkspace } from './cargo-workspace.mjs';

const MEMBER_PATH = 'tools/app/Cargo.toml';
const DEP = 'serde = { workspace = true, features = ["derive"] }';
const MEMBER = `[package]
name = "app"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
publish.workspace = true
[dependencies]
${DEP}
`;

// A disposable workspace with one member, tools/app; the test gets its root and a writer for files under it.
function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'cargo-workspace-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('Cargo.toml', '[workspace]\nmembers = ["tools/app"]\n[workspace.dependencies]\nserde = "1"\n');
  write('Cargo.lock', '');
  write(MEMBER_PATH, MEMBER);
  return { root, write };
}

test('a clean workspace passes, and target, node_modules and __pycache__ are not searched', (t) => {
  const { root, write } = workspace(t);
  assert.deepEqual(checkCargoWorkspace(root), []);
  write('tools/app/target/vendor/Cargo.toml', '[workspace]');
  write('tools/app/node_modules/x/Cargo.toml', '[workspace]');
  write('tools/app/__pycache__/Cargo.toml', '[workspace]');
  assert.deepEqual(checkCargoWorkspace(root), []);
});

const inherit = (problem) => `tools/app/Cargo.toml: ${problem} must inherit its source and version`;
const withDep = (line) => (write) => write(MEMBER_PATH, MEMBER.replace(DEP, line));
const localVersion = (section) => (write) =>
  write(
    MEMBER_PATH,
    MEMBER.replace('[dependencies]', `[${section}]`).replace('workspace = true, features', 'version = "1", features'),
  );

test('each broken workspace names its problem', (t) => {
  for (const [edit, change, problem] of [
    ['delete Cargo.lock', (_, root) => unlinkSync(join(root, 'Cargo.lock')), 'missing root Cargo.lock'],
    [
      'add tools/app/Cargo.lock',
      (write) => write('tools/app/Cargo.lock', ''),
      'tools/app/Cargo.lock: use the root lockfile',
    ],
    [
      'append [workspace] to the member',
      (write) => write(MEMBER_PATH, `${MEMBER}\n[workspace]\n`),
      'tools/app/Cargo.toml: nested workspace',
    ],
    [
      'copy the member to tools/extra',
      (write) => write('tools/extra/Cargo.toml', MEMBER),
      'tools/extra/Cargo.toml: not a workspace member',
    ],
    [
      'license = "MIT"',
      (write) => write(MEMBER_PATH, MEMBER.replace('license.workspace = true', 'license = "MIT"')),
      'tools/app/Cargo.toml: license must be inherited',
    ],
    [
      'version = { workspace = true, x = 1 }',
      (write) =>
        write(MEMBER_PATH, MEMBER.replace('version.workspace = true', 'version = { workspace = true, x = 1 }')),
      'tools/app/Cargo.toml: version must be inherited',
    ],
    ['version in [dependencies]', localVersion('dependencies'), inherit('dependencies.serde')],
    ['version in [dev-dependencies]', localVersion('dev-dependencies'), inherit('dev-dependencies.serde')],
    ['version in [build-dependencies]', localVersion('build-dependencies'), inherit('build-dependencies.serde')],
    [
      "version in [target.'cfg(windows)'.dependencies]",
      localVersion("target.'cfg(windows)'.dependencies"),
      inherit('dependencies.serde'),
    ],
    ['a plain string', withDep('serde = "1"'), inherit('dependencies.serde')],
    ['a path', withDep('serde = { workspace = true, path = "../serde" }'), inherit('dependencies.serde')],
    [
      'a git source',
      withDep('serde = { workspace = true, git = "https://example.test/serde" }'),
      inherit('dependencies.serde'),
    ],
    ['a registry', withDep('serde = { workspace = true, registry = "other" }'), inherit('dependencies.serde')],
    [
      'rename serde to other',
      (write) => write(MEMBER_PATH, MEMBER.replace('serde =', 'other =')),
      'tools/app/Cargo.toml: other missing from workspace.dependencies',
    ],
    [
      'delete the member file',
      (_, root) => unlinkSync(join(root, MEMBER_PATH)),
      'tools/app/Cargo.toml: missing member',
    ],
  ]) {
    const { root, write } = workspace(t);
    change(write, root);
    assert.deepEqual(checkCargoWorkspace(root), [problem], edit);
  }
});

test('a member that is not TOML throws an error that names it', (t) => {
  const { root, write } = workspace(t);
  write(MEMBER_PATH, MEMBER.replace(DEP, 'serde = { workspace = true,, }'));
  assert.throws(() => checkCargoWorkspace(root), /^Error: tools\/app\/Cargo\.toml: /);
});
