---
name: diagrams
description: 'Draws a spec or plan as a few small pictures (Mermaid diagrams and a file map) and shows it as one rendered page. Use when a spec or plan is about to go to a gate, or for /flows:diagrams <file.md>: the checker rejects a broken picture first, so the user never sees one.'
argument-hint: '<file.md>'
---

# Diagrams

The user judges a design better from a few small pictures than from text alone. This skill says which pictures a
task needs, how to write them in the document's own markdown, and how to check and show the result. A script checks
every picture before the user sees it, so a broken one never reaches a gate and you never need a screenshot to find
out. The paths below go through `<flow-root>`, the flows plugin folder that this file sits in; run the scripts from
the repository, because the checker compares file maps with the files there.

## Which pictures

Pick per task. Draw from the code you read and not from memory, and mark anything you inferred (a line in the
text under the picture, or "inferred" in a node label), so the user knows what to check.

| Task                                     | Pictures                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| New feature                              | file map, where it sits, what changes, the main flow and its failure case    |
| Refactor or move                         | file map (moves and renames marked), before and after, what stays untouched  |
| Bug fix                                  | the flow with the broken step marked, file map                               |
| Removal or migration                     | file map with deletions and counts, what still references the removed part   |
| Small change (one file, no new boundary) | none: write no picture, and say in the document that no pictures were needed |

A small change gets no pictures, and the page says so; a picture that only repeats a sentence costs the user time.

## The two kinds of picture

Both are fenced blocks in the document's markdown, so the document stays the one source and reads in any viewer.

- **Mermaid diagram** (` ```mermaid `), for relationships and flows. Use `flowchart` and `sequenceDiagram` by
  default; `classDiagram` and `stateDiagram-v2` are allowed when they fit. At most 8 nodes in a flowchart and 6
  participants in a sequence diagram; a diagram that needs more is split into two, not enlarged. Every node has an edge.
  Other diagram types parse-check only.
- **File map** (` ```files `), for layout and change. One line per file: a marker, the path with `/` and no spaces,
  then two or more spaces and why the file changes. Markers: `+` new, `~` changed, `-` deleted, and
  `> old-path -> new-path` for a move. Under a file, indent the symbols that change (`+`, `~`, `-`, or
  `> name -> path`, the symbol moves to that file), each with its own two-space why. An unindented `<a> uses <b>` line says file `a` uses file
  `b`; both must be files of the block.

```files
+ plugins/example/new.mjs  the new entry point
    + run  starts it
~ plugins/example/old.mjs  calls the new entry point
    ~ main  hands over to run
- plugins/example/gone.mjs
> plugins/example/a.mjs -> plugins/example/b.mjs
plugins/example/old.mjs uses plugins/example/new.mjs
```

Every plain `+ path` line stays valid; the why, symbols and `uses` are optional. Symbols are expected for every `~`
file, not enforced: a `~` file with none gets a warning, in a plan's task too.

In a spec the map is a prediction from your grounding, so the checker only warns when a path disagrees with the
repository. A plan needs no `files` block: the renderer builds its map from the tasks' **Files** lists, and the
checker holds that map to the repository as an error. To give a plan's file a why, symbols or relations, put a
` ```files ` block in that task, below the plain-path **Files** list (not indented under it: prettier rewrites lines
under a bullet). It may name only files the task lists, and `uses` may name any file in the plan's map.

Each map is drawn as one panel. The Files view lists the files by folder, with each file's marker and symbol counts; the
selected file shows its real outline with the change marked and the untouched symbols greyed, its why, and links to the
files it uses and is used by (the up and down keys step through the files). The Relations tab draws only the files that
relate, with their folders and labelled arrows, and lists the rest as "Not related"; a click on a file opens it in
Files. The outlines come from tree-sitter, for JavaScript and TypeScript, Rust, C# and Python files. The checker also
compares the symbols with them: a `+` symbol that exists, or a `~`, `-` or `>` symbol that doesn't, is a warning.

## Steps

1. Write the pictures into the document as you draft it.
2. Check it, and fix the blocks until it exits 0. Each line names the block it is about:

   `node "<flow-root>/skills/diagrams/scripts/check.mjs" "<doc>"`

   Lines starting `error:` fail the check; fix them and run it again. Lines starting `warning:` do not.

3. Render the page into the session's scratchpad (a temporary folder outside the repository when there is none):

   `node "<flow-root>/skills/diagrams/scripts/render.mjs" "<doc>" "<scratchpad>/<name>.html"`

   It runs the checker first and refuses to write a page when the check fails. It prints the checker's warnings.

4. Show the page: inline if the host has a tool that renders an HTML page in the conversation, and otherwise print
   the file's path for the user to open in a browser. The gate shows it beside its usual summary.

The first check downloads the Mermaid parser and the tree-sitter grammars into the user's cache folder (about 150 MB),
so it can take a minute. When Mermaid cannot run (no npm, offline), the checker prints
`warning: not parser-checked: <reason>` and checks only the rest. Pass that warning on to the user with the gate
summary, so they know the syntax was not checked. When the outlines cannot be read at all (no npm, offline, install or parse
failure), it prints `warning: not outlined: <reason>` once and the page still renders, without outlines. Pass this one
on too. A file type with no grammar gets no warning, only a note in its pane.

A document you may not edit (a plan the run was given, flow.md) is rendered but never changed. If its check fails,
show the user the failing lines as text beside the summary instead of a page, and leave the document as it is.

A page you cannot see is not checked for looks. The checker cannot say whether a picture is right or readable: that
stays with the user's eyes and with your comparison against the code.
