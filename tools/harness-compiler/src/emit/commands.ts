// build: replace the owned generated trees. check: prove they are current without touching the checkout.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { Diagnostic } from '../model.ts';
import { type Build, buildTree } from './build.ts';

// What the compiler owns in the repository: whole directories, and single files.
const OWNED_DIRS = ['.claude-plugin', '.agents/plugins'];

const files = (dir: string, within = dir): Map<string, string> => {
  const found = new Map<string, string>();
  if (!existsSync(dir)) return found;
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true }))
    if (e.isFile())
      found.set(
        join(e.parentPath, e.name)
          .slice(within.length + 1)
          .split(sep)
          .join('/'),
        readFileSync(join(e.parentPath, e.name), 'hex'),
      );
  return found;
};
export const formatDiagnostic = (d: Diagnostic) => `[${[d.target, d.plugin].filter(Boolean).join('/')}] ${d.message}`;

export function build(repo: string): Build {
  const root = resolve(repo);
  const staging = mkdtempSync(join(root, '.native-build-'));
  try {
    const built = buildTree(root, staging);
    for (const dir of OWNED_DIRS) {
      rmSync(join(root, dir), { recursive: true, force: true });
      mkdirSync(dirname(join(root, dir)), { recursive: true });
      renameSync(join(staging, dir), join(root, dir));
    }
    return built;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Returns the problems: file drift, then what the built-text checks find (`flows: …`); empty means all is current.
export function check(repo: string): string[] {
  const root = resolve(repo);
  const temp = mkdtempSync(join(tmpdir(), 'harness-check-'));
  try {
    const built = buildTree(root, temp);
    const expected = new Map<string, string>(),
      actual = new Map<string, string>();
    for (const dir of OWNED_DIRS) {
      for (const [path, content] of files(join(temp, dir), temp)) expected.set(path, content);
      for (const [path, content] of files(join(root, dir), root)) actual.set(path, content);
    }
    const problems: string[] = [];
    for (const [path, content] of expected) {
      if (!actual.has(path)) problems.push(`missing: ${path}`);
      else if (actual.get(path) !== content) problems.push(`stale: ${path}`);
    }
    for (const path of actual.keys()) if (!expected.has(path)) problems.push(`extra: ${path}`);
    return [...problems, ...built.problems.map((p) => `flows: ${p}`)];
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
