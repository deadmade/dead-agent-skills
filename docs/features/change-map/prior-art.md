# Prior art: change-map visualizations

Source check (2026-11-16, fresh agent): 26 confirmed, 3 not supported (removed or corrected below), 2 true but mis-cited (recited), 0 couldn't open.

Gaps: web search was down (all engines timed out), so candidates were picked by name and fetched directly. Not researched: Gerrit, Reviewable, Graphite, CodeSee, Sourcegraph, gource, GitLab's file tree (blog URL 404). The GitHub docs page opened under a new URL and says little about the file tree. The Mermaid pages fetched are the live site (latest), not pinned to 12.3.0; only the context7 snippets come from the `mermaid@12.3.0` tag. Mermaid's default `maxTextSize` and `maxEdges` values were not confirmed. Pitfalls come from the Mermaid and tool docs; no maintainer postmortems were found.

## Approaches

### A. Sized-area map (treemap / bubble pack), color = change kind
Every file is a rectangle or circle sized by a metric; color carries type or change. Hierarchy comes from the folder tree.
- Used by: git-truck (size by file size or commit count, color by line changes or top author) [[docs](https://github.com/git-truck/git-truck/blob/main/docs/README.md)]; repo-visualizer (SVG circles, size = file size, color = type; GitHub Action, offline SVG output) [[README](https://github.com/githubocto/repo-visualizer/blob/main/README.md), [writeup](https://githubnext.com/projects/repo-visualization/)]; CodeScene hotspot map (circles per folder/file, zoomable, color density = hotspot or code health) [[docs](https://codescene.io/docs/guides/technical/hotspots.html)].
- Good at: showing how much and where, at a glance, across many files.
- Costs: needs a number per file. A spec or plan gives none, so any size would be a guess. Static HTML needs layout code or Mermaid's treemap.
- Bad fit: few files, or predictions with no size [inferred]. Mermaid says small values are hard to see or label, deep hierarchies are hard, and negative values are unsuited [[treemap](https://mermaid.js.org/syntax/treemap.html), Limitations]. Added versus deleted can't be shown as one rectangle [inferred].

### B. Diff-stat bars in a file list
One row per file: path, +N/-M, a bar. `git diff --stat` and `--numstat` are the data model; diff2html renders it.
- Used by: git itself. `--numstat` gives `added<TAB>deleted<TAB>path`, with `-` `-` for binary files and a `{old => new}` rename form. `--dirstat` gives per-directory percentages, 3% cut-off by default, `files` mode counts each file equally [[git-diff](https://git-scm.com/docs/git-diff), `--numstat`, `--dirstat`]. diff2html has a collapsible file-summary list with `fileListToggle`, `drawFileList`, `colorScheme: auto` and a browser bundle [[README](https://github.com/rtfpessoa/diff2html/blob/master/README.md), Diff2HtmlUI and Configuration]. GitHub shows a file tree, filters, a **Viewed** checkbox and a progress bar [[docs](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request), About reviewing].
- Good at: exact counts, scanning order, review progress. It maps directly onto `git diff --numstat` for a later real-diff mode.
- Costs: lines changed is a prediction at plan time. Renames need `-M` (default similarity 50% [[git-diff](https://git-scm.com/docs/git-diff), `-M`]).
- Bad fit: showing how the changed parts relate. A list has no relations [inferred].
- diff2html needs a unified diff as input, so it only fits the real-diff case. At plan time only the idea of a per-file summary list carries over [inferred]. diff2html also warns of out-of-memory on big files and lines, fixed with `matching: none` [[README](https://github.com/rtfpessoa/diff2html/blob/master/README.md), Troubleshooting].

### C. Relation graph with changed nodes highlighted
Nodes are modules or files, edges are imports or change coupling, changed nodes are colored. This is the "how do the parts relate" answer.
- Used by: repo-visualizer's future-directions note (imports found by scanning for `import`, edges shown only on hover because "there are often too many connections") [[writeup](https://githubnext.com/projects/repo-visualization/), What files are connected]. CodeScene change coupling (hover a file to see peers; the map uses a fixed 20% threshold; commits or tickets as source) [[docs](https://codescene.io/docs/guides/technical/hotspots.html), change coupling].
- In Mermaid 12.3.0 (checked against the latest docs): flowchart subgraphs and `classDef`, with `:::class` shorthand and a `default` class [[flowchart](https://mermaid.js.org/syntax/flowchart.html), Subgraphs and Classes]. Collapsible subgraphs (`one@{ view: collapsed }`, v11.17.0+) redirect cross-boundary edges onto the collapsed node and drop internal ones. The default layout is ELK since v12.0.0 [[flowchart@12.3.0](https://github.com/mermaid-js/mermaid/blob/mermaid@12.3.0/docs/syntax/flowchart.md)]. `architecture-beta` exists with groups, services and edges and is beta; its syntax may change [[context7 snippet](https://github.com/mermaid-js/mermaid/blob/mermaid@12.3.0/docs/syntax/architecture.md)].
- Good at: showing what depends on what, and showing a boundary with a few nodes. Reuses the Mermaid already loaded.
- Costs: edges need analysis (imports or declared links). At spec time they come from the author's own words.
- Bad fit: many nodes (hairball) [source: repo-visualizer note above]. In subgraphs, a link from a node to the outside makes the subgraph ignore its own `direction` [[flowchart](https://mermaid.js.org/syntax/flowchart.html), Limitation]. Mermaid also enforces `maxTextSize` and `maxEdges`; names confirmed, defaults not [[MermaidConfig](https://github.com/mermaid-js/mermaid/blob/mermaid@12.3.0/docs/config/setup/mermaid/interfaces/MermaidConfig.md)].

### D. Ranked shortlist of what matters
Don't draw everything. Rank files or symbols by importance and show a short list.
- Used by: CodeScene ("you'll never get a list of 5.000 items"; ranks hotspots by change frequency, then coupling and number of developers) [[docs](https://codescene.io/docs/guides/technical/hotspots.html), Refocus and Focus on your Refactoring Targets]. difftastic compares syntax trees to find real changes; it falls back to line diffing for unsupported languages and very large input [[intro](https://difftastic.wilfred.me.uk/introduction.html)].
- Good at: telling the reviewer where to look first.
- Costs: ranking logic or a symbol parser, and per-language tree-sitter-style grammars [inferred]. A prediction has no symbols unless the plan names them.
- Bad fit: when the approver must see everything. Hiding files from a list might hide the one that matters [inferred].

## Findings for the decision

1. None of the four tools sampled takes a predicted file list: git-truck and CodeScene read git history, diff2html a unified diff, repo-visualizer the checked-out file tree. No precedent was found for the prediction case in this sample [inferred].
2. Mermaid 12.3.0's `treemap-beta` takes numeric leaf values (not well suited for negatives), `classDef` styling, nested sections, and has options for padding and value format. It has no per-leaf color scale. The page also says a sunburst is "yet to be released" [[treemap](https://mermaid.js.org/syntax/treemap.html)]. It is beta, so syntax may change [inferred from the name].
3. Mermaid's default `securityLevel` is `strict`, which disables clicks and encodes HTML in labels [[usage](https://github.com/mermaid-js/mermaid/blob/mermaid@12.3.0/docs/config/usage.md)]. Any link-from-node idea needs `loose` or `antiscript`.
4. Static, offline-ish output has precedent: repo-visualizer writes a plain SVG with no server. git-truck "runs completely locally" via `npx git-truck`.
