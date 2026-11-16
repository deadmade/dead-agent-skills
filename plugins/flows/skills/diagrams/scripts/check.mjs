#!/usr/bin/env node
// Checks the `mermaid` and `files` blocks of a markdown file and prints one line per problem:
//   node check.mjs <doc.md> [--root <dir>]
// Exits 1 when any problem is an error. The Mermaid syntax check and the node and participant counts come from
// Mermaid itself (parse.mjs), the files' real outlines from tree-sitter (outline.mjs); both run from a cache folder,
// never from the plugin folder.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../build-feature/scripts/glance.mjs';
import { LANGS } from './outline.mjs';

const HERE = import.meta.dirname;
const SKILL = join(HERE, '..');
const WIN = process.platform === 'win32';
const MAX_NODES = 8;
const MAX_PARTICIPANTS = 6;
const INSTALL_MS = 300_000;
const PARSE_MS = 60_000;

const OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

// Every top-level `mermaid` and `files` fence, in order. A fence inside a longer one is text, not a block. The opening
// fence's indent (a fence nested in a list) is stripped from the block's lines.
export function extractBlocks(markdown) {
  const blocks = [];
  let open;
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (!open) {
      const m = line.match(OPEN);
      const indent = m && new RegExp(`^ {0,${line.length - line.trimStart().length}}`);
      if (m) open = { fence: m[1], kind: m[2], line: i + 1, lines: [], indent };
      return;
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === open.fence[0] && close[1].length >= open.fence.length) {
      if (open.kind === 'mermaid' || open.kind === 'files')
        blocks.push({ kind: open.kind, text: open.lines.join('\n'), line: open.line });
      open = undefined;
    } else open.lines.push(line.replace(open.indent, ''));
  });
  // A fence left open runs to the end of the file.
  if (open && (open.kind === 'mermaid' || open.kind === 'files'))
    blocks.push({ kind: open.kind, text: open.lines.join('\n'), line: open.line });
  return blocks;
}

// `<+|~|-> <name>` or `> <a> -> <b>`, then optionally two or more spaces and the why.
const ITEM = /^(?:([+~-])\s+(\S+)|>\s+(\S+)\s+->\s+(\S+))(?:\s{2,}(\S.*))?$/;
const USES = /^(\S+)\s+uses\s+(\S+)$/;

// File lines, the symbol lines indented under each and unindented `<a> uses <b>` lines. Throws on any other line and
// on a `uses` whose first path is not a file of the block; the caller checks the second path.
export function parseFilesBlock(text) {
  const entries = [];
  const relations = [];
  let fileIndent;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const indent = raw.length - raw.trimStart().length;
    // The first line is a file line, whatever its indent; a symbol line is indented deeper than its file line.
    const symbol = indent > fileIndent;
    const uses = !symbol && line.match(USES);
    if (uses) {
      relations.push(uses);
      continue;
    }
    const m = line.match(ITEM);
    const bad = () => new Error(`bad files line (use / in paths, no spaces): ${line}`);
    if (!m) throw bad();
    const [, marker = '>', name, from, to, why] = m;
    if ([to, symbol ? undefined : (name ?? from)].some((p) => p?.includes('\\'))) throw bad();
    if (symbol) entries.at(-1).symbols.push({ marker, name: name ?? from, ...(why && { why }), ...(to && { to }) });
    else {
      fileIndent = indent;
      entries.push({ marker, path: name ?? to, ...(from && { from }), ...(why && { why }), symbols: [], uses: [] });
    }
  }
  for (const [line, a, b] of relations) {
    const source = entries.find((e) => e.path === a);
    if (!source) throw new Error(`uses names a path not in the block: ${line}`);
    source.uses.push(b);
  }
  return entries;
}

const MARKER = { Create: '+', Modify: '~', Delete: '-' };
const TASK = /^### Task (\d+[a-z]?)/;

