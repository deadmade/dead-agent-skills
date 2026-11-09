import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  missingBinaries,
  newestChromeForTesting,
  versionIn,
  windowProblem,
  sha256Of,
  sha256Matches,
} from './binaries.ts';

test('missing binaries per OS', () => {
  const none = () => false;
  assert.ok(!missingBinaries('linux', ['dead-skills'], none).some((r) => r.binary === 'nixd'));
  const win = missingBinaries('win32', ['nix-lsp'], none);
  assert.ok(win.some((r) => r.binary === 'nixd' && /deselect/.test(r.command)));
  const nix = missingBinaries('linux', ['nix-lsp', 'graphify'], none);
  assert.ok(nix.some((r) => r.binary === 'nixd' && /nixd/.test(r.command)));
  assert.ok(nix.some((r) => r.binary === 'graphify'));
  assert.ok(!missingBinaries('linux', ['headroom-trim'], none).some((r) => r.binary === 'uv'));
  assert.ok(!missingBinaries('linux', ['web-mcp'], none).some((r) => r.binary === 'agent-browser'));
  assert.deepEqual(
    missingBinaries('linux', ['dead-skills'], () => true),
    [],
  );
});

test('checksum lines', () => {
  const hex = 'AB'.repeat(32);
  assert.equal(sha256Of(`${hex}  web-mcp-x.tar.gz\n`), hex.toLowerCase());
  assert.equal(sha256Of(`${hex}`), hex.toLowerCase());
  assert.equal(sha256Of('Not Found'), undefined);
  assert.equal(sha256Of(`${hex}ff  x`), undefined);
  // sha256('abc'), the FIPS 180-2 test vector.
  const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  assert.ok(sha256Matches(Buffer.from('abc'), abc));
  assert.ok(!sha256Matches(Buffer.from('abd'), abc));
  assert.ok(!sha256Matches(Buffer.from('abc'), undefined));
});

test('versionIn reads the version a tool prints', () => {
  assert.equal(versionIn('agent-browser 0.39.1\n'), '0.39.1');
  assert.equal(versionIn('uv 0.13.6 (abc 2026-01-01)'), '0.13.6');
  assert.equal(versionIn('nope'), undefined);
});

test('newestChromeForTesting picks the newest version', () => {
  assert.equal(
    newestChromeForTesting(['chrome-99.0.1.2', 'chrome-156.0.7.1', 'chrome-156.0.10.1', 'notes', 'chrome-1.2.3']),
    'chrome-156.0.10.1',
  );
  assert.equal(newestChromeForTesting(['x', 'chrome-1.2.3']), undefined);
  assert.equal(newestChromeForTesting([]), undefined);
});

test('windowProblem: no browser, no display on Linux, and the cases that are fine', () => {
  const ok = { browserRuns: true, platform: 'linux' as const, display: false, xvfb: false };
  assert.equal(
    windowProblem({ ...ok, browserRuns: false }),
    "web-mcp's browser window can't open: no browser it can use. search, browser and the fetch fallback won't work until you run agent-browser install, or install Helium or Chromium.",
  );
  assert.equal(
    windowProblem(ok),
    "web-mcp's browser window can't open: this Linux has no display and no Xvfb. search, browser and the fetch fallback won't work until you install Xvfb or run Claude Code in a desktop session.",
  );
  assert.equal(windowProblem({ ...ok, display: true }), undefined);
  assert.equal(windowProblem({ ...ok, xvfb: true }), undefined);
  assert.equal(windowProblem({ ...ok, platform: 'win32' }), undefined);
});

test('graphify is installed through uv tool install with its extras', () => {
  const r = missingBinaries('win32', ['graphify'], () => false).find((m) => m.binary === 'graphify');
  assert.equal(r?.command, 'uv tool install "graphifyy[sql,pdf,office,watch,leiden]"');
});
