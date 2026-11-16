import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { parseFilesBlock, planMap as planEntries } from '../scripts/check.mjs';
import { cardsHtml, overviewMermaid } from '../scripts/render.mjs';

const SKILL = join(import.meta.dirname, '..');
const RENDER = join(SKILL, 'scripts', 'render.mjs');
const FIXTURE = readFileSync(join(SKILL, 'tests', 'fixtures', 'api-mcp-diagrams.md'), 'utf8');

const temp = () => mkdtempSync(join(tmpdir(), 'diagrams-render-'));
const fence = (kind, body) => `\`\`\`${kind}\n${body}\n\`\`\`\n`;

// Runs the renderer on `markdown` with a temp folder as the working directory (the checker's root).
// The folder is also the checker's cache and its whole PATH, so the checker finds no npm and never touches the user's cache.
function render(markdown, args = (doc, out) => [doc, out]) {
  const dir = temp();
  const doc = join(dir, 'doc.md');
  const out = join(dir, 'out.html');
  writeFileSync(doc, markdown);
  const r = spawnSync(process.execPath, [RENDER, ...args(doc, out)], {
    encoding: 'utf8',
    cwd: dir,
    env: { PATH: dir, HOME: dir, USERPROFILE: dir, XDG_CACHE_HOME: dir, LOCALAPPDATA: dir },
  });
  const html = existsSync(out) ? readFileSync(out, 'utf8') : undefined;
  return { code: r.status, text: (r.stdout ?? '') + (r.stderr ?? ''), err: r.stderr ?? '', html, out };
}

// The markdown a page carries, read back from its JSON block.
const embedded = (html) => JSON.parse(html.match(/<script type="application\/json" id="md">(.*?)<\/script>/s)[1]);
const planMap = (html) => html.match(/<template id="plan-map">(.*?)<\/template>/s)?.[1] ?? '';

