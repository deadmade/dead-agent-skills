# dead-agent-skills

Personal native Claude Code and Codex marketplaces and the installer that sets up a machine from it.

## Language

**Harness**:
The coding-agent application that runs a conversation and hosts plugins, such as Claude Code or Codex.
_Avoid_: model (the model is selected within a harness)

**Plugin definition**:
The authored description of a plugin's shared resources, behavior and integration needs across harnesses.
_Avoid_: native manifest (a particular harness's package description)

**Harness adapter**:
The integration that translates shared plugin definitions and behavior to one harness's supported features.
_Avoid_: plugin (the feature being integrated), harness (the application being integrated with)

**Native package**:
A plugin's distribution in the form a particular harness can install and run.
_Avoid_: plugin definition (the shared authored description)

**Native extension**:
A plugin feature available through a particular harness's integration facilities without a shared equivalent.
_Avoid_: fallback (a substitute for another feature)

**Picks plugin**:
A vendored plugin that carries a hand-chosen subset of one upstream's skills (`tob-picks`, `mattpocock-picks`).
_Avoid_: bundle, collection

**Language plugin**:
A vendored plugin that carries all of one language ecosystem's upstream skills.
_Avoid_: language pack, LSP plugin

**Router skill**:
A generated skill in a language plugin whose body indexes library skills for one area. It is the only part Claude
Code lists.
_Avoid_: entry skill, hub

**Library skill**:
An upstream skill vendored into a language plugin's unscanned library, reached only through a router skill.
_Avoid_: sub-skill

**Bundle**:
The default plugin `dead-skills`, whose dependencies are the plugins every machine gets.
_Avoid_: default set

**Default plugin**:
The bundle, or a plugin it depends on. Every machine gets these.
_Avoid_: core plugin

**Shared plugin**:
A plugin that flows depends on and the bundle doesn't: a building block the conductors run.
_Avoid_: included plugin, building block

**Opt-in**:
A plugin the installer offers but doesn't install unless picked. Flows and some shared plugins are opt-ins too; the
plain opt-ins are the ones nothing else depends on.

**Database plugin**:
A plugin for one database engine. It can combine vendored skills with an MCP
server.
_Avoid_: DB pack, language plugin

**Release**:
One tagged `vX.Y.Z` cut of the whole repository: the installer, the marketplace and the binaries that machines get
together. Its number is the repo's, not any plugin's.
_Avoid_: version (alone), plugin release

**Plugin version**:
The number a vendored pack synced from an upstream release carries: upstream's own. Every other plugin takes the
repo's version.
_Avoid_: release version

**Repo fact**:
A value the repository states once and many files need: a path list, a name, a version, a command.
_Avoid_: setting, config

**Owner file**:
The one file that holds a repo fact. Tools read it; none restates it, and where a copy must stay, a check fails when it
differs.
_Avoid_: source of truth, manifest

## Installer

**Tool**:
A program the installer puts on a machine for a plugin: one of our release binaries, an upstream binary pinned by hash,
or a Python tool installed through uv. Each is one entry in the tool manifest.
_Avoid_: dependency, package (alone), binary (a tool installed through uv is not one)

**Tool manifest**:
`tools/installer/assets/tools.json`: the one file that says where each tool comes from, its version, and its file and
sha256 per platform. The installer's engine and the weekly upstream sync both read it.
_Avoid_: pin file, lockfile (it does not lock a tool's own dependencies)

**Our copy**:
The copy of a tool in the installer's bin folder (`<config>/bin`, `~/.claude/bin` by default; the Codex step uses its own
bin folder for agent-browser) that the installer downloaded and that the plugin's settings point at. A copy elsewhere on
PATH is never used, except by the Codex step, which looks on PATH first for web-mcp, ado-mcp and http-runner, and for agent-browser
only where no build is pinned.
_Avoid_: managed copy, local copy

## Flows

**Conductor**:
A flows skill the user starts by name that runs other skills in order and keeps a record of the run: a flow.md for the
build and research flows; /review-code, /understand, /evaluate and /learn keep their own (an audit file, a scratch
file, an evaluation page, the chat).
_Avoid_: workflow, flow (alone; one execution of a flow is a run)

**Evaluation page**:
The one page /evaluate writes, ending in an adoption verdict; with the `prior-art.md` beside it, it is that run's whole record.
_Avoid_: report, radar entry

**Adoption verdict**:
Adopt, try or skip, for one tool in one project.
_Avoid_: ring, rating, score, run verdict

**Flow step**:
A piece of conductor text written once, in `plugins/flows/steps/<name>.toml`, and copied word for word into every
conductor that names it. It reads the same in each.
_Avoid_: step (alone; a pipeline step is something else), partial, include, snippet

**Host token**:
A placeholder in flows text that the build replaces with the wording one harness needs, such as its question tool or
its model names.
_Avoid_: variable, placeholder (alone)

## web-mcp

**Archive**:
Everything web-mcp has pulled into a project: pages, searches, PDFs, images and screenshots, kept in `.web/`.
_Avoid_: cache, store

**Run**:
The part of the archive written by one web-mcp server process, one folder per run.
_Avoid_: session (that word belongs to the browser)

**Session**:
One agent-browser browser, with its own tabs, cookies and history, named by the caller.
_Avoid_: tab, browser instance

**Passage**:
A piece of a page's text, a few hundred tokens long, returned word for word as one ranked search result.
_Avoid_: chunk, excerpt

**Lookup**:
One request for one record about a target, such as a domain's DNS records or a CVE, answered by sources rather than
by search.
_Avoid_: query, probe

**Source**:
An outside service web-mcp reads records from directly, such as OSV or crt.sh.
_Avoid_: provider, backend

**Engine**:
A search site whose result page web-mcp opens and reads, such as Google, Bing or Google Scholar; a search may name the
engines it uses.
_Avoid_: source, provider, backend

**Snippet**:
The short text an engine shows under one result; web-mcp ranks it alongside the passages of that search's pages.
_Avoid_: passage, summary

**Search profile**:
The browser profile web-mcp's searches run in, with cookies and settings of its own and never the user's.
_Avoid_: session (one browser), user profile

**Automation flag**:
`navigator.webdriver` reading `true`: what a browser started for automation tells every page. web-mcp's window turns
it off ([ADR 0009](docs/adr/0009-no-automation-flag.md)). Bot checks read it first; in the spike, Google sent the flagged window's typed search to `/sorry`.
_Avoid_: stealth, webdriver mode

**Typed search**:
A search that types its query into the search box of the engine's result page already open in its tab and presses
Enter, instead of loading a result URL.
_Avoid_: reuse, follow-up URL

**Writing skill**:
The one standard for prose Claude writes for a person, based on Williams and Bizup's _Style_; flows' `writing` skill.
_Avoid_: style guide, unslop

**Conversation shorthand**:
A label only the session that coined it understands, such as a grill question number or a review round number.
_Avoid_: tag, reference

**Prose check**:
flows' code-only `PostToolUse` hook on each Write or Edit of a Markdown file: it flags conversation shorthand in the
new text, with no model call. `FLOWS_PROSE_CHECK=off` turns it off.
_Avoid_: linter, lint, model check

**Copyedit pass**:
The copyedit step (`plugins/flows/steps/copyedit.toml`), which runs the `writing` skill's copyedit
(`references/copyedit.md`) on a spec, plan, research report or audit report before its gate: a fresh editor revises it
for a reader who wasn't in the conversation, by the `writing` skill (Williams and Bizup's _Style_), and code checks that
nothing was lost. A refused edit leaves the document as it was, and the gate says so.
_Avoid_: review, rewrite, polish

