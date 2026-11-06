import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, execute } from './system/context.ts';
import type { ProcessRunner } from './system/context.ts';
import { sources } from './sources.ts';
import type { AdapterResult, Source } from './types.ts';

export interface RunResult {
  source: string;
  result: AdapterResult;
  title: string;
  body: string;
  branch: string;
  commitMessage: string;
  paths: string[];
  scan: boolean;
}
export function source(root: string, name: string): Source {
  const all = sources(root);
  const found = all.find((s) => s.name === name);
  if (!found) throw new Error(`unknown source ${name}; one of ${all.map((s) => s.name).join(', ')}`);
  // The generated distributions are gitignored (only the release branch commits them), so a sync PR carries sources only.
  return found;
}
export function artifactDirectory(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('invalid source name');
  return join(process.env.RUNNER_TEMP || tmpdir(), 'sync', name);
}
export function assertClean(root: string, paths: string[], runner: ProcessRunner = execute): void {
  if (runner('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], root).trim())
    throw new Error(`destination paths have local changes: ${paths.join(', ')}`);
}
export function sync(
  root: string,
  spec: Source,
  temporary: string,
  ref?: string,
  runner: ProcessRunner = execute,
  log: (message: string) => void = console.log,
): RunResult {
  if (ref && (spec.name !== 'pstack-picks' || !/^[a-f0-9]{40}$/.test(ref)))
    throw new Error('--ref requires pstack-picks and a full 40-character commit');
  const context = createContext(root, temporary, spec.argument, ref, runner, log);
  const result = spec.adapter(context);
  if (existsSync(join(root, 'plugins/catalog.json'))) {
    const output = runner(process.execPath, [join(root, 'tools/harness-compiler/src/cli.ts'), 'build'], root);
    if (output) log(output);
  }
  const values = spec.check(result.values);
  const title = spec.title(values);
  const body =
    spec.bodyFrom === 'adapter'
      ? result.body
      : spec.body?.(values, result.report.join('\n') + (result.report.length ? '\n' : ''));
  if (body === undefined) throw new Error(`${spec.name} produced no PR body`);
  return {
    source: spec.name,
    result,
    title,
    body,
    branch: `sync/${spec.name}`,
    commitMessage: spec.commitMessage?.(values) ?? title,
    paths: spec.paths,
    scan: spec.scan ?? true,
  };
}
export function apply(root: string, name: string, ref?: string): RunResult {
  const spec = source(root, name);
  const dir = artifactDirectory(name);
  // Invalidate the previous result before any validation can fail.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  assertClean(root, spec.paths);
  const temp = mkdtempSync(join(tmpdir(), 'sync-apply-'));
  try {
    const result = sync(root, spec, temp, ref);
    writeFileSync(join(dir, 'body.md'), result.body);
    writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function readResult(name: string): RunResult {
  const parsed: RunResult = JSON.parse(readFileSync(join(artifactDirectory(name), 'result.json'), 'utf8'));
  if (parsed.source !== name || !Array.isArray(parsed.result?.newSkills)) throw new Error('invalid sync result');
  return parsed;
}
export function preview(
  root: string,
  name: string,
  ref?: string,
  runner: ProcessRunner = execute,
  log: (message: string) => void = console.log,
  perform: typeof sync = sync,
): string {
  source(root, name);
  const temp = mkdtempSync(join(tmpdir(), 'sync-preview-'));
  const checkout = join(temp, 'checkout');
  let added = false;
  try {
    runner('git', ['worktree', 'add', '--detach', checkout, 'HEAD'], root);
    added = true;
    log('Previewing committed HEAD; uncommitted changes are excluded.');
    const spec = source(checkout, name);
    const result = perform(checkout, spec, join(temp, 'upstreams'), ref, runner, log);
    log(`${result.title}\n${result.result.newSkills.length} new upstream skills`);
    runner('git', ['add', '-A', '--', ...spec.paths], checkout);
    return runner('git', ['diff', '--cached', '--binary'], checkout);
  } finally {
    try {
      if (added) runner('git', ['worktree', 'remove', '--force', checkout], root);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
}
