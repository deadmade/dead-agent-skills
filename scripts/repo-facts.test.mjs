import assert from 'node:assert/strict';
import test from 'node:test';
import { selectChecks } from './ci-changes.mjs';
import { workspacePackages } from './release.mjs';

test('ci-changes routes every Rust package in Cargo.toml', () => {
  assert.deepEqual(
    [...selectChecks([], true).packages].sort(),
    [...workspacePackages()].sort(),
    'Cargo.toml members and scripts/ci-changes.mjs name different Rust packages',
  );
});
