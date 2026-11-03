// Vendor the pr-review-toolkit agent flows' /review-code runs into plugins/flows/agents/, with the description
// rewritten so it doesn't fire on its own; its LICENSE and UPSTREAM sit in skills/review-code/. The adapter keeps its
// old name, and the ownership stamp below keeps its old script name, so files it vendored before are still recognised
// and replaced. Idempotent: re-running against the same upstream commit produces no diff.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from '../text.ts';
import type { SyncContext, AdapterResult } from '../types.ts';

const OFFICIAL_URL = 'https://github.com/anthropics/claude-plugins-official.git';
// The tests lens's agent. The toolkit's others are left out: /review-code's correctness lens covers their ground.
const AGENTS = ['pr-test-analyzer'];

export function run(ctx: SyncContext): AdapterResult {
  const { ROOT, finish, git, sparseClone } = ctx;
  const FLOWS = join(ROOT, 'plugins', 'flows');
  const AGENTS_DEST = join(FLOWS, 'agents');
  const SKILL = join(FLOWS, 'skills', 'review-code');

  const official = sparseClone(OFFICIAL_URL, ['plugins/pr-review-toolkit']);

  const need = (path: string) => existsSync(path) || fail(`upstream ${path} not found (renamed or removed?)`);
  const toolkit = join(official, 'plugins', 'pr-review-toolkit');
  need(join(toolkit, 'LICENSE'));
  for (const a of AGENTS) need(join(toolkit, 'agents', `${a}.md`));

  // "Use this agent when ... proactively ... <example>…" → one sentence that names /review-code as the caller.
  // The description is either one line (with literal \n escapes) or a YAML block scalar (`|` plus indented lines).
  function retarget(agentMd: string, name: string) {
    const lines = readFileSync(agentMd, 'utf8').split('\n');
    const start = lines.findIndex((l) => l.startsWith('description:'));
    if (start < 0) fail(`${name}: no description`);
    let end = start + 1;
    let value = lines[start].replace(/^description:\s*/, '');
    if (/^[|>][-+]?$/.test(value)) {
      while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
      value = lines.slice(start + 1, end).join('\n');
    }
    const first = value
      .replace(/^"|"$/g, '')
      .trim()
      .split(/\\n|\n|(?<=\.)\s/)[0]
      .trim();
    if (!first) fail(`${name}: empty description`);
    lines.splice(start, end - start, `description: ${JSON.stringify(`Used by /review-code: ${first}`)}`);
    return lines.join('\n');
  }

  // Source note right after the frontmatter (which must stay first). Links to main, not a commit: UPSTREAM has that,
  // and a SHA here would change every vendored file on every upstream commit.
  function stamp(text: string, url: string) {
    const note = `<!-- Vendored from ${url} by scripts/sync-self-review.mjs. Don't edit: the weekly sync overwrites it. -->`;
    const end = text.startsWith('---\n') ? text.indexOf('\n---\n', 4) : -1;
    if (end < 0) return `${note}\n\n${text}`;
    const cut = end + '\n---\n'.length;
    return `${text.slice(0, cut)}\n${note}\n${text.slice(cut)}`;
  }
  const OFFICIAL_WEB = 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins';

  // flows' agents/ holds other syncs' agents too: replace only the ones this script stamped.
  const ours = (f: string) => readFileSync(join(AGENTS_DEST, f), 'utf8').includes('by scripts/sync-self-review.mjs.');
  for (const f of readdirSync(AGENTS_DEST).filter(ours)) rmSync(join(AGENTS_DEST, f));
  for (const a of AGENTS) {
    const text = stamp(
      retarget(join(toolkit, 'agents', `${a}.md`), a),
      `${OFFICIAL_WEB}/pr-review-toolkit/agents/${a}.md`,
    );
    writeFileSync(join(AGENTS_DEST, `${a}.md`), text);
  }
  cpSync(join(toolkit, 'LICENSE'), join(SKILL, 'LICENSE'));

  finish('self-review', git('-C', official, 'rev-parse', 'HEAD'), join(SKILL, 'UPSTREAM'), [SKILL, AGENTS_DEST]);

  return ctx.result;
}
