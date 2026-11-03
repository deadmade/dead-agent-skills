import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { run } from './tob.ts';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const CHECKER = 'plugins/flows/agents/spec-compliance-checker.md';
const NEUTRAL = '${PLUGIN_ROOT}/packs/tob-picks/skills/';
const SKILLS = ['property-based-testing', 'spec-to-code-compliance', 'sharp-edges', 'mutation-testing'];

// A local stand-in for trailofbits/skills holding just what the adapter reads, with `checker` as the checker agent.
function fakeUpstream(dir, checker) {
  const put = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  put('.claude-plugin/marketplace.json', JSON.stringify({ plugins: SKILLS.map((name) => ({ name })) }));
  put('LICENSE', 'license\n');
  for (const s of SKILLS) put(`plugins/${s}/skills/${s}/SKILL.md`, `# ${s}\n`);
  put(
    'plugins/spec-to-code-compliance/skills/spec-to-code-compliance/SKILL.md',
    'Run `/spec-to-code-compliance:spec-compliance`; see `spec-to-code-compliance:spec-compliance-checker`.\n',
  );
  put('plugins/property-based-testing/skills/property-based-testing/references/libraries.md', 'grep "|invariant_"\n');
  put('plugins/spec-to-code-compliance/agents/spec-compliance-checker.md', checker);
  put('plugins/sharp-edges/agents/sharp-edges-analyzer.md', '# analyzer\n');
  put(
    'plugins/spec-to-code-compliance/workflows/spec-compliance.js',
    "agent('spec-to-code-compliance:spec-compliance-checker');\n",
  );
}

test('the sync leaves the checker agent as committed, with the neutral plugin root', () => {
  // The sync writes LF; a Windows checkout of the vendored file has CRLF.
  const committed = readFileSync(join(REPO, CHECKER), 'utf8').replaceAll('\r\n', '\n');
  assert.ok(committed.includes(NEUTRAL), 'the committed checker names the pack through ${PLUGIN_ROOT}');
  const root = mkdtempSync(join(tmpdir(), 'tob-sync-'));
  try {
    const up = join(root, 'upstream');
    fakeUpstream(up, committed.replaceAll(NEUTRAL, '{baseDir}/skills/'));
    const ctx = {
      ROOT: join(root, 'repo'),
      git: () => 'abc',
      reportNew: () => {},
      finish: () => {},
      sparseClone: () => up,
      result: {},
    };
    run(ctx);
    const synced = readFileSync(join(ctx.ROOT, CHECKER), 'utf8');
    assert.ok(!synced.includes('CLAUDE_PLUGIN_ROOT'), 'plugins/ stays agent-neutral (harness-compiler lint)');
    assert.equal(synced, committed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
