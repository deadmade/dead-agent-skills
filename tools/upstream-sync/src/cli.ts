import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, artifactDirectory, preview, source } from './application.ts';
import { sources } from './sources.ts';
import { failed, formatOutputs, issues, passed } from './github.ts';
import { execute } from './system/context.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export function parseCommand(args: string[]): {
  command: string;
  args: string[];
  json: boolean;
  githubOutput: boolean;
  ref?: string;
} {
  const [command, ...rest] = args;
  if (!command || !['list', 'preview', 'apply', 'issues', 'failed', 'passed'].includes(command))
    throw new Error(
      'usage: sync list [source] [--json] | preview|apply <source> [--ref <commit>] [--github-output] | issues <source> | failed|passed <source> <url>',
    );
  const positional: string[] = [];
  let json = false,
    githubOutput = false,
    ref: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json' && command === 'list' && !json) json = true;
    else if (arg === '--github-output' && command === 'apply' && !githubOutput) githubOutput = true;
    else if (arg === '--ref' && ['preview', 'apply'].includes(command) && !ref) {
      ref = rest[++i];
      if (!ref || !/^[0-9a-f]{40}$/.test(ref)) throw new Error('--ref needs a full 40-character commit');
    } else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  const count = ['failed', 'passed'].includes(command) ? 2 : 1;
  if (positional.length > count || (command !== 'list' && positional.length !== count))
    throw new Error('invalid command arguments');
  if (ref && positional[0] !== 'pstack-picks') throw new Error('--ref is supported only for pstack-picks');
  if (count === 2) {
    const url = new URL(positional[1]);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid run URL');
  }
  return { command, args: positional, json, githubOutput, ref };
}
export function main(args = process.argv.slice(2)): void {
  const parsed = parseCommand(args);
  const [name, url] = parsed.args;
  if (parsed.command === 'list') {
    const names = name ? [source(root, name).name] : sources(root).map((s) => s.name);
    console.log(parsed.json ? JSON.stringify(names) : names.join('\n'));
    return;
  }
  const spec = source(root, name);
  const gh = (...args: string[]) => execute('gh', args, root);
  if (parsed.command === 'preview') process.stdout.write(preview(root, name, parsed.ref));
  else if (parsed.command === 'apply') {
    if (parsed.githubOutput && !process.env.GITHUB_OUTPUT) throw new Error('--github-output requires GITHUB_OUTPUT');
    const result = apply(root, name, parsed.ref);
    if (parsed.githubOutput)
      appendFileSync(
        process.env.GITHUB_OUTPUT!,
        formatOutputs({
          branch: result.branch,
          title: result.title,
          'commit-message': result.commitMessage,
          'body-path': join(artifactDirectory(name), 'body.md'),
          paths: result.paths.join('\n'),
          scan: String(result.scan),
        }),
      );
    console.log(result.title);
  } else if (parsed.command === 'issues') issues(gh, name, spec.newSkills);
  else if (parsed.command === 'failed') failed(gh, name, url);
  else if (parsed.command === 'passed') passed(gh, name, url);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
