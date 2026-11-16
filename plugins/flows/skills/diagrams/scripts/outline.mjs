// Reads a JSON array of absolute file paths on stdin; prints a JSON object on stdout, path -> the file's declarations
// as [{ name, kind, line }], or null when its extension has no grammar. check.mjs runs it from a cache folder holding
// web-tree-sitter and the grammars, and imports LANGS without loading web-tree-sitter.
import { readFileSync, realpathSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Extension -> grammar, as a path under node_modules.
export const LANGS = {
  '.js': 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  '.mjs': 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  '.cjs': 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  '.jsx': 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  '.ts': 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  '.mts': 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  '.cts': 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  '.tsx': 'tree-sitter-typescript/tree-sitter-tsx.wasm',
  '.rs': 'tree-sitter-rust/tree-sitter-rust.wasm',
  '.cs': 'tree-sitter-c-sharp/tree-sitter-c_sharp.wasm',
  '.py': 'tree-sitter-python/tree-sitter-python.wasm',
};

// Node type -> kind, for every grammar above.
const KIND = {
  function_declaration: 'function',
  generator_function_declaration: 'function',
  function_definition: 'function',
  function_item: 'function',
  function_signature_item: 'function',
  method_definition: 'method',
  method_signature: 'method',
  abstract_method_signature: 'method',
  method_declaration: 'method',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  class_definition: 'class',
  interface_declaration: 'interface',
  struct_item: 'struct',
  struct_declaration: 'struct',
  record_declaration: 'record',
  trait_item: 'trait',
  impl_item: 'impl',
  enum_declaration: 'enum',
  enum_item: 'enum',
  type_alias_declaration: 'type',
  type_item: 'type',
  namespace_declaration: 'namespace',
  file_scoped_namespace_declaration: 'namespace',
  mod_item: 'mod',
};
const CONTAINERS = new Set(['namespace', 'mod', 'class', 'struct', 'interface', 'trait', 'impl', 'record']);
// Walked through without adding a name: wrappers around a declaration, and the bodies of containers.
const THROUGH = new Set([
  'export_statement',
  'decorated_definition',
  'internal_module',
  'expression_statement',
  'lexical_declaration',
  'variable_declaration',
  'statement_block',
  'class_body',
  'interface_body',
  'declaration_list',
  'block',
]);
const FUNCTION_VALUES = new Set(['arrow_function', 'function_expression', 'function']);

function walk(node, parent, out) {
  for (const child of node.namedChildren) {
    const value = child.type === 'variable_declarator' && child.childForFieldName('value')?.type;
    let kind = FUNCTION_VALUES.has(value) ? 'function' : KIND[child.type];
    if (!kind) {
      if (THROUGH.has(child.type)) walk(child, parent, out);
      continue;
    }
    // A Rust impl has no name, only the type it implements.
    const name = (child.childForFieldName('name') ?? child.childForFieldName('type'))?.text;
    if (!name) continue;
    if (kind === 'function' && parent && parent.kind !== 'namespace' && parent.kind !== 'mod') kind = 'method';
    const full = parent ? `${parent.name}.${name}` : name;
    out.push({ name: full, kind, line: child.startPosition.row + 1 });
    // A C# `namespace X;` has no body: the declarations after it, its siblings, are its members.
    if (child.type === 'file_scoped_namespace_declaration') parent = { name: full, kind };
    else if (CONTAINERS.has(kind)) walk(child, { name: full, kind }, out);
  }
}

// realpath: argv[1] keeps a symlinked folder while import.meta.url resolves it.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init();
  const parser = new Parser();
  const languages = new Map();
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const outlines = {};
  for (const path of JSON.parse(input)) {
    const wasm = Object.hasOwn(LANGS, extname(path)) && LANGS[extname(path)];
    if (!wasm) {
      outlines[path] = null;
      continue;
    }
    if (!languages.has(wasm)) languages.set(wasm, await Language.load(join(import.meta.dirname, 'node_modules', wasm)));
    parser.setLanguage(languages.get(wasm));
    outlines[path] = [];
    walk(parser.parse(readFileSync(path, 'utf8')).rootNode, undefined, outlines[path]);
  }
  process.stdout.write(JSON.stringify(outlines));
}
