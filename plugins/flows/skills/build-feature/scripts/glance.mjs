#!/usr/bin/env node
// Draws a plan's task graph and task table as plain text between `<!-- glance -->` markers at the top of plan.md.
// With `--check` it prints the block and writes nothing, for a plan the run was given and must not change.
// The field, `Depends` and comment rules below are this script's own; the diagrams skill reads a plan's Files lists
// through the same parser.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPEN = '<!-- glance -->';
const CLOSE = '<!-- /glance -->';
// The markers count only on lines of their own, so prose that names them is left alone.
const OPEN_LINE = /^<!-- glance -->$/m;
const CLOSE_LINE = /^<!-- \/glance -->$/m;
const WIDTH = 110;
const LABEL = 24;
const DOES = 60;
const ADDS = 30;

const plain = (line) =>
  line
    .trim()
    .replace(/^[-*] /, '')
    .replace(/^\*\*/, '');

// `**Key:** value`, with the lines wrapped under it, up to a blank, bold or list line.
function field(lines, key) {
  const head = (l) => {
    const t = plain(l);
    if (t.slice(0, key.length).toLowerCase() !== key.toLowerCase() || t[key.length] !== ':') return undefined;
    return t
      .slice(key.length + 1)
      .trim()
      .replace(/^\*\*/, '')
      .trim();
  };
  const at = lines.findIndex((l) => head(l) !== undefined);
  if (at < 0) return undefined;
  let value = head(lines[at]);
  for (const next of lines.slice(at + 1)) {
    const t = next.trim();
    if (!t || t.startsWith('**') || t.startsWith('- ') || t.startsWith('* ')) break;
    value += ' ' + t;
  }
  return value.trim();
}

const ID = /^(\d+)([a-z]?)$/;
const order = (a, b) => {
  const [, an, al] = a.match(ID);
  const [, bn, bl] = b.match(ID);
  return Number(an) - Number(bn) || al.localeCompare(bl);
};

// `depends`: `none`, or the ids that follow a `Task`/`Tasks` word.
function depends(value) {
  const words = value.split(/[\s,.;()]+/).filter(Boolean);
  if (words[0]?.toLowerCase() === 'none') return [];
  const out = [];
  let listing = false;
  for (const w of words) {
    if (/^tasks?$/i.test(w)) listing = true;
    else if (listing && (/^and$/i.test(w) || w === '&')) continue;
    else if (listing && ID.test(w)) out.push(w);
    else listing = false;
  }
  return out.length ? out : undefined;
}

