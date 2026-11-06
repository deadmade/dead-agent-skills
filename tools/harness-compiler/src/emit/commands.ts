// build: replace the owned generated trees (gitignored; release.yml commits them only on the release branch).
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Diagnostic } from '../model.ts';
import { type Build, buildTree } from './build.ts';

// What the compiler owns in the repository.
const OWNED_DIRS = ['.claude-plugin', '.agents/plugins'];

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