// Block number (in extractBlocks' order) -> task id, for the first `files` fence in each `### Task` section.
function taskFences(markdown) {
  const heads = [];
  let fence = false;
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^#{2,3} /.test(line)) heads.push({ id: line.match(TASK)?.[1], line: i + 1 });
  });
  const fences = new Map();
  extractBlocks(markdown).forEach((b, i) => {
    const id = heads.findLast((h) => h.line < b.line)?.id;
    if (b.kind === 'files' && id && ![...fences.values()].includes(id)) fences.set(i + 1, id);
  });
  return fences;
}

// Each task's files as `+`, `~`, `-`, from glance.mjs's parse, with the why, symbols and `uses` of the task's own
// `files` fence. Throws, with the reason, when the document is not a plan that parses or a Files item has no
// backticked path; a problem in a task's fence goes to `add(level, block, message)` instead.
export function planMap(markdown, add = () => {}) {
  const tasks = parse(markdown.replace(/\r\n?/g, '\n')).tasks.map((t) => ({
    id: t.id,
    entries: t.entries.map(({ verb, path }) => {
      if (!path) throw new Error(`Task ${t.id}: a ${verb} item has no backticked path`);
      return { task: `Task ${t.id}: ${t.title}`, marker: MARKER[verb], path, symbols: [], uses: [] };
    }),
  }));
  const blocks = extractBlocks(markdown);
  const fences = [...taskFences(markdown)];
  const map = tasks.flatMap((t) => t.entries);
  const paths = new Set(map.map((e) => e.path));
  for (const { id, entries } of tasks) {
    const number = fences.find(([, fenced]) => fenced === id)?.[0];
    if (!number) continue;
    const task = `Task ${id}`;
    let fenced;
    try {
      fenced = parseFilesBlock(blocks[number - 1].text);
    } catch (e) {
      add('error', number, `${task}: ${e.message}`);
      continue;
    }
    for (const { path, why, symbols, uses } of fenced) {
      const entry = entries.find((e) => e.path === path);
      if (!entry) add('error', number, `${task}: its files block names ${path}, which its Files list doesn't`);
      else Object.assign(entry, why && { why }, { symbols, uses });
      for (const to of uses)
        if (!paths.has(to)) add('error', number, `${task}: uses names a path not in the plan's map: ${to}`);
    }
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

// The cache folder holding parse.mjs, outline.mjs and an install of the pinned packages. The install is redone when
// the hash of the four files differs from the stamp, and never touches the plugin folder. The four files are copied
// afresh on every run, so a stale or planted copy in the cache is never what runs.
// One install per run: the diagrams and the outlines share it, and a failed install is not tried twice.
let folder;
const parserFolder = () => (folder ??= installParser());
async function installParser() {
  const files = [
    [join(SKILL, 'package.json'), 'package.json'],
    [join(SKILL, 'package-lock.json'), 'package-lock.json'],
    [join(HERE, 'parse.mjs'), 'parse.mjs'],
    [join(HERE, 'outline.mjs'), 'outline.mjs'],
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

// Runs `script` of the cache folder with `input` as JSON on stdin; resolves with the JSON it prints.
async function runInCache(script, input) {
  const dir = await parserFolder();
  let out;
  try {
    out = await run(process.execPath, [script], { cwd: dir, timeout: PARSE_MS, input: JSON.stringify(input) });
  } catch (e) {
    throw new Error(`${script} ${e.message}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`${script} printed text that is not JSON: ${firstLine(out).slice(0, 80)}`);
  }
}

// One result per diagram text, from parse.mjs.
async function parseDiagrams(texts) {
  const results = await runInCache('parse.mjs', texts);
  if (!Array.isArray(results) || results.length !== texts.length || results.some((r) => typeof r?.ok !== 'boolean'))
    throw new Error('parse.mjs printed JSON of the wrong shape');
  return results;
}

// Each path (relative to `root`) -> its declarations [{ name, kind, line }] from outline.mjs, or null when its
// extension has no grammar. Rejects with a one-line reason.
export async function outlineFiles(paths, root) {
  // join, as checkMarkdown's `here` does, so a path written with a leading / stays under the root.
  const files = paths.map((p) => join(resolve(root), p));
  const results = await runInCache('outline.mjs', files);
  if (!results || files.some((f) => results[f] !== null && !Array.isArray(results[f])))
    throw new Error('outline.mjs printed JSON of the wrong shape');
  return new Map(paths.map((p, i) => [p, results[files[i]]]));
}

export async function checkMarkdown(markdown, root) {
  const problems = [];
  const add = (level, block, message) => problems.push({ level, block, message });
  const here = (path) => existsSync(join(root, path));
  const blocks = extractBlocks(markdown);
  const fences = taskFences(markdown);

  const diagrams = [];
  const written = [];
  blocks.forEach((b, i) => {
    const number = i + 1;
    if (b.kind === 'mermaid') return diagrams.push({ number, text: b.text });
    // A task's own fence is checked with the plan map below.
    if (fences.has(number)) return;
    let entries;
    try {
      entries = parseFilesBlock(b.text);
    } catch (e) {
      return add('error', number, e.message);
    }
    written.push({ number, entries });
    // A block a person wrote predicts the repository, so a mismatch is only a warning.
    const paths = new Set(entries.map((e) => e.path));
    for (const { marker, path, from, symbols, uses } of entries) {
      for (const to of uses)
        if (!paths.has(to)) add('error', number, `uses names a path not in the block: ${path} uses ${to}`);
      if (marker === '~' && !symbols.length) add('warning', number, `~ ${path} has no symbols`);
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
  let plan = [];
  try {
    plan = planMap(markdown, add);
  } catch (e) {
    // glance.mjs's parse says so when the document has no `### Task` headings; a spec or flow.md has no map to check.
    if (!/^no `### Task/.test(e.message)) add('warning', 0, `no plan map: ${e.message}`);
  }
  const created = new Set();
  for (const { task, marker, path, symbols } of plan) {
    if (marker === '~' && !symbols.length) add('warning', 0, `${task}: ~ ${path} has no symbols`);
    if (marker === '+') {
      if (here(path)) add('warning', 0, `${task}: + ${path} already exists`);
      created.add(path);
    } else if (!created.has(path) && !here(path)) add('error', 0, `${task}: ${marker} ${path} does not exist`);
  }

  // The file whose real outline an entry's symbols are checked against: an existing `~` or `-` file with a grammar,
  // or a `>` file's source.
  const source = ({ marker, path, from }) => {
    const file = marker === '>' ? from : marker !== '+' && path;
    return file && Object.hasOwn(LANGS, extname(file)) && here(file) ? file : undefined;
  };
  const files = [...new Set([...written.flatMap((w) => w.entries), ...plan].map(source).filter(Boolean))];
  let outlines = new Map();
  if (files.length) {
    try {
      outlines = await outlineFiles(files, root);
    } catch (e) {
      add('warning', 0, `not outlined: ${e.message}`);
      return { problems, outlines: null };
    }
  }
  // A symbol matches a declaration by its full name or its last segment; `added` holds what earlier tasks add.
  const checkSymbols = (number, prefix, entry, added) => {
    const file = source(entry);
    const outline = file && outlines.get(file);
    if (!outline) return;
    for (const { marker, name } of entry.symbols) {
      const found = added.has(name) || outline.some((o) => o.name === name || o.name.split('.').at(-1) === name);
      if (marker === '+' && found) add('warning', number, `${prefix}+ ${file}: ${name} already exists`);
      if (marker !== '+' && !found) add('warning', number, `${prefix}${marker} ${file}: ${name} not found`);
    }
  };
  for (const { number, entries } of written) for (const entry of entries) checkSymbols(number, '', entry, new Set());
  const added = new Map();
  for (const entry of plan) {
    if (!added.has(entry.path)) added.set(entry.path, new Set());
    checkSymbols(0, `${entry.task}: `, entry, added.get(entry.path));
    for (const { marker, name } of entry.symbols) if (marker === '+') added.get(entry.path).add(name);
  }
  return { problems, outlines };
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
  const { problems } = await checkMarkdown(markdown, root);
  for (const p of problems) console.log(`${p.level}: ${p.block ? `block ${p.block}: ` : ''}${p.message}`);
  process.exitCode = problems.some((p) => p.level === 'error') ? 1 : 0;
}