const isFence = (line) => /^\s*(```|~~~)/.test(line);

// `stripComments`: a `<!-- … -->` is removed only where it starts a line outside a fence; a `<!--` in prose,
// inline code or a fence, or one never closed, is text.
function stripComments(text) {
  let out = '';
  let fence = false;
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf('\n', pos);
    const end = nl < 0 ? text.length : nl + 1;
    const line = text.slice(pos, end);
    if (isFence(line)) fence = !fence;
    const open = pos + line.length - line.trimStart().length;
    const close = text.startsWith('<!--', open) ? text.indexOf('-->', open + 4) : -1;
    if (!fence && close >= 0) {
      out += text.slice(pos, open);
      pos = close + 3;
      continue;
    }
    out += line;
    pos = end;
  }
  return out;
}

// `a, b (a note, with a comma), c` split at `, ` outside parentheses and code spans.
function items(text) {
  const out = [];
  let depth = 0;
  let code = false;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '`') code = !code;
    else if (code) continue;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0 && text[i + 1] === ' ') {
      out.push(text.slice(from, i));
      from = i + 2;
    }
  }
  out.push(text.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

// A `- Create|Modify|Delete:` bullet's files. An item that is not one backticked path with an optional (note) gets an
// empty path, for the caller to report; this parser never throws on a Files line.
function fileEntries(bullet) {
  const m = bullet.match(/^- (Create|Modify|Delete):\s*(.*)$/);
  if (!m) return [];
  return items(m[2]).map((item) => ({ verb: m[1], path: item.match(/^`([^`]+)`(?:\s*\(.*\))?$/s)?.[1] ?? '' }));
}

export function parse(text) {
  // Comments are stripped and fenced lines are neither headings nor fields.
  const lines = stripComments(text).split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? '# Plan')
    .slice(2)
    .replace(/ Implementation Plan$/, '')
    .trim();
  const tasks = [];
  let current;
  let fence = false;
  for (const line of lines) {
    if (isFence(line)) fence = !fence;
    if (fence || isFence(line)) continue;
    const head = line.match(/^### Task (\d+[a-z]?)[:.–—-]?\s*(.*)$/);
    if (head) tasks.push((current = { id: head[1], title: head[2].trim(), lines: [] }));
    else if (/^#{2,3} /.test(line)) current = undefined;
    else current?.lines.push(line);
  }
  if (!tasks.length) throw new Error('no `### Task <n>:` headings found');
  for (const t of tasks) {
    const d = field(t.lines, 'Depends on');
    if (d === undefined) throw new Error(`Task ${t.id}: no **Depends on:** line`);
    t.depends = depends(d);
    if (t.depends === undefined) throw new Error(`Task ${t.id}: **Depends on:** names no task ("${d}")`);
    t.does = field(t.lines, 'Does') ?? '';
    t.adds = field(t.lines, 'Adds');
    const size = field(t.lines, 'Size');
    const n = size?.match(/^~(\d+)(?:\s+lines?)?$/);
    if (size !== undefined && !n) throw new Error(`Task ${t.id}: **Size:** is not ~N ("${size}")`);
    t.size = n ? Number(n[1]) : undefined;
    const at = t.lines.findIndex((l) => /^\*\*Files:\*\*/.test(l.trim()));
    // Paths written inline after **Files:**, then the bullets under it, blank lines around them allowed; the list
    // ends at a bold line, a heading or a step.
    t.files = ((field(t.lines, 'Files') ?? '').match(/`[^`]+`/g) ?? []).length;
    t.entries = [];
    for (const l of at < 0 ? [] : t.lines.slice(at + 1)) {
      if (/^(\*\*|#|- \[)/.test(l.trim())) break;
      if (l.startsWith('- ')) {
        t.files += 1;
        t.entries.push(...fileEntries(l.trimEnd()));
      }
    }
  }
  return { title, tasks: tasks.sort((a, b) => order(a.id, b.id)) };
}

function layers(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks)
    for (const d of t.depends)
      if (!byId.has(d)) throw new Error(`Task ${t.id} depends on Task ${d}, which the plan doesn't have`);
  const layer = new Map();
  const visiting = [];
  const depth = (t) => {
    if (layer.has(t.id)) return layer.get(t.id);
    if (visiting.includes(t.id)) {
      const cycle = visiting.slice(visiting.indexOf(t.id)).sort(order);
      throw new Error(`cycle: ${cycle.map((id) => `Task ${id}`).join(', ')}`);
    }
    visiting.push(t.id);
    const n = 1 + Math.max(0, ...t.depends.map((d) => depth(byId.get(d))));
    visiting.pop();
    layer.set(t.id, n);
    return n;
  };
  const rows = [];
  for (const t of tasks) (rows[depth(t) - 1] ??= []).push(t);
  return rows;
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function render({ title, tasks }) {
  const sizes = tasks.map((t) => t.size);
  const lines = sizes.includes(undefined) ? 'size unknown' : `~${sizes.reduce((a, b) => a + b, 0)} lines`;
  const files = tasks.reduce((a, t) => a + t.files, 0);
  const out = [`Plan: ${title} · ${tasks.length} tasks · ${lines} · ${files} files`];
  layers(tasks).forEach((row, i) => {
    const boxes = row.map(
      (t) => `[${t.id} ${cut(t.title, LABEL)}${t.depends.length ? ` ←${[...t.depends].sort(order).join(',')}` : ''}]`,
    );
    const prefix = `${String(i + 1).padStart(2)}  `;
    let line = prefix + boxes[0];
    for (const box of boxes.slice(1)) {
      if (line.length + 2 + box.length > WIDTH) {
        out.push(line);
        line = ' '.repeat(prefix.length + 1) + box;
      } else line += `  ${box}`;
    }
    out.push(line);
  });
  out.push('');
  const table = [['#', 'does', 'files', 'adds', 'size']].concat(
    tasks.map((t) => [
      t.id,
      cut(t.does, DOES),
      String(t.files),
      t.adds ? cut(t.adds, ADDS) : '?',
      t.size === undefined ? '?' : `~${t.size}`,
    ]),
  );
  const widths = table[0].map((_, c) => Math.max(...table.map((r) => r[c].length)));
  for (const r of table)
    out.push(
      r
        .map((cell, c) => cell.padEnd(widths[c]))
        .join('  ')
        .trimEnd(),
    );
  return `${OPEN}\n\`\`\`\n${out.join('\n')}\n\`\`\`\n${CLOSE}`;
}

// The existing block's [start, end) in LF text, or undefined.
function block(text) {
  const open = text.match(OPEN_LINE);
  const close = text.match(CLOSE_LINE);
  if (!open || !close || close.index < open.index) return undefined;
  return [open.index, close.index + CLOSE.length];
}

// A CRLF plan is read and written back as CRLF.
export function glance(input) {
  const crlf = input.includes('\r\n');
  const text = input.replace(/\r\n?/g, '\n');
  const blockText = render(parse(text));
  const at = block(text);
  let out;
  if (at) out = text.slice(0, at[0]) + blockText + text.slice(at[1]);
  else {
    const heading = text.search(/^# /m);
    if (heading < 0) out = `${blockText}\n\n${text}`;
    else {
      const eol = text.indexOf('\n', heading);
      const cut = eol < 0 ? text.length : eol + 1;
      out = `${text.slice(0, cut)}\n${blockText}\n${text.slice(cut)}`;
    }
  }
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

export function run(path, check = false) {
  try {
    const out = glance(readFileSync(path, 'utf8'));
    if (!check) writeFileSync(path, out);
    const lf = out.replace(/\r\n/g, '\n');
    const [start, end] = block(lf);
    return { code: 0, out: lf.slice(start, end) };
  } catch (e) {
    return { code: 1, out: e.message };
  }
}

// realpath: run through a symlinked folder, argv[1] keeps the link while import.meta.url resolves it.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const { code, out } = run(
    args.find((a) => a !== '--check'),
    check,
  );
  console.log(out);
  process.exit(code);
}
