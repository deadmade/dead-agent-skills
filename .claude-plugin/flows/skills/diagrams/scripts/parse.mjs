// Reads a JSON array of Mermaid diagrams on stdin; prints a JSON array on stdout, one object per diagram:
// { ok, type, error?, nodes?, edges?, orphans?, participants? }. check.mjs runs it from a cache folder holding
// mermaid and jsdom, so the imports below resolve there.
import { JSDOM } from 'jsdom';

// Mermaid reads a global window and document; and its own logging must not reach the JSON on stdout.
const { window } = new JSDOM('<!doctype html><body></body>');
globalThis.window = window;
globalThis.document = window.document;
console.log = console.error;

const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false });

// Mermaid's message ends in a source excerpt with a caret line; one line keeps the checker's output to one line.
const oneLine = (e) =>
  String(e?.message ?? e)
    .split('\n')
    .filter((l) => l.trim() && !/^-*\^$/.test(l))
    .join(' ');

async function inspect(text) {
  try {
    const { type, db } = await mermaid.mermaidAPI.getDiagramFromText(text);
    const out = { ok: true, type };
    if (type.startsWith('flowchart')) {
      const edges = db.getEdges();
      const linked = new Set(edges.flatMap((e) => [e.start, e.end]));
      const ids = [...db.getVertices().keys()];
      Object.assign(out, { nodes: ids.length, edges: edges.length, orphans: ids.filter((id) => !linked.has(id)) });
    } else if (type === 'sequence') out.participants = db.getActors().size;
    return out;
  } catch (e) {
    return { ok: false, error: oneLine(e) };
  }
}

let input = '';
for await (const chunk of process.stdin) input += chunk;
const results = [];
for (const text of JSON.parse(input)) results.push(await inspect(text));
process.stdout.write(JSON.stringify(results));