## headroom-trim

**Trim server**:
The one local process per machine that shrinks tool results with headroom before Claude reads them, shared by every
session and never connected to the network.
_Avoid_: proxy, daemon, compression server

**Launcher**:
The script each session runs at its start to make sure a current trim server is running.
_Avoid_: starter, bootstrap

**Trim**:
headroom's lossy shrinking of one tool result; what it cuts is gone for good.
_Avoid_: compress (headroom's word for all of its modes), compact

## Harness compiler

**Capability diagnostic**:
A target-specific explanation of an optional feature omitted during package generation. Required unsupported
features fail the build; matching event names alone do not establish support.

**Rules receipt**:
A runtime record tying startup rule handling to exact packaged rules/adapter bytes, version and effective instruction
source. It supports migration checks; installation alone is not hook trust or consent to remove instructions.

**Owned generated output**:
Both native distributions (`.agents/plugins/` and `.claude-plugin/`), both root marketplaces and the Claude theme rendered from the shared
palette. Author sources, rebuild and review the outputs; they are gitignored, and only the release branch commits them.

## Azure DevOps (mcp-azure)

**Collection**:
The top level of an Azure DevOps Server instance, holding projects; it is the first path segment after the server
(`https://server/tfs/DefaultCollection`). The cloud service calls the same level an organization.
_Avoid_: organization, org (for the self-hosted server)

**Pull request iteration**:
One push to a pull request's source branch, as the server numbers them; "the PR's files" means the files changed as
of the latest iteration.
_Avoid_: revision, update

**Thread**:
A conversation on a pull request: one or more comments with a status (active, fixed, won't fix, closed, by design,
pending), optionally anchored to a file and line.
_Avoid_: comment (for the whole conversation), discussion

**System thread**:
A thread the server writes itself to record an event, such as a vote, a reviewer change or a push; never shown to
Claude.
_Avoid_: activity, event comment

**Pipeline**:
A YAML pipeline definition in a project. Classic release pipelines are not meant.
_Avoid_: build definition, release

**Run** (pipeline):
One execution of a pipeline, with a result. The REST API calls it a build. web-mcp's Run is a different thing.
_Avoid_: build, job (a job is one part of a run)

**Test run**:
One set of test results a pipeline run published: one per job and attempt, and one per result file unless the
publishing task merges them; a run can publish several.
_Avoid_: run (alone), test pass

**Hit**:
One search result: a file, a work item or a wiki page. A place inside a file that matched is a match.
_Avoid_: result, match (for the whole hit)

**Step**:
One task inside a run's job, with its own result and log.
_Avoid_: task, timeline record

**Work item**:
A tracked unit of work of some type (bug, user story, task, …) in a project's process.
_Avoid_: issue, ticket

**Read tool**:
An mcp-azure tool that never changes anything on the server; the user may allow it once for good.
_Avoid_: query tool

**Write tool**:
An mcp-azure tool that changes something on the server; Claude Code asks the user before every call, in every
permission mode but `dontAsk`, which denies it.
_Avoid_: action, mutation

## shopping-search

**Group**:
A set of sibling elements of one kind that web-mcp's `rows` tool finds on a page, such as the ads in a search result or
the filters in a sidebar. `rows` returns the largest two, numbered.
_Avoid_: list, block, section

**Row**:
One line `rows` returns for one item of a Group: the item's text collapsed to one line (cut at about 200 characters)
and its first link. It holds no parsed fields; the agent reads prices and specs from the text.
_Avoid_: listing, record, result, ad (an ad is what a Row may describe)

**Recipe**:
What the `shop` skill holds for one shop: the address pattern of its search and notes on reading it (which parts of the
address are filters, what a blocked page looks like). It holds no selectors except one `item` hint where the guess ranks the wrong group.
_Avoid_: adapter, parser, scraper

## http-runner

**Request file**:
A `.http` file the agent writes in VS Code REST Client's format, holding the requests for one API.
_Avoid_: collection, script

**Chain**:
The named requests a request refers to, which run before it on every call.
_Avoid_: dependency, flow

**Saved reply**:
One real exchange with an API, kept in the project with its credentials masked; the only source for test fixtures.
_Avoid_: sample, recording, cassette

**Login page**:
The local page the server opens by itself, where the user types a login. The agent never learns its address.
_Avoid_: setup page, form

**Confirmed host**:
A host name the user has approved on the login page; http-runner sends to no other.
_Avoid_: allowed host, sandbox URL

**Typed value**:
Something the user entered on the login page, kept for one confirmed host and masked wherever it appears.
_Avoid_: env var, credential (a typed value can be a plain user name)
