import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pinFrom } from '../text.ts';
import type { SyncContext } from '../types.ts';

export type ProcessRunner = (program: string, args: string[], cwd: string) => string;
export const execute: ProcessRunner = (program, args, cwd) =>
  execFileSync(program, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

export function createContext(
  root: string,
  temporary: string,
  argument = '',
  ref?: string,
  processRunner: ProcessRunner = execute,
  log: (message: string) => void = console.log,
): SyncContext {
  let counter = 0;
  const ctx: SyncContext = {
    ROOT: root,
    argument,
    ref,
    result: { revisions: [], newSkills: [], report: [], values: {} },
    git: (...args) => processRunner('git', args, root),
    gh: (...args) => processRunner('gh', args, root),
    log,
    report: (message) => {
      ctx.result.report.push(message);
      log(message);
    },
    tempDir: () => {
      const dir = join(temporary, String(counter++));
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    sparseClone: (url, patterns, { noCone = false, ref, depth = 1 } = {}) => {
      const dir = join(ctx.tempDir(), 'up');
      const commit = !!ref && /^[0-9a-f]{40}$/.test(ref);
      const depthArgs = depth ? ['--depth', String(depth)] : [];
      ctx.git(
        'clone',
        '--quiet',
        ...depthArgs,
        ...(ref && !commit ? ['--branch', ref] : []),
        '--filter=blob:none',
        '--sparse',
        url,
        dir,
      );
      if (commit) {
        ctx.git('-C', dir, 'fetch', '--quiet', ...depthArgs, 'origin', ref!);
        ctx.git('-C', dir, 'checkout', '--quiet', '--detach', ref!);
      }
      ctx.git('-C', dir, 'sparse-checkout', 'set', ...(noCone ? ['--no-cone'] : []), ...patterns);
      return dir;
    },
    finish: (label, sha, upstreamFile, dirs) => {
      const path = relative(root, upstreamFile);
      const changed = ctx.git('status', '--porcelain', '--', ...[dirs].flat(), `:(exclude)${path}`) !== '';
      if (changed) writeFileSync(upstreamFile, sha + '\n');
      else {
        const tracked = ctx.git('ls-files', '--', path);
        if (tracked) ctx.git('restore', '--', path);
      }
      if (sha.includes('\n')) {
        for (const line of sha.split('\n')) {
          const [upstream, revision] = line.split(/\s+/);
          ctx.result.revisions.push({ label: upstream, sha: revision });
        }
      } else ctx.result.revisions.push({ label, sha });
      log(changed ? `${label} synced to ${sha} (changed)` : `${label} unchanged at ${sha} (no vendored changes)`);
    },
    reportNew: (entries) => {
      for (const [name, description = ''] of entries) {
        ctx.result.newSkills.push({ name, description });
        log(`new upstream skill: ${name}: ${description}`);
      }
    },
    syncPin: ({ repo, files, out, tagPattern }) => {
      const pin = pinFrom(JSON.parse(ctx.gh('api', `repos/${repo}/releases/latest`)), files, tagPattern);
      writeFileSync(join(root, out), JSON.stringify(pin, null, 2) + '\n');
      ctx.result.values.tag = pin.upstream;
      ctx.result.revisions.push({ label: repo, sha: pin.upstream });
      log(`${repo} pinned to ${pin.upstream}`);
    },
  };
  return ctx;
}
