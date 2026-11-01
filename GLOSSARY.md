# dead-claude-skills

Personal native Claude Code and Codex marketplaces and the installer that sets up a machine from it.

## Language

**Harness**:
The coding-agent application that runs a conversation and hosts plugins, such as Claude Code or Codex.
_Avoid_: model (the model is selected within a harness), cockpit (the separate observing app)

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
A plugin's own number, which moves only when that plugin changes. Vendored plugins synced from an upstream release
carry upstream's number.
_Avoid_: release version

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

## Flow cockpit

**Flow cockpit**:
The desktop window that shows what the conductors and Claude sessions are doing, read from their documents and the
capture. It only watches.
_Avoid_: dashboard, board, harness

**Flow run**:
One conductor run, recorded in a `docs/features/<slug>/flow.md`, from its start to `phase: done`.
_Avoid_: run (alone; a web-mcp run is something else), flow (alone; that's the conductor), ticket

**Audit**:
One `docs/audits/<date>-<flow>-<scope>.md` report written by `/test-audit`, `/doc-audit` or `/harden`.
_Avoid_: audit run, report (alone)

**Claude session**:
One Claude Code conversation together with the subagents it starts.
_Avoid_: session (alone; a web-mcp session is a browser), chat

**Loose session**:
A Claude session that belongs to no flow run or audit.
_Avoid_: orphan session, ad-hoc session

**Capture**:
The record of what one Claude session did, written event by event by the flow-cockpit plugin's hooks.
_Avoid_: log, telemetry, trace

**Capability diagnostic**:
A target-specific explanation of an optional feature omitted during package generation. Required unsupported
features fail the build; matching event names alone do not establish support.

**Rules receipt**:
A runtime record tying startup rule handling to exact packaged rules/adapter bytes, version and effective instruction
source. It supports migration checks; installation alone is not hook trust or consent to remove instructions.

**Owned generated output**:
Both native distributions under `portable/`, both root marketplaces and the Claude theme rendered from the shared
palette. Author sources, rebuild, review and commit outputs together; freshness checks do not rewrite them.