const plan = (...tasks) =>
  `# Demo Implementation Plan\n\n${tasks
    .map(
      ([id, ...files]) =>
        `### Task ${id}: t${id}\n\n**Does:** x\n**Depends on:** none\n\n${files.length ? `**Files:**\n${files.join('\n')}\n\n` : ''}- [ ] step\n`,
    )
    .join('\n')}`;

test('writes one page that holds every block’s text', () => {
  const r = render(FIXTURE);
  assert.equal(r.code, 0, r.text);
  assert.match(r.html, /^<!doctype html>/i);
  assert.equal(embedded(r.html), FIXTURE);
  assert.match(r.html, /sequenceDiagram/);
  assert.match(r.html, /<title>Four api-mcp diagrams/);
});

// The Mermaid text of an overview, its lines trimmed.
const lines = (text) => text.split('\n').map((l) => l.trim());

test('overviewMermaid draws a node per file with marker classes, uses and move edges', () => {
  const text = overviewMermaid(
    parseFilesBlock(
      [
        '~ a/b/c/x.ts  why',
        '    + f',
        '    ~ g',
        '    - h',
        '+ a/b/c/y.ts',
        '> a/b/e/old.ts -> a/b/e/new.ts',
        '- top.md',
        '+ q"<i>.ts',
        'a/b/c/x.ts uses a/b/c/y.ts',
      ].join('\n'),
    ),
    'b1',
  );
  const l = lines(text);
  assert.equal(l[0], 'flowchart LR');
  // a/ and a/b/ hold no file of their own, so they fold into one subgraph label.
  assert.ok(l.includes('subgraph b1d0["a/b/"]'), text);
  assert.ok(l.includes('subgraph b1d1["c/"]'), text);
  assert.ok(l.includes('subgraph b1d2["e/"]'), text);
  assert.ok(l.includes('b1f0["~ x.ts<br>+1 ~1 -1"]'), text);
  assert.ok(l.includes('b1f1["+ y.ts"]'), text);
  assert.ok(l.includes('b1f2["#gt; new.ts"]'), text);
  assert.ok(l.includes('b1f3["- top.md"]'), text);
  assert.ok(l.includes('b1f4["+ q#quot;#lt;i#gt;.ts"]'), text);
  assert.ok(l.includes('b1f0 --> b1f1'), text);
  assert.ok(l.includes('b1x0["a/b/e/old.ts"]'), text);
  assert.ok(l.includes('b1x0 -.->|moved| b1f2'), text);
  for (const cls of ['add', 'mod', 'del', 'move', 'other']) assert.match(text, new RegExp(`^ *classDef ${cls} `, 'm'));
  assert.ok(l.includes('class b1f1,b1f4 add'), text);
  assert.ok(l.includes('class b1f0 mod'), text);
  assert.ok(l.includes('class b1f3 del'), text);
  assert.ok(l.includes('class b1f2 move'), text);
  assert.ok(l.includes('class b1x0 other'), text);
});

test('a symbol move to a path not in the map adds a grey node', () => {
  const l = lines(overviewMermaid(parseFilesBlock('~ a.ts\n    > f -> lib/b.ts\n    > g -> c.ts\n+ c.ts'), 'b2'));
  assert.ok(l.includes('b2f0 -.->|"f"| b2x0'));
  assert.ok(l.includes('b2x0["lib/b.ts"]'));
  assert.ok(l.includes('class b2x0 other'));
  assert.ok(l.includes('b2f0 -.->|"g"| b2f1'));
});

test('over 12 files it draws one node per folder with counts', () => {
  const block = [
    ...Array.from({ length: 7 }, (_, i) => `+ src/f${i}.ts`),
    ...Array.from({ length: 5 }, (_, i) => `~ docs/d${i}.md`),
    '- docs/gone.md',
    'src/f0.ts uses docs/d0.md',
    'src/f1.ts uses docs/d1.md',
    'src/f2.ts uses src/f3.ts',
  ].join('\n');
  const text = overviewMermaid(parseFilesBlock(block), 'b1');
  const l = lines(text);
  assert.ok(l.includes('b1d0["src/<br>+7"]'), text);
  assert.ok(l.includes('b1d1["docs/<br>~5 -1"]'), text);
  assert.doesNotMatch(text, /b1f\d|subgraph/);
  assert.deepEqual(
    l.filter((x) => x.includes('-->')),
    ['b1d0 --> b1d1'],
  );
});

test('ids differ between two maps on one page, and paths are escaped', () => {
  const r = render(`${fence('files', '+ a.ts\n+ <i>.ts')}\n${fence('files', '+ b.ts')}`);
  assert.equal(r.code, 0, r.text);
  assert.match(r.html, /b1f0\[&quot;\+ a\.ts&quot;\]/);
  assert.match(r.html, /b2f0\[&quot;\+ b\.ts&quot;\]/);
  assert.match(r.html, /<details class="card c-b1f0">/);
  assert.match(r.html, /<details class="card c-b2f0">/);
  assert.match(r.html, /<figure class="diagram overview"><pre class="source">flowchart LR/);
  assert.match(r.html, /&lt;i&gt;\.ts/);
  assert.doesNotMatch(r.html, /<i>\.ts/);
});

test('refuses and writes nothing when the check fails', () => {
  const r = render(`${fence('files', '+ ok.txt')}\n${fence('files', '+ fine.txt\nmove it')}`);
  assert.equal(r.code, 1);
  assert.match(r.text, /error: block 2: .*move it/);
  assert.equal(r.html, undefined);
});

test('a plan’s overview uses net markers', () => {
  const entries = planEntries(
    plan(
      [1, '- Create: `a.ts`', '- Create: `b.ts`', '- Modify: `c.ts`', '- Modify: `d.ts`'],
      [2, '- Modify: `a.ts`', '- Delete: `b.ts`', '- Delete: `c.ts`'],
    ),
  );
  const l = lines(overviewMermaid(entries, 'p'));
  assert.ok(l.includes('pf0["+ a.ts"]'));
  assert.ok(l.includes('pf1["- c.ts"]'));
  assert.ok(l.includes('pf2["~ d.ts"]'));
  assert.ok(!l.some((x) => x.includes('b.ts')));
});

test('a plan’s page shows one overview and a card per file with its tasks', () => {
  const r = render(plan([1, '- Create: `src/new.ts`, `docs/a.md`'], [2, '- Modify: `src/new.ts` (again)'], [3]));
  assert.equal(r.code, 0, r.text);
  const map = planMap(r.html);
  assert.equal(map.match(/class="diagram overview"/g).length, 1);
  assert.match(map, /pf0\[&quot;\+ new\.ts&quot;\]/);
  assert.match(map, /<details class="card c-pf0">.*?src\/new\.ts.*?Task 1, 2/);
  assert.match(map, /<details class="card c-pf1">.*?docs\/a\.md.*?Task 1</);
  assert.doesNotMatch(map, /Task 3/);
  assert.equal(planMap(render('# Notes\n\nNo tasks here.\n').html), '');
});

// The text of each outline row's cells, and whether the row is untouched.
const rows = (html) =>
  [...new JSDOM(html).window.document.querySelectorAll('.row')].map((r) => [
    ...[...r.children].map((c) => c.textContent),
    r.classList.contains('same'),
  ]);

test('cardsHtml lists the outline in order, marks touched symbols and greys the rest', () => {
  const entries = parseFilesBlock(
    '~ a.ts  why here\n    ~ load  reads more\n    + fresh  new one\n    - get\n    ~ nowhere',
  );
  const outline = [
    ['load', 'function', 1],
    ['save', 'function', 5],
    ['Store', 'class', 7],
    ['Store.get', 'method', 8],
  ].map(([name, kind, line]) => ({ name, kind, line }));
  const html = cardsHtml(entries, new Map([['a.ts', outline]]), 'b1');
  assert.match(html, /^<details class="card c-b1f0"><summary>.*~.*a\.ts.*why here.*<\/summary>/);
  assert.deepEqual(rows(html), [
    ['1', '~', 'load', 'reads more', false],
    ['5', '', 'save', '', true],
    ['7', '', 'Store', '', true],
    ['8', '-', 'Store.get', '', false],
    ['', '+', 'fresh', 'new one', false],
  ]);
  assert.doesNotMatch(html, /no outline/);
  // No outline at all (not outlined): the predicted symbols only.
  const bare = cardsHtml(entries, null, 'b1');
  assert.deepEqual(
    rows(bare).map((r) => r[2]),
    ['load', 'fresh', 'get', 'nowhere'],
  );
  assert.doesNotMatch(bare, /no outline/);
});

test('a file with no grammar says so', () => {
  const entries = parseFilesBlock('~ README.md\n    ~ Intro  reworded\n+ new.ts\n    + f');
  for (const outlines of [new Map(), new Map([['README.md', null]])]) {
    const html = cardsHtml(entries, outlines, 'b1');
    const [readme, created] = html.split('</details>');
    assert.match(readme, /no outline for this file type/);
    assert.deepEqual(rows(readme), [['', '~', 'Intro', 'reworded', false]]);
    assert.doesNotMatch(created, /no outline/);
    assert.deepEqual(rows(created), [['', '+', 'f', '', false]]);
  }
});

test('a symbol two tasks name is one row with its net marker (+ then ~ is +, + then - drops it, - then + is ~)', () => {
  const symbols = (...s) => s.map(([marker, name]) => ({ marker, name }));
  const entries = [
    { task: 'Task 1: t1', marker: '~', path: 'a.ts', symbols: symbols(['+', 'f'], ['+', 'g'], ['-', 'h']), uses: [] },
    { task: 'Task 2: t2', marker: '~', path: 'a.ts', symbols: symbols(['~', 'f'], ['-', 'g'], ['+', 'h']), uses: [] },
  ];
  const html = cardsHtml(entries, null, 'p');
  assert.equal(html.match(/<details/g).length, 1);
  assert.match(html, /Task 1, 2/);
  assert.deepEqual(rows(html), [
    ['', '+', 'f', '', false],
    ['', '~', 'h', '', false],
  ]);
});

test('cardFor maps a node element id of Mermaid 12.3.0’s shape to its card class, and anything else to null', () => {
  const html = render('# T\n').html;
  const cardFor = new Function(`${html.match(/function cardFor[^]*?\n\}/)[0]}; return cardFor;`)();
  assert.equal(cardFor({ id: 'diagram-0-flowchart-b1f0-0' }), 'c-b1f0');
  assert.equal(cardFor({ id: 'diagram-12-flowchart-pf11-37' }), 'c-pf11');
  for (const id of ['', 'diagram-0', 'b1f0', 'diagram-0-flowchart-', 'L_b1f0_b1f1_0'])
    assert.equal(cardFor({ id }), null, id);
});

test('keeps markdown HTML inert: JSON-escaped, an escaped title, and a page script that escapes raw HTML and drops script URLs', () => {
  const evil = '# <img src=x onerror=alert(1)>\n\n</script><script>alert(1)</script> <!-- x\n';
  const r = render(evil);
  assert.equal(r.code, 0, r.text);
  assert.equal(embedded(r.html), evil);
  assert.equal(r.html.split('</script>').length - 1, 2, 'only the page’s own two scripts close');
  assert.match(r.html, /<title>&lt;img src=x onerror=alert\(1\)&gt;<\/title>/);
  // The browser side cannot run here, so this checks the renderers that make the HTML text and filter the URLs.
  assert.match(r.html, /html\(\{ text \}\) \{\s*return esc\(text\);/);
  assert.match(r.html, /link\(\{ href, tokens \}\) \{\s*return safe\(href\) \? false : /);
  assert.match(r.html, /image\(\{ href, title, text \}\) \{\s*if \(!safe\(href\)\) return esc\(text\);/);
  assert.match(r.html, /doc\.innerHTML = clean\(marked\.parse\(/);
  assert.match(r.html, /\(https\?\|mailto\):/);
  assert.match(r.html, /\[\^\/\?#\]\*&/);
  // After an open <pre> or <script>, marked leaves text unescaped (escaped: true); the page must turn that off.
  assert.match(r.html, /walkTokens\(token\) \{\s*if \(token\.type === 'text'\) token\.escaped = false;/);
});

test('the page’s clean pass strips script-like elements, handlers and unsafe addresses and keeps its own markup', () => {
  const html = render('# T\n').html;
  const source = `${html.match(/const safe = [^]*?\n\};/)[0]}\n${html.match(/const KEEP = [^]*?\n\}\n/)[0]}\nreturn clean;`;
  const { document } = new JSDOM('').window;
  const clean = new Function('document', source)(document);
  const out = new JSDOM(
    clean(
      '<p onclick="x()">t</p><img src=x onerror=alert(1)><script>alert(1)</script><iframe src="https://e"></iframe>' +
        '<svg onload=x></svg><a href="javascript:x" onclick="y()">l</a><a href="&#106;avascript:x">m</a>' +
        '<form action="/x"></form><style>p{}</style><a href="https://e.com/?a=1&amp;b=2" title="k">ok</a>' +
        '<figure class="diagram"><pre class="source">d</pre></figure><details class="card c-b1f0" open><summary>s</summary></details>',
    ),
  ).window.document;
  for (const tag of ['script', 'iframe', 'form', 'style']) assert.equal(out.querySelector(tag), null, tag);
  assert.deepEqual(
    [...out.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.name)).filter((n) => /^on/.test(n)),
    [],
  );
  assert.deepEqual(
    [...out.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    [null, null, 'https://e.com/?a=1&b=2'],
  );
  assert.ok(
    out.querySelector('figure.diagram > pre.source') && out.querySelector('details.card.c-b1f0[open] > summary'),
  );
});

test('the clean pass keeps only the attributes marked and the cards write, so an alt-text injection loses its id and style', () => {
  const html = render('# T\n').html;
  const source = `${html.match(/const safe = [^]*?\n\};/)[0]}\n${html.match(/const KEEP = [^]*?\n\}\n/)[0]}\nreturn clean;`;
  const { document } = new JSDOM('').window;
  const clean = new Function('document', source)(document);
  // what marked 16 writes for ![a" style=... id="plan-map" x](https://ok/x.png), where the alt text is not escaped
  const out = new JSDOM(
    clean(
      '<img src="https://ok/x.png" alt="a" style="position:fixed;inset:0" id="plan-map" srcset="https://e/x 1x" data-k="1" x"="">' +
        '<ol start="3"><li><input type="checkbox" checked disabled></li></ol><table><tr><td align="center" class="c">1</td></tr></table>' +
        '<details class="card c-pf0" id="x" data-k="1"><summary>s</summary><div class="row same">r</div></details>',
    ),
  ).window.document;
  const card = out.querySelector('details.card.c-pf0');
  assert.deepEqual(
    [...card.attributes].map((a) => a.name),
    ['class'],
  );
  assert.ok(card.querySelector('.row.same'));
  const img = out.querySelector('img');
  assert.deepEqual(
    [...img.attributes].map((a) => a.name),
    ['src', 'alt'],
  );
  assert.equal(out.getElementById('plan-map'), null);
  assert.equal(out.querySelector('ol').getAttribute('start'), '3');
  assert.ok(out.querySelector('input[type=checkbox][checked][disabled]') && out.querySelector('td[align=center].c'));
});

test('the page’s URL filter rejects script schemes, including ones hidden in character references', () => {
  const html = render('# T\n').html;
  const safe = new Function(`${html.match(/const safe = [^]*?\n\};/)[0]}; return safe;`)();
  for (const href of [
    'javascript:alert(1)',
    'JaVa\tScRiPt:alert(1)',
    'data:text/html,x',
    '&#106;avascript:alert(1)',
    'java&Tab;script:alert(1)',
    '&#x6A;avascript&colon;alert(1)',
    // Two leading slashes or backslashes name a host: from a file page on Windows that is a network share.
    '//evil.example/a.png',
    '\\\\evil.example\\a.png',
    '/\\evil.example/a.png',
    '\\/evil.example/a.png',
  ])
    assert.equal(safe(href), false, href);
  for (const href of ['https://example.com/?a=1&b=2', 'mailto:a@b.c', './a.md', '#top', 'a/b.md', '/a/b.md', ''])
    assert.equal(safe(href), true, href);
});

test('each block’s map is keyed by the text of its fence', () => {
  const r = render(`${fence('files', '+ a.ts')}\n${fence('files', '+ b.ts')}`);
  assert.match(r.html, /<template data-files data-key="\+ a\.ts">/);
  assert.match(r.html, /<template data-files data-key="\+ b\.ts">/);
});

test('prints the checker’s warnings to stderr and still writes the page', () => {
  const r = render(fence('files', '~ gone.ts'));
  assert.equal(r.code, 0, r.text);
  assert.match(r.err, /warning: block 1: ~ gone\.ts does not exist/);
  assert.ok(r.html);
});

test('a missing output argument prints a usage line and exits 1', () => {
  const r = render('# T\n', (doc) => [doc]);
  assert.equal(r.code, 1);
  assert.match(r.err, /usage: node render\.mjs <doc\.md> <out\.html>/);
});

test('Mermaid runs at the strict security level', () => {
  const { html } = render('# T\n');
  assert.match(html, /securityLevel: 'strict'/);
  assert.doesNotMatch(html, /securityLevel: '(loose|antiscript|sandbox)'/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/mermaid@12\.3\.0\//);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/marked@18\.1\.3\//);
});

test('ELK is set once for the page', () => {
  const { html } = render('# T\n');
  assert.equal(html.match(/layout: 'elk'/g).length, 1);
  assert.equal(html.match(/mermaid\.initialize\(/g).length, 1);
});

test('the page links no web font and no stylesheet', () => {
  const { html } = render(FIXTURE);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /@import|@font-face|fonts\.(googleapis|gstatic)/i);
  assert.doesNotMatch(html, /src="https?:/i);
});
