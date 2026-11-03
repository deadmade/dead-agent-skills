#!/usr/bin/env node
// Draws a plan's task graph and task table as plain text between `<!-- glance -->` markers at the top of plan.md.
// Fields are read the way flow-cockpit's plan parser reads them (crates/flow-cockpit/core/src/doc/plan.rs), so both
// draw the same graph from the same plan.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OPEN = '<!-- glance -->';
const CLOSE = '<!-- /glance -->';
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

// plan.rs `depends`: `none`, or the ids that follow a `Task`/`Tasks` word.
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

function parse(text) {
  const lines = text.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) ?? '# Plan')
    .slice(2)
    .replace(/ Implementation Plan$/, '')
    .trim();
  const tasks = [];
  let current;
  for (const line of lines) {
    const head = line.match(/^### Task (\d+[a-z]?)[:.–—-]?\s*(.*)$/);
    if (head) tasks.push((current = { id: head[1], title: head[2].trim(), lines: [] }));
    else if (/^#{2,3} /.test(line)) current = undefined;
    else current?.lines.push(line);
  }
  for (const t of tasks) {
    const d = field(t.lines, 'Depends on');
    if (d === undefined) throw new Error(`Task ${t.id}: no **Depends on:** line`);
    t.depends = depends(d) ?? [];
    t.does = field(t.lines, 'Does') ?? '';
    t.adds = field(t.lines, 'Adds');
    const size = field(t.lines, 'Size');
    if (size !== undefined && !/^~\d+/.test(size)) throw new Error(`Task ${t.id}: **Size:** is not ~N ("${size}")`);
    t.size = size === undefined ? undefined : Number(size.match(/^~(\d+)/)[1]);
    const at = t.lines.findIndex((l) => /^\*\*Files:\*\*/.test(l.trim()));
    t.files = 0;
    // The bullets under **Files:**, blank lines around them allowed; the list ends at a bold line, a heading or a step.
    for (const l of at < 0 ? [] : t.lines.slice(at + 1)) {
      if (/^(\*\*|#|- \[)/.test(l.trim())) break;
      if (l.startsWith('- ')) t.files += 1;
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

export function glance(text) {
  const blockText = render(parse(text));
  const start = text.indexOf(OPEN);
  const end = text.indexOf(CLOSE);
  if (start >= 0 && end > start) return text.slice(0, start) + blockText + text.slice(end + CLOSE.length);
  const heading = text.search(/^# /m);
  if (heading < 0) return `${blockText}\n\n${text}`;
  const eol = text.indexOf('\n', heading);
  const at = eol < 0 ? text.length : eol + 1;
  return `${text.slice(0, at)}\n${blockText}\n${text.slice(at)}`;
}

export function run(path) {
  try {
    const text = readFileSync(path, 'utf8');
    const out = glance(text);
    writeFileSync(path, out);
    return { code: 0, out: out.slice(out.indexOf(OPEN), out.indexOf(CLOSE) + CLOSE.length) };
  } catch (e) {
    return { code: 1, out: e.message };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, out } = run(process.argv[2]);
  console.log(out);
  process.exit(code);
}
