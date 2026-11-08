#!/usr/bin/env node
// Writes a markdown file as one self-contained HTML page: the text, each `mermaid` block drawn by Mermaid in the
// browser and each `files` block (and a plan's file map) drawn as a folder tree here in Node:
//   node render.mjs <doc.md> <out.html>
// It runs the checker first and, when that finds an error, prints the checker's lines, exits 1 and writes nothing.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMarkdown, extractBlocks, parseFilesBlock, planMap } from './check.mjs';

// Bumped by hand: Dependabot cannot read these.
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs';
const MARKED_URL = 'https://cdn.jsdelivr.net/npm/marked@18.1.3/lib/marked.esm.js';

// Every tunable look-and-feel value of the page, and the only place that holds a colour or a font. `light` and `dark`
// become the CSS tokens and, through `mermaid`, the diagrams' theme variables.
const THEME = {
  fonts: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  light: {
    bg: '#fbfaf7',
    panel: '#f2efe7',
    text: '#1c1b19',
    muted: '#5c584f',
    line: '#d6d1c4',
    link: '#1d4ed8',
    add: '#166534',
    mod: '#92400e',
    del: '#b42318',
    move: '#0e7490',
  },
  dark: {
    bg: '#161512',
    panel: '#211f1b',
    text: '#ece9e1',
    muted: '#aaa597',
    line: '#3b3832',
    link: '#8ab4ff',
    add: '#4ade80',
    mod: '#fbbf24',
    del: '#f87171',
    move: '#22d3ee',
  },
  mermaid: { fontSize: '16px' },
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MARKS = { '+': 'add', '~': 'mod', '-': 'del', '>': 'move' };

function tally(dir, counts = {}) {
  for (const f of dir.files) counts[f.marker] = (counts[f.marker] ?? 0) + 1;
  for (const d of dir.dirs.values()) tally(d, counts);
  return counts;
}

function dirHtml(name, dir) {
  // A folder with no file of its own and one subfolder holds no change itself, so it folds into the line below it.
  while (!dir.files.length && dir.dirs.size === 1) {
    const [[child, sub]] = dir.dirs;
    name += `/${child}`;
    dir = sub;
  }
  const counts = Object.entries(MARKS)
    .filter(([m]) => tally(dir)[m])
    .map(([m, cls]) => `<span class="count m-${cls}">${escapeHtml(m)}${tally(dir)[m]}</span>`)
    .join(' ');
  return `<li><details class="dir" open><summary><span class="name">${escapeHtml(name)}/</span> ${counts}</summary>${listHtml(dir)}</details></li>`;
}

function listHtml(dir) {
  const dirs = [...dir.dirs].sort(([a], [b]) => a.localeCompare(b)).map(([name, d]) => dirHtml(name, d));
  const files = [...dir.files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (f) =>
        `<li class="file m-${MARKS[f.marker]}"><span class="mark">${escapeHtml(f.marker)}</span> <span class="name">${escapeHtml(f.name)}</span>${f.from ? ` <span class="from">from ${escapeHtml(f.from)}</span>` : ''}</li>`,
    );
  return `<ul>${[...dirs, ...files].join('')}</ul>`;
}

// A folder tree as HTML, built from `files` entries ({ marker, path, from? }).
function treeHtml(entries) {
  const root = { dirs: new Map(), files: [] };
  for (const e of entries) {
    const parts = e.path.split('/').filter(Boolean);
    let dir = root;
    for (const p of parts.slice(0, -1)) {
      if (!dir.dirs.has(p)) dir.dirs.set(p, { dirs: new Map(), files: [] });
      dir = dir.dirs.get(p);
    }
    dir.files.push({ ...e, name: parts.at(-1) ?? e.path });
  }
  return `<div class="tree">${listHtml(root)}</div>`;
}

// The plan's file map, grouped under each task's heading; '' for a document that is not a plan.
function planMapHtml(markdown) {
  let map;
  try {
    map = planMap(markdown);
  } catch {
    return ''; // the checker has already said why
  }
  const tasks = Map.groupBy(map, (m) => m.task);
  if (!tasks.size) return '';
  return `<section class="plan-map"><h2>File map</h2>${[...tasks]
    .map(([task, entries]) => `<h3>${escapeHtml(task)}</h3>${treeHtml(entries)}`)
    .join('')}</section>`;
}

const tokens = (o) =>
  Object.entries(o)
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ');

const css =
  () => `/* Hallmark · document page · system fonts · every colour and font is a token from THEME in render.mjs */
:root { ${tokens({ sans: THEME.fonts.sans, mono: THEME.fonts.mono })} ${tokens(THEME.light)} color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { ${tokens(THEME.dark)} } }
html, body { overflow-x: clip; }
body { margin: 0; background: var(--bg); color: var(--text); font: 1.0625rem/1.65 var(--sans); }
main { max-width: 72rem; margin: 0 auto; padding: 3rem 1rem 6rem; }
#doc > :is(p, ul, ol, blockquote, pre, h1, h2, h3, h4) { max-width: 46rem; }
h1, h2, h3, h4 { font-weight: 650; line-height: 1.25; margin: 2.2em 0 0.6em; }
h1, h2, h3, h4 { text-wrap: balance; }
h1 { font-size: 2.1rem; margin-top: 0; }
h2 { font-size: 1.5rem; padding-top: 0.6em; border-top: 1px solid var(--line); }
h3 { font-size: 1.2rem; }
h4 { font-size: 1.0625rem; }
a { color: var(--link); text-underline-offset: 0.15em; }
:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
code { font: 0.9em var(--mono); background: var(--panel); padding: 0.1em 0.35em; border-radius: 4px; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 0.9rem 1rem; overflow-x: auto; }
pre code { padding: 0; background: none; }
blockquote { margin-left: 0; padding: 0.2rem 1rem; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); }
table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 1.2rem 0; }
th, td { text-align: left; padding: 0.5rem 0.8rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 650; background: var(--panel); }
figure { margin: 1.6rem 0; }
.diagram { border: 1px solid var(--line); border-radius: 8px; padding: 1rem; overflow-x: auto; text-align: center; }
.diagram svg { max-width: 100%; height: auto; }
.diagram-error { border: 1px solid var(--del); color: var(--del); border-radius: 8px; padding: 0.8rem 1rem; text-align: left; }
.diagram-error pre { color: var(--text); margin-bottom: 0; }
.tree { border: 1px solid var(--line); border-radius: 8px; padding: 0.8rem 1rem; font: 0.9375rem/1.7 var(--mono); overflow-x: auto; }
.tree ul { list-style: none; margin: 0; padding-left: 1.4rem; }
.tree > ul { padding-left: 0; }
.tree summary { cursor: pointer; }
.tree summary:active { opacity: 0.7; }
.tree .mark { display: inline-block; width: 1.2em; font-weight: 700; }
.tree .from { color: var(--muted); }
.count { margin-left: 0.4em; font-weight: 700; }
.m-add { color: var(--add); }
.m-mod { color: var(--mod); }
.m-del { color: var(--del); }
.m-move { color: var(--move); }
.plan-map h3 { margin-bottom: 0.4em; }
`;

const mermaidConfig = () => {
  const vars = (c) => ({
    background: c.bg,
    primaryColor: c.panel,
    primaryTextColor: c.text,
    primaryBorderColor: c.muted,
    lineColor: c.muted,
    secondaryColor: c.panel,
    tertiaryColor: c.bg,
    edgeLabelBackground: c.bg,
    fontFamily: THEME.fonts.sans,
    fontSize: THEME.mermaid.fontSize,
  });
  return JSON.stringify({ light: vars(THEME.light), dark: vars(THEME.dark) });
};

// shortcut: the diagram theme follows the colour scheme at load, not live changes; upgrade if the page gets a toggle.
const script = () => `import { marked } from '${MARKED_URL}';
import mermaid from '${MERMAID_URL}';

const themes = ${mermaidConfig()};
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  layout: 'elk',
  theme: 'base',
  themeVariables: dark ? themes.dark : themes.light,
});

const esc = (s) => s.replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
// Trees are keyed by the fence text, so a fence nested in a list or quote cannot pick another block's tree.
const trees = new Map([...document.querySelectorAll('template[data-tree]')].map((t) => [t.dataset.key, t.innerHTML]));
// A scheme other than http, https or mailto (javascript:, data:, ...) is dropped; browsers skip control characters in
// it. marked leaves character references in an href alone and browsers decode them (&#106;avascript:, java&Tab;script:),
// so any & before the first / ? or # counts as unsafe.
const safe = (href) => {
  const h = href.replace(/[\\u0000-\\u0020]/g, '');
  return !/^[^/?#]*&/.test(h) && (!/^[a-z][a-z0-9+.-]*:/i.test(h) || /^(https?|mailto):/i.test(h));
};
// Inside an open <pre> or <script>, marked leaves following text unescaped (escaped: true); the page escapes it anyway.
marked.use({
  walkTokens(token) {
    if (token.type === 'text') token.escaped = false;
  },
  renderer: {
    // The document is shown, never run: raw HTML in it becomes text.
    html({ text }) {
      return esc(text);
    },
    link({ href, tokens }) {
      return safe(href) ? false : this.parser.parseInline(tokens);
    },
    image({ href, text }) {
      return safe(href) ? false : esc(text);
    },
    code({ text, lang }) {
      const kind = (lang ?? '').split(/\\s/)[0];
      if (kind === 'mermaid') return '<figure class="diagram"><pre class="source">' + esc(text) + '</pre></figure>';
      if (kind === 'files' && trees.has(text.trim())) return '<figure>' + trees.get(text.trim()) + '</figure>';
      return false;
    },
  },
});

// A second layer behind the html renderer: no script-like element, event handler or unsafe address survives marked.
function clean(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const el of [...t.content.querySelectorAll('*')]) {
    if (/^(script|style|iframe|object|embed|link|meta|base|form)$/i.test(el.localName)) el.remove();
    else
      for (const { name, value } of [...el.attributes])
        if (/^on/i.test(name) || (/^(href|src|xlink:href)$/i.test(name) && !safe(value))) el.removeAttribute(name);
  }
  return t.innerHTML;
}

const doc = document.getElementById('doc');
doc.innerHTML = clean(marked.parse(JSON.parse(document.getElementById('md').textContent)));
const map = document.getElementById('plan-map');
const h1 = doc.querySelector('h1');
if (map) h1 ? h1.after(map.content) : doc.prepend(map.content);

let n = 0;
for (const pre of doc.querySelectorAll('.diagram > pre.source')) {
  const id = 'diagram-' + n++;
  try {
    pre.parentElement.innerHTML = (await mermaid.render(id, pre.textContent)).svg;
  } catch (e) {
    document.getElementById('d' + id)?.remove();
    pre.parentElement.innerHTML =
      '<div class="diagram-error" role="alert">This diagram did not draw: ' + esc(String(e.message ?? e)) + '<pre>' + esc(pre.textContent) + '</pre></div>';
  }
}
`;

const line = (p) => `${p.level}: ${p.block ? `block ${p.block}: ` : ''}${p.message}`;

// The page for `markdown`; `root` is the repository the checker compares file maps with. Throws, with the checker's
// lines as the message, when the checker finds an error; its warnings go to stderr.
export async function renderPage(markdown, root) {
  const problems = await checkMarkdown(markdown, root);
  if (problems.some((p) => p.level === 'error')) throw new Error(problems.map(line).join('\n'));
  for (const p of problems) console.error(line(p));

  const trees = extractBlocks(markdown)
    .filter((b) => b.kind === 'files')
    .map(
      (b) =>
        `<template data-tree data-key="${escapeHtml(b.text.trim())}">${treeHtml(parseFilesBlock(b.text))}</template>`,
    );
  const map = planMapHtml(markdown);
  const title = escapeHtml(markdown.match(/^# (.+)$/m)?.[1].trim() ?? 'Document');
  // `<` is escaped so quoted HTML such as </script> cannot end the script early.
  const json = JSON.stringify(markdown).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A document with its diagrams and file map, rendered as one page.">
<title>${title}</title>
<style>
${css()}</style>
</head>
<body>
<main>
<article id="doc"><noscript><pre>${escapeHtml(markdown)}</pre></noscript></article>
</main>
${trees.join('\n')}
${map ? `<template id="plan-map">${map}</template>` : ''}
<script type="application/json" id="md">${json}</script>
<script type="module">
${script()}</script>
</body>
</html>
`;
}

// realpath: argv[1] keeps a symlinked folder while import.meta.url resolves it.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [doc, out] = process.argv.slice(2);
  if (!doc || !out) {
    console.error('usage: node render.mjs <doc.md> <out.html>');
    process.exit(1);
  }
  let markdown;
  try {
    markdown = readFileSync(doc, 'utf8');
  } catch (e) {
    console.log(`error: cannot read ${doc}: ${e.message}`);
    process.exit(2);
  }
  try {
    writeFileSync(out, await renderPage(markdown, process.cwd()));
  } catch (e) {
    console.log(e.message);
    process.exitCode = 1;
  }
}
