// Done-check 3: does a headless agent, given only an OpenAPI file and a prompt, reach a real 2xx
// reply and build a fixture from it? Not shipped.
//
// Usage: node agent-check.mjs --spec <file> --store <folder> --out <new folder>
//          [--runs 5] [--model claude-sonnet-5-5] [--prompt "..."]
//
// Needs `cargo build --release --locked -p http-runner` and `npm run build:harnesses` first.
// --store is HTTP_RUNNER_DIR, shared by the runs as one user's logins are.
// Any file outside http-replies/ and dot folders counts as the fixture, so a pass proves a reply value was used, not that the fixture is a good one.

import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, copyFileSync, mkdirSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { basename, delimiter, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(import.meta.dirname, '../../..');
// The agent reads replies, which are untrusted text, so its file tools stay inside its project.
const TOOLS = [
  'Read(./**)',
  'Write(./**)',
  'Edit(./**)',
  'mcp__plugin_http-runner_http__run',
  'mcp__plugin_http-runner_http__generate',
];
const RUN_LIMIT_MS = 20 * 60 * 1000;
const REPLIES = 'http-replies';
// A shorter value matches by chance.
const MIN_VALUE_LENGTH = 4;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function leaves(value) {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (value && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [];
}

function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Whether `project` holds a 2xx reply and a fixture with a value only that reply could supply. */
export function score(project, specText, specName) {
  const all = walk(project);
  const inReplies = (path) => relative(project, path).split(sep)[0] === REPLIES;
  const exchanges = all
    .filter((path) => inReplies(path) && path.endsWith('.json'))
    .map((path) => parsed(readFileSync(path, 'utf8')))
    .filter(Boolean);
  const ok = exchanges.filter((e) => e.response.status >= 200 && e.response.status < 300);
  if (ok.length === 0) {
    return { pass: false, reason: `no 2xx reply among ${exchanges.length} saved` };
  }
  // What the agent sent comes back in an echo, so finding it in a fixture proves nothing.
  const values = new Set(
    ok.flatMap((e) => {
      const sent = `${e.request.url}\n${e.request.body ?? ''}`;
      return leaves(parsed(e.response.body)).filter(
        (v) => v.length >= MIN_VALUE_LENGTH && !specText.includes(v) && !sent.includes(v),
      );
    }),
  );
  // A top-level dot folder is some tool's cache, such as web-mcp's `.web`, never a fixture.
  const hidden = (path) => relative(project, path).startsWith('.');
  const fixtures = all.filter((p) => !inReplies(p) && !hidden(p) && basename(p) !== specName && !p.endsWith('.http'));
  for (const fixture of fixtures) {
    const text = readFileSync(fixture, 'utf8');
    const value = [...values].find((v) => text.includes(v));
    if (value) {
      return { pass: true, reason: 'fixture holds a reply value', value, fixture: relative(project, fixture) };
    }
  }
  return {
    pass: false,
    reason: `2xx saved, but none of ${fixtures.length} files holds one of ${values.size} reply values`,
  };
}

function runOne(n, options) {
  const dir = join(options.out, `run-${n}`);
  const project = join(dir, 'project');
  mkdirSync(project, { recursive: true });
  const specName = basename(options.spec);
  copyFileSync(options.spec, join(project, specName));

  const args = [
    '-p',
    options.prompt,
    '--model',
    options.model,
    '--plugin-dir',
    join(ROOT, '.claude-plugin/http-runner'),
    '--allowedTools',
    TOOLS.join(','),
    '--disallowedTools',
    `Bash,Read(/${options.store}/**),Edit(/${options.store}/**)`,
    '--output-format',
    'stream-json',
    '--verbose',
  ];
  const transcript = openSync(join(dir, 'transcript.jsonl'), 'wx');
  const started = Date.now();
  const child = spawnSync('claude', args, {
    cwd: project,
    stdio: ['ignore', transcript, transcript],
    timeout: RUN_LIMIT_MS,
    env: {
      ...process.env,
      PATH: `${join(ROOT, 'target/release')}${delimiter}${process.env.PATH}`,
      HTTP_RUNNER_DIR: options.store,
    },
  });
  closeSync(transcript);

  const result = {
    run: n,
    model: options.model,
    exit: child.status,
    timedOut: child.error?.code === 'ETIMEDOUT',
    seconds: Math.round((Date.now() - started) / 1000),
    ...score(project, readFileSync(options.spec, 'utf8'), specName),
  };
  appendFileSync(join(options.out, 'results.jsonl'), `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      spec: { type: 'string' },
      store: { type: 'string' },
      out: { type: 'string' },
      runs: { type: 'string', default: '5' },
      model: { type: 'string', default: 'claude-sonnet-5-5' },
      prompt: {
        type: 'string',
        default: 'Create a sandbox shipment with this API and write a test fixture for the reply.',
      },
    },
  });
  if (!values.spec || !values.store || !values.out) {
    throw new Error('--spec, --store and --out are required');
  }
  const options = { ...values, spec: resolve(values.spec), store: resolve(values.store), out: resolve(values.out) };
  mkdirSync(options.out);
  mkdirSync(options.store, { recursive: true });

  const results = Array.from({ length: Number(values.runs) }, (_, i) => runOne(i + 1, options));
  console.log(`passed ${results.filter((r) => r.pass).length} of ${results.length}`);
}
