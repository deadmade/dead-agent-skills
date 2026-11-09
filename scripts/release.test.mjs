import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion } from './release.mjs';

test('bumps package.json when no tag is ahead of it', () => {
  assert.equal(nextVersion('0.6.0', ['v0.5.0', 'v0.6.0'], 'patch'), '0.6.1');
  assert.equal(nextVersion('0.6.0', [], 'minor'), '0.7.0');
  assert.equal(nextVersion('0.6.0', [], 'major'), '1.0.0');
});

test('counts from the highest tag when main lags behind it', () => {
  assert.equal(nextVersion('0.6.0', ['v0.6.9', 'v0.6.10', 'v0.6.2'], 'patch'), '0.6.11');
  assert.equal(nextVersion('0.6.0', ['v0.6.10'], 'minor'), '0.7.0');
});

test('ignores tags that are not vX.Y.Z', () => {
  assert.equal(nextVersion('0.6.0', ['v1.0.0-rc.1', 'latest', 'v9'], 'patch'), '0.6.1');
});

test('takes an exact version and rejects anything else', () => {
  assert.equal(nextVersion('0.6.0', [], '2.3.4'), '2.3.4');
  assert.equal(nextVersion('0.6.0', [], 'next'), undefined);
  assert.equal(nextVersion('0.6.0', [], undefined), undefined);
});

// Exercise the same edits as a real release without running git commits or tags.
test('a release updates the workspace and all local lock entries without changing dependencies', async (t) => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { versionBumps } = await import('./release.mjs');
  const root = mkdtempSync(join(tmpdir(), 'workspace-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of new Set(versionBumps().map(([file]) => file))) {
    // Windows checkouts may use CRLF; release edits must preserve those line endings.
    writeFileSync(
      join(root, file),
      readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n'),
    );
  }
  const before = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  const current = JSON.parse(readFileSync(join(root, 'package.json'))).version;
  for (const [file, pattern] of versionBumps()) {
    const path = join(root, file);
    const source = readFileSync(path, 'utf8');
    assert.match(source, pattern, `${file} must have a version to bump`);
    writeFileSync(path, source.replace(pattern, '$1"9.8.7"'));
  }
  const locked = readFileSync(join(root, 'Cargo.lock'), 'utf8');
  for (const name of ['web-mcp', 'ado-mcp', 'http-runner']) {
    assert.match(locked, new RegExp(`name = "${name}"\\r?\\nversion = "9.8.7"`));
  }
  assert.equal(locked.replaceAll('version = "9.8.7"', `version = "${current}"`), before);
  assert.match(readFileSync(join(root, 'Cargo.toml'), 'utf8'), /\[workspace.package\]\r?\nversion = "9.8.7"/);
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'))).version, '9.8.7');
  // Cargo itself verifies inherited package versions when it is available. npm tests also run without Rust.
  if (spawnSync('cargo', ['--version']).status !== 0) return;
  const members = ['web-mcp', 'ado-mcp', 'http-runner'];
  for (const member of members) {
    const dir = join(root, 'tools', member);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'Cargo.toml'),
      `[package]\nname = "${member}"\nversion.workspace = true\nedition.workspace = true\n`,
    );
    writeFileSync(join(dir, 'src/lib.rs'), '');
  }
  // The isolated fixture has no dependencies; generate its initial resolution, then require it to stay locked.
  assert.equal(spawnSync('cargo', ['generate-lockfile', '--offline'], { cwd: root }).status, 0);
  const metadata = spawnSync('cargo', ['metadata', '--offline', '--locked', '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(metadata.status, 0, metadata.stderr);
  assert.deepEqual(
    JSON.parse(metadata.stdout).packages.map((p) => p.version),
    Array(members.length).fill('9.8.7'),
  );
});
