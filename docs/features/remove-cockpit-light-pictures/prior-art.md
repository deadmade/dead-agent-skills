# Prior art: visual previews at a spec/plan gate

**Gaps:**
- Kiro docs (kiro.dev/docs/specs/...) came back empty (JS-rendered), so no Kiro claim here.
- Not researched: PlantUML, Structurizr's newer `commands`, T3 Code HTML rendering.
- No official source found for a "10+ nodes" layout threshold in Mermaid, D2 or Graphviz, and no Mermaid reserved-word list beyond the flowchart warnings.
- Mermaid docs fetched are current (v12.x); the local check is 11.4.1. Collapsible subgraphs (v11.17.0+) are therefore not available on 11.4.1, and v12 needs Node >= 22.12.

**Source check:** 35 confirmed, 1 not supported (corrected below), 0 couldn't open. Two confirmed claims carry caveats: `parse` also returns a `config` key in the browser (#6370), and Mermaid's `c4-beta` (#7849) is a proposal that has not merged. Claims marked [inferred] for approach C (GitHub rendering and LLM familiarity), approach D (T3 Code needs no server) and approach B (needs a JVM) cite nothing; treat them as guesses.

## Plan-gate tools show no diagrams
- Claude Code plan mode shows a text plan, editable with Ctrl+G ([permission modes](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan)).
- Cursor Plan Mode makes an editable markdown plan ([plan mode](https://cursor.com/docs/agent/plan-mode)).
- Cline Plan/Act is conversational ([plan and act](https://docs.cline.bot/core-workflows/plan-and-act.md)).
- Aider's ask/architect modes are text ([modes](https://aider.chat/docs/usage/modes.html)).
- spec-kit describes templates, checklists and gates, with no diagram step ([spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md)).

- **Kiro (added after the source check, opened in this session with the browser tool because the docs are JS-rendered):** every feature spec has `design.md`, and its Design-First workflow offers a High Level Design that includes a "System architecture diagram", with the design opening in preview mode by default ([design-first](https://kiro.dev/docs/specs/feature-specs/tech-design-first/)). A workshop page says Kiro generates an architecture diagram as part of the design document and that the Markdown preview "shows the full design document with formatted diagrams" ([workshop](https://awsugbne.github.io/kiro-workshop-feb26/spec-driven/design-and-architecture/)). Neither page says what format the diagrams are, whether they are checked, or whether they are split into several views; community Mermaid "Powers" exist only as prompt guides ([Mermaid-Kiro-Power](https://github.com/CesarCielllo/Mermaid-Kiro-Power)). So Kiro is a direct comparable for "one diagram inside the design, reviewed in a preview before the build", not for checks or small views.

So the remaining comparables below are adjacent.

## Approaches

### A. Mermaid text plus a headless validator
- **Shape:** the agent writes mermaid blocks; a script parses or renders them and feeds errors back.
- **Who:** [mermaid-mcp-server](https://github.com/andrewginns/mermaid-mcp-server) wraps mermaid-cli and returns `is_valid` plus error text; image output is off by default. [mermaid-validator](https://github.com/lvy010/mermaid-validator) (community README) validates with the official parser and auto-fixes LLM slips such as full-width `；` and `（）`.
- **Good at:** cheap, diffable, structured errors the agent can act on.
- **Costs:** a DOM shim for `parse`, or Chromium for `mmdc`. `parse` returns only `{ diagramType }` ([usage](https://mermaid.js.org/config/usage.html#syntax-validation-without-rendering)), so a node-id or count check needs extra code [inferred].
- **Bad fit:** syntax-valid does not mean readable [inferred]; mmdc needs Chromium, which [source: mermaid-cli known issues](https://github.com/mermaid-js/mermaid-cli#known-issues) lists sandbox problems for, and this machine's headless Chrome is broken [repo memory].

### B. One model, many small views (Structurizr)
- **Shape:** a DSL model defines elements once. `views` define systemContext, container, component, filtered and dynamic views that `include`/`exclude` subsets ([DSL](https://docs.structurizr.com/dsl/language#views)). `export -format mermaid` emits Mermaid ([export](https://docs.structurizr.com/export)).
- **Who:** Structurizr; a pull request proposes a "Structurizr-inspired" `c4-beta` for Mermaid, not yet merged ([#7849](https://github.com/mermaid-js/mermaid/issues/7849)).
- **Good at:** several small views sharing one set of ids.
- **Costs:** a JVM tool. The old CLI is end of life ([cli](https://docs.structurizr.com/cli)). Exports drop shapes and some styling ([export](https://docs.structurizr.com/export)). Auto-generated view keys are unstable ([DSL](https://docs.structurizr.com/dsl/language#views)).
- **Bad fit:** markdown-only authoring with no JVM [inferred].

### C. Other text languages with native validators (D2, Graphviz)
- **Shape:** `d2 validate file.d2`, `d2 fmt --check`, or `dot -Tsvg` from stdin ([D2 man](https://d2lang.com/tour/man/), [dot](https://graphviz.org/doc/info/command.html)).
- **Good at:** the validator is first-class. D2 says to trust the exit status, not the output file, because partial renders are written on error ([D2 man](https://d2lang.com/tour/man/)).
- **Costs:** an extra binary. D2's non-TALA engines lack per-container direction and, in dagre, ancestor-to-descendant connections ([layouts](https://d2lang.com/tour/layouts/)).
- **Bad fit:** GitHub-native rendering and LLM familiarity are weaker than Mermaid [inferred].

### D. Interactive HTML at the gate (superpowers visual companion)
- **Shape:** the agent writes HTML fragments; a local server shows the newest; clicks go to an `events` file read next turn ([guide](https://github.com/obra/superpowers/blob/main/skills/brainstorming/visual-companion.md)).
- **Decisions that matter:**
  - Per-question test: "would the user understand this better by seeing it?"
  - 2-4 options per screen.
  - Codex reaps background processes, so it runs in foreground mode.
- **Good at:** UI mockups and side-by-side options.
- **Costs:** server lifecycle and port reachability.
- **Bad fit:** a host that renders HTML inline (T3 Code) needs no server [inferred]; HTML has no built-in machine check [inferred].

## Constraints from the docs
- **Parse and Node:** `mermaid.parse(text, { suppressErrors })` returns `{ diagramType }`, `false`, or throws. v12 needs Node >= 22.12 ([usage](https://mermaid.js.org/config/usage.html)). In Node, [#6370](https://github.com/mermaid-js/mermaid/issues/6370) (v11.4.1) reports `parse` returning false where the browser succeeds; [#6531](https://github.com/mermaid-js/mermaid/issues/6531) reports `DOMPurify.addHook is not a function`. Neither fetched page shows a resolution; your jsdom check works around it.
- **Size:** `maxTextSize` 50000 and `maxEdges` 500 by default, and they are in the `secure` list, so directives cannot raise them ([schema](https://mermaid.js.org/config/schema-docs/config.html)). They cap rendering, not readability [inferred].
- **Reserved words:** lowercase `end` breaks a flowchart; a node starting with `o` or `x` after dashes becomes an edge type; quote special characters ([flowchart](https://mermaid.js.org/syntax/flowchart.html)).
- **ELK:** default from v12 and bundled; before that it was `@mermaid-js/layout-elk` ([layouts](https://mermaid.js.org/config/layouts.html)). The tiny build falls back to dagre silently ([usage](https://mermaid.js.org/config/usage.html#elk-and-the-tiny-build)). So 11.4.1 renders differ from v12 [inferred].
- **Layout limits:** a subgraph `direction` is ignored when any of its nodes links outside it; link length is a hint ([flowchart](https://mermaid.js.org/syntax/flowchart.html)). An open PR folds long ELK chains into rows ([#7849](https://github.com/mermaid-js/mermaid/issues/7849)), suggesting long chains render wide [inferred].
- **Smaller views in one diagram:** collapsible subgraphs, `@{ view: collapsed }`, v11.17.0+ ([flowchart](https://mermaid.js.org/syntax/flowchart.html)).

## Known pitfalls
- Generated architecture diagrams fail in the wild: DeepWiki-Open's "Architecture Overview" showed "Syntax error in text" ([#437](https://github.com/AsyncFuncAI/deepwiki-open/issues/437); the issue does not say who wrote the diagram, and the cause is unconfirmed). The mermaid-validator README says it was built from that issue.
- Vision checks cost context: a base64 PNG is often 10KB-100KB+, so the validator server defaults to no image ([README](https://github.com/andrewginns/mermaid-mcp-server)).
- Prefer `parse` plus jsdom over `mmdc` here, since it avoids Chromium [inferred].
