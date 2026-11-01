import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NewSkillPolicy, SyncContext } from './types.ts';
import { readResult } from './application.ts';
export function formatOutputs(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => {
      if (!String(value).includes('\n')) return `${key}=${value}\n`;
      const eof = `EOF_${randomUUID()}`;
      return `${key}<<${eof}\n${value}\n${eof}\n`;
    })
    .join('');
}

export function newSkillIssue(spec: NewSkillPolicy, skill: string, desc: string) {
  const name = skill.split('/').at(-1)!;
  const body = [
    spec.lead(skill),
    '',
    `> ${desc || 'no description'}`,
    '',
    `Source: ${spec.source(skill)}`,
    '',
    `Decide in \`${spec.script}\`:`,
    `- **Include:** ${spec.include(skill)}, bump the skill count check in \`tools/upstream-sync/src/sources.ts\`, run the sync command.` +
      (spec.after ? ` ${spec.after}` : ''),
    `- **Skip:** add \`${skill}\` to \`SKIPPED\`.`,
    '',
    `Check for overlap with ${spec.overlap} before including it.`,
  ].join('\n');
  return { name, title: spec.title(name), body };
}

export const failingTitle = (name: string) => `Sync ${name} failing`;

// Whether `titles` (one per line, as `gh issue list --jq '.[].title'` prints them) holds exactly `title`.
export const hasTitle = (titles: string, title: string) => titles.split('\n').includes(title);

function openFailing(gh: SyncContext['gh'], name: string) {
  const title = failingTitle(name);
  const found: { number: number; title: string }[] = JSON.parse(
    gh(
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--search',
      `"${title}" in:title`,
      '--json',
      'number,title',
    ),
  );
  return found.find((i) => i.title === title)?.number;
}

export function failed(gh: SyncContext['gh'], name: string, url: string) {
  const number = openFailing(gh, name);
  if (number) return gh('issue', 'comment', String(number), '--body', `Failed again: ${url}`);
  const body = `The weekly sync of \`${name}\` (\`.github/workflows/sync.yml\`) failed: ${url}\n\nThe next green run closes this issue.\n\ncc @deadmade`;
  createIssue(gh, failingTitle(name), body);
}

export function passed(gh: SyncContext['gh'], name: string, url: string) {
  const number = openFailing(gh, name);
  if (number) gh('issue', 'close', String(number), '--reason', 'completed', '--comment', `Green again: ${url}`);
}

function createIssue(gh: SyncContext['gh'], title: string, body: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'sync-issue-'));
  try {
    const file = join(dir, 'body.md');
    writeFileSync(file, body);
    gh('issue', 'create', '--title', title, '--body-file', file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
export function issues(gh: SyncContext['gh'], name: string, spec?: NewSkillPolicy): void {
  const result = readResult(name);
  if (!spec) return;
  for (const skill of result.result.newSkills) {
    const issue = newSkillIssue(spec, skill.name, skill.description);
    const titles = gh(
      'issue',
      'list',
      '--state',
      'all',
      '--limit',
      '100',
      '--search',
      `${issue.name} in:title`,
      '--json',
      'title',
      '--jq',
      '.[].title',
    );
    if (!hasTitle(titles, issue.title)) createIssue(gh, issue.title, issue.body);
  }
}
