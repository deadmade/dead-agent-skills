#!/usr/bin/env node
// Checks the `mermaid` and `files` blocks of a markdown file and prints one line per problem:
//   node check.mjs <doc.md> [--root <dir>]
// Exits 1 when any problem is an error. The Mermaid syntax check and the node and participant counts come from
// Mermaid itself (parse.mjs); it runs from a cache folder, never from the plugin folder.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../build-feature/scripts/glance.mjs';

const HERE = import.meta.dirname;
const SKILL = join(HERE, '..');
const WIN = process.platform === 'win32';
const MAX_NODES = 8;
const MAX_PARTICIPANTS = 6;
const INSTALL_MS = 300_000;
const PARSE_MS = 60_000;

const OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

// Every top-level `mermaid` and `files` fence, in order. A fence inside a longer one is text, not a block.
export function extractBlocks(markdown) {
  const blocks = [];
  let open;
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (!open) {
      const m = line.match(OPEN);
      if (m) open = { fence: m[1], kind: m[2], line: i + 1, lines: [] };
      return;
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
      if (open.kind === 'mermaid' || open.kind === 'files')
        blocks.push({ kind: open.kind, text: open.lines.join('\n'), line: open.line });
      open = undefined;
    } else open.lines.push(line);
  });
  // A fence left open runs to the end of the file.
  if (open && (open.kind === 'mermaid' || open.kind === 'files'))
    blocks.push({ kind: open.kind, text: open.lines.join('\n'), line: open.line });
  return blocks;
}

export function parseFilesBlock(text) {
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const move = line.match(/^>\s+(\S+)\s+->\s+(\S+)$/);
    const one = line.match(/^([+~-])\s+(\S+)$/);
    const [from, path] = move ? [move[1], move[2]] : [undefined, one?.[2]];
    if (!path || path.includes('\\')) throw new Error(`bad files line (use / in paths, no spaces): ${line}`);
    entries.push(move ? { marker: '>', path, from } : { marker: one[1], path });
  }
  return entries;
}

const MARKER = { Create: '+', Modify: '~', Delete: '-' };

// Each task's files as `+`, `~`, `-`, from glance.mjs's parse. Throws, with the reason, when the document is not a
// plan that parses or a Files item has no backticked path.
export function planMap(markdown) {
  const map = [];
  for (const t of parse(markdown.replace(/\r\n?/g, '\n')).tasks)
    for (const { verb, path } of t.entries) {
      if (!path) throw new Error(`Task ${t.id}: a ${verb} item has no backticked path`);
      map.push({ task: `Task ${t.id}: ${t.title}`, marker: MARKER[verb], path });
    }
  return map;
}

// An npm that can be started without a shell: `npm` on a POSIX PATH, npm-cli.js beside npm.cmd on Windows, where a
// .cmd cannot be spawned directly. Returns [command, ...leading args], or null.
export function findNpm() {
  const isFile = (f) => statSync(f, { throwIfNoEntry: false })?.isFile() ?? false;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    if (!WIN && isFile(join(dir, 'npm'))) return [join(dir, 'npm')];
    const cli = join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (WIN && isFile(join(dir, 'npm.cmd')) && isFile(cli)) return [process.execPath, cli];
  }
  return null;
}

const firstLine = (text) =>
  String(text ?? '')
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? '';

