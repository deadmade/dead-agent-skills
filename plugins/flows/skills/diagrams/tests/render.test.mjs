import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const SKILL = join(import.meta.dirname, '..');
const RENDER = join(SKILL, 'scripts', 'render.mjs');
const FIXTURE = readFileSync(join(SKILL, 'tests', 'fixtures', 'api-mcp-diagrams.md'), 'utf8');

const temp = () => mkdtempSync(join(tmpdir(), 'diagrams-render-'));
const fence = (kind, body) => `\`\`\`${kind}\n${body}\n\`\`\`\n`;

// Runs the renderer on `markdown` with a temp folder as the working directory (the checker's root).
function render(markdown, args = (doc, out) => [doc, out]) {
  const dir = temp();
  const doc = join(dir, 'doc.md');
  const out = join(dir, 'out.html');
  writeFileSync(doc, markdown);
  const r = spawnSync(process.execPath, [RENDER, ...args(doc, out)], { encoding: 'utf8', cwd: dir });
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

test('draws the folder tree in Node with markers and per-folder counts, unchanged folders collapsed, <details> to collapse', () => {
  const r = render(
    fence(
      'files',
      '+ a/b/c/x.ts\n~ a/b/c/y.ts\n- a/b/d/z.ts\n+ a/b/d/w.ts\n> a/b/e/old.ts -> a/b/e/new.ts\n+ top.md\n+ <i>.ts',
    ),
  );
  assert.equal(r.code, 0, r.text);
  // a/ and a/b/ hold no file of their own, so they fold into one line; c has two changes, d has two.
  assert.match(r.html, /<summary>[^]*?a\/b[^]*?<\/summary>/);
  assert.doesNotMatch(r.html, /<summary>[^<]*<span class="name">a\/<\/span>/);
  assert.match(r.html, /<details class="dir" open>/);
  const summary = (name) => r.html.match(new RegExp(`<summary>(?:(?!</summary>).)*?${name}.*?</summary>`, 's'))[0];
  assert.match(summary('c\\/'), /m-add[^>]*>\+1/);
  assert.match(summary('c\\/'), /m-mod[^>]*>~1/);
  assert.match(summary('d\\/'), /m-del[^>]*>-1/);
  assert.match(summary('e\\/'), /m-move[^>]*>&gt;1/);
  assert.match(summary('a\\/b'), /\+2/);
  assert.match(r.html, /<li class="file m-move">[^]*?new\.ts[^]*?old\.ts/);
  assert.match(r.html, /&lt;i&gt;\.ts/);
  assert.doesNotMatch(r.html, /<i>\.ts/);
});

test('refuses and writes nothing when the check fails', () => {
  const r = render(`${fence('files', '+ ok.txt')}\n${fence('files', '+ fine.txt\nmove it')}`);
  assert.equal(r.code, 1);
  assert.match(r.text, /error: block 2: .*move it/);
  assert.equal(r.html, undefined);
});

test('a plan gets a file map from its Files lists', () => {
  const r = render(plan([1, '- Create: `src/new.ts`, `docs/a.md`'], [2, '- Modify: `src/new.ts` (again)']));
  assert.equal(r.code, 0, r.text);
  const map = planMap(r.html);
  assert.match(map, /Task 1: t1/);
  assert.match(map, /Task 2: t2/);
  assert.match(map, /<li class="file m-add">[^]*?new\.ts/);
  assert.match(map, /<li class="file m-mod">[^]*?new\.ts/);
  assert.match(map, /docs\/?<\/span>/);
});

test('a task without Files shows no map lines', () => {
  const r = render(plan([1, '- Create: `src/new.ts`'], [2]));
  assert.equal(r.code, 0, r.text);
  const map = planMap(r.html);
  assert.match(map, /Task 1: t1/);
  assert.doesNotMatch(map, /Task 2/);
  assert.equal(planMap(render('# Notes\n\nNo tasks here.\n').html), '');
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
        '<figure class="diagram"><pre class="source">d</pre></figure><details class="dir" open><summary>s</summary></details>',
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
  assert.ok(out.querySelector('figure.diagram > pre.source') && out.querySelector('details.dir[open] > summary'));
});

test('the clean pass keeps only the attributes marked and the tree write, so an alt-text injection loses its id and style', () => {
  const html = render('# T\n').html;
  const source = `${html.match(/const safe = [^]*?\n\};/)[0]}\n${html.match(/const KEEP = [^]*?\n\}\n/)[0]}\nreturn clean;`;
  const { document } = new JSDOM('').window;
  const clean = new Function('document', source)(document);
  // what marked 16 writes for ![a" style=... id="plan-map" x](https://ok/x.png), where the alt text is not escaped
  const out = new JSDOM(
    clean(
      '<img src="https://ok/x.png" alt="a" style="position:fixed;inset:0" id="plan-map" srcset="https://e/x 1x" data-k="1" x"="">' +
        '<ol start="3"><li><input type="checkbox" checked disabled></li></ol><table><tr><td align="center" class="c">1</td></tr></table>',
    ),
  ).window.document;
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
  ])
    assert.equal(safe(href), false, href);
  for (const href of ['https://example.com/?a=1&b=2', 'mailto:a@b.c', './a.md', '#top', 'a/b.md', ''])
    assert.equal(safe(href), true, href);
});

test('each folder tree is keyed by the text of its fence', () => {
  const r = render(`${fence('files', '+ a.ts')}\n${fence('files', '+ b.ts')}`);
  assert.match(r.html, /<template data-tree data-key="\+ a\.ts">/);
  assert.match(r.html, /<template data-tree data-key="\+ b\.ts">/);
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