// Runs a program; resolves with its stdout, or rejects with a one-line reason.
function run(file, args, { cwd, timeout, input }) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { cwd, timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, out, errText) => {
        if (!err) return resolve(out);
        if (err.killed) return reject(new Error(`timed out after ${timeout / 1000} s`));
        const why = firstLine(errText) || err.message;
        reject(new Error(typeof err.code === 'number' ? `exited ${err.code}: ${why}` : why));
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

// An empty or relative value is unset, so the cache can never resolve against the working directory.
const absolute = (value) => (value && isAbsolute(value) ? value : undefined);
const cacheDir = () => {
  const base = WIN
    ? (absolute(process.env.LOCALAPPDATA) ?? join(homedir(), 'AppData', 'Local'))
    : (absolute(process.env.XDG_CACHE_HOME) ?? join(homedir(), '.cache'));
  return join(base, 'dead-agent-skills', 'diagrams-node');
};

// The cache folder holding parse.mjs and an install of the pinned packages. The install is redone when the hash of
// the three files differs from the stamp, and never touches the plugin folder. The three files are copied afresh on
// every run, so a stale or planted copy in the cache is never what runs.
async function parserFolder() {
  const files = [
    [join(SKILL, 'package.json'), 'package.json'],
    [join(SKILL, 'package-lock.json'), 'package-lock.json'],
    [join(HERE, 'parse.mjs'), 'parse.mjs'],
  ];
  const hash = createHash('sha256');
  for (const [from, name] of files) hash.update(`${name}\0`).update(readFileSync(from));
  const stamp = hash.digest('hex');
  const dir = cacheDir();
  const stampFile = join(dir, 'stamp');
  mkdirSync(dir, { recursive: true });
  for (const [from, name] of files) copyFileSync(from, join(dir, name));
  const current = existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp;
  if (current && existsSync(join(dir, 'node_modules'))) return dir;
  const npm = findNpm();
  if (!npm) throw new Error('npm was not found on PATH');
  try {
    await run(npm[0], [...npm.slice(1), 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: dir,
      timeout: INSTALL_MS,
    });
  } catch (e) {
    throw new Error(`npm ci ${e.message}`);
  }
  writeFileSync(stampFile, stamp);
  return dir;
}

// One result per diagram text, from parse.mjs.
async function parseDiagrams(texts) {
  const dir = await parserFolder();
  let out;
  try {
    out = await run(process.execPath, ['parse.mjs'], { cwd: dir, timeout: PARSE_MS, input: JSON.stringify(texts) });
  } catch (e) {
    throw new Error(`parse.mjs ${e.message}`);
  }
  let results;
  try {
    results = JSON.parse(out);
  } catch {
    throw new Error(`parse.mjs printed text that is not JSON: ${firstLine(out).slice(0, 80)}`);
  }
  if (!Array.isArray(results) || results.length !== texts.length || results.some((r) => typeof r?.ok !== 'boolean'))
    throw new Error('parse.mjs printed JSON of the wrong shape');
  return results;
}

export async function checkMarkdown(markdown, root) {
  const problems = [];
  const add = (level, block, message) => problems.push({ level, block, message });
  const here = (path) => existsSync(join(root, path));
  const blocks = extractBlocks(markdown);

  const diagrams = [];
  blocks.forEach((b, i) => {
    const number = i + 1;
    if (b.kind === 'mermaid') return diagrams.push({ number, text: b.text });
    let entries;
    try {
      entries = parseFilesBlock(b.text);
    } catch (e) {
      return add('error', number, e.message);
    }
    // A block a person wrote predicts the repository, so a mismatch is only a warning.
    for (const { marker, path, from } of entries) {
      if (marker === '+' && here(path)) add('warning', number, `+ ${path} already exists`);
      if (marker === '>') {
        if (!here(from)) add('warning', number, `> ${from} does not exist`);
        if (here(path)) add('warning', number, `> ${path} already exists`);
      } else if (marker !== '+' && !here(path)) add('warning', number, `${marker} ${path} does not exist`);
    }
  });

  if (diagrams.length) {
    try {
      const results = await parseDiagrams(diagrams.map((d) => d.text));
      results.forEach((r, i) => {
        const { number } = diagrams[i];
        if (!r.ok) return add('error', number, r.error);
        if (r.nodes > MAX_NODES) add('error', number, `flowchart has ${r.nodes} nodes (at most ${MAX_NODES})`);
        for (const id of r.orphans ?? []) add('error', number, `node "${id}" has no edge`);
        if (r.participants > MAX_PARTICIPANTS)
          add('error', number, `sequence diagram has ${r.participants} participants (at most ${MAX_PARTICIPANTS})`);
      });
    } catch (e) {
      add('warning', 0, `not parser-checked: ${e.message}`);
    }
  }

  // A plan's file map is exact, so it is checked in task order: a file an earlier task creates may be modified.
  try {
    const created = new Set();
    for (const { task, marker, path } of planMap(markdown)) {
      if (marker === '+') {
        if (here(path)) add('warning', 0, `${task}: + ${path} already exists`);
        created.add(path);
      } else if (!created.has(path) && !here(path)) add('error', 0, `${task}: ${marker} ${path} does not exist`);
    }
  } catch (e) {
    // glance.mjs's parse says so when the document has no `### Task` headings; a spec or flow.md has no map to check.
    if (!/^no `### Task/.test(e.message)) add('warning', 0, `no plan map: ${e.message}`);
  }
  return problems;
}

// realpath: argv[1] keeps a symlinked folder while import.meta.url resolves it.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = at < 0 ? process.cwd() : args.splice(at, 2)[1];
  let markdown;
  try {
    markdown = readFileSync(args[0], 'utf8');
  } catch (e) {
    console.log(`error: cannot read ${args[0]}: ${e.message}`);
    process.exit(2);
  }
  const problems = await checkMarkdown(markdown, root);
  for (const p of problems) console.log(`${p.level}: ${p.block ? `block ${p.block}: ` : ''}${p.message}`);
  process.exitCode = problems.some((p) => p.level === 'error') ? 1 : 0;
}
