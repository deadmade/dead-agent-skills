---
flow: feature
phase: finish
now: Waiting for you: pick how the branch ends.
---

# carrier-api-integration: flow

## Request

> Hey, we recently talked about the problems im having at work with apis like dhl, dpd etc to build them properly and being able to provide an ai the necessary tools to querry it. We already build a mcp server parly but im just not happy with the whole approch. Could we revisit it

Answers at the start of this run (2026-11-09):

- Relation to the earlier run `api-mcp`: new run, close the old one (closed, `phase: done`).
- Unhappy with the earlier approach: "Agent experience" (one generic `call` with free-form JSON) and "Too heavy" (about 12k new lines on the 13k ported engine, own XSD reader, login handling, setup page, keychain).
- Where the time and frustration go when adding a carrier API: "Understanding the API" and "Writing the integration". Not picked: "Getting a call working", "Agent can't verify".
- On whether a server is needed at all: "in my opinion it needs a server to understand what we receive and to test assumptions".
- On what goes wrong: "well ideally I get a openapi spec but even then ai agents are often not sure or for testing write thinks they think comes back but not what actually comes back".
- To my playback (real request, saved reply, DTOs and fixtures built from it): "yes exactly. But today they juist have a hard time getting the request and or the login right and give it to me to do".
- What they do when the agent hands it back: "well I usually just use .http files run the requests myself and then copy it to them".
- To my playback, where the human wrote the login request, kept a host list and placed secrets outside the project: "thats a bit to much manual work for me. The goal would be to not have manual work except typing the login".

## Artifacts

- Earlier run, closed: [../api-mcp/flow.md](../api-mcp/flow.md) (its spec, plan, protocol research and DPD fixtures stay readable; the engine is on the local tag `openapi-mcp-backup-2026-11-06`)
- Prior art: [prior-art.md](prior-art.md), [prior-art-recording.md](prior-art-recording.md) (both source-checked, then corrected)

- Spec: [spec.md](spec.md)
- Plan: [plan.md](plan.md)
- ADRs:
- Glossary: `GLOSSARY.md`, section `http-runner`
- Not committed, by the user's decision (third-party, licences unchecked): `dhl/parcel-de-shipping-v2_2_0.yaml` (from `kruegge82/dhl-php-rest-sdk`) and `reqres-openapi.json` (`https://reqres.in/openapi.json`). `done-check-8.py` and the agent check need them downloaded again.

## Gates

- Gate 1, spec approved: 2026-11-09. Reopened 2026-11-09: plan review replaced httpgenerator with our own `generate` from examples, and added the reply-value refusal, the deadline wording, absolute paths and the masking additions. Approved 2026-11-09.
- Gate 2, plan approved: 2026-11-09, execution: subagent-driven
- Gate 3, review-code report: 2026-11-09. Copyedited. Picks: 1, 2, 3, 4, 5, 6, 7.

## Skipped

- /review-code lean, tests, docs and risk lenses: skipped by the user's choice (2026-11-09), after nine task reviews and a whole-branch review. Accepted by the user 2026-11-09; not passed.
- Task 10 task review: `agent-check.mjs` was reviewed in the final whole-branch review instead (see Rulings). Accepted by the user 2026-11-09; not passed.
- Live DHL checks (done-checks 1 and 3 on DHL): not run; ReqRes stood in, by the user's decision. The user will run DHL at work. Accepted by the user 2026-11-09; not passed.
- Live DPD check: not run; the spec waits for a stage login. Done-check 2 runs against a fake server. Accepted by the user 2026-11-09; not passed.
- Codex run: not run; comes after the release, outside the pass mark. Accepted by the user 2026-11-09; not passed.
- Windows and the Nix package build: not run on this branch locally; CI covers them after a push. Accepted by the user 2026-11-09; not passed.

## Grounding

One read-only explorer (fable) on 2026-11-09. I spot-checked the response model, the absence of examples, the DPD sizes and the grep against the files; the rest is the explorer's reading, inferred, not run.

- OpenAPI reader, on tag `openapi-mcp-backup-2026-11-06` only: `spec/` depends on nothing in the registry, auth, guard or setup code (only `crate::tls` in `load.rs:14`). Built for calling an API, not for writing a client: it keeps `(status, description)` for responses (`spec/mod.rs:48-49`), reads no `example`/`examples`, loses component names by inlining `$ref`s (`refs.rs:34-38`), turns XML and multipart bodies into a "not supported" note (`oas3.rs:196-209`), refuses Swagger 2.0.
- No WSDL/XSD reader and no client-generation skill exist; `plugins/` mentions wsdl, svcutil, kiota or nswag only in a diagrams test fixture.
- Shipping cost: a Node-script skill needs a `plugins/` folder, a neutral `plugin.json` and a `catalog.json` entry, with scripts beside `SKILL.md` and any npm dependencies installed into the user's cache folder (`flows:diagrams`, `check.mjs:115-148`). A Rust MCP server also needs a workspace member, `BIN_PLUGINS` (`tools/installer/core/binaries.ts:53-56`), a `crates-build.yml` matrix entry and CI routing.
- Existing API material: `csharp-skills`' `library/dotnet-webapi` is about serving APIs, not consuming them. web-mcp's `lookup` does not read API specs.
- DPD fixtures (measured): five files, 143 KB, 3,224 lines, two operations (`getAuth`, `storeOrders`). The Shipment XSD alone is 116 KB and 227 elements, so the size is in the types, not the operation count. Search over operations does nothing for DPD; slicing the type tree does.
- Domain docs: GLOSSARY.md's `api-mcp` section (seven terms, staged, not committed) and ADR 0011 (staged) belong to the closed run; they need a decision before anything from this run is committed.

## Prior art

Report: [prior-art.md](prior-art.md) (sonnet), on spec understanding. Three approaches: generator first (Kiota, OpenAPI Generator, NSwag; svcutil and xscgen for SOAP, .NET only); slice or render the spec as Markdown (no WSDL input anywhere); query or execute server (no SOAP). None observes what an API really returns.

Source check (opus, every link opened): 39 confirmed, 1 not supported, 0 could not open; of 13 inferred claims 3 followed, 6 partly, 4 did not. Corrected: dotnet-svcutil's XSD input, xscgen's unsupported cases, the non-.NET bad-fit claim, the "slices help discovery, types help correctness" inference. The closing "no server needed" recommendation is withdrawn; the user also ruled it out.

Second report: [prior-art-recording.md](prior-art-recording.md) (sonnet), on recording real replies. Four approaches: record and replay (WireMock, WireMock.Net, Hoverfly, VCR, Azure SDK test-proxy); check a spec against live traffic (Prism, Optic, Schemathesis, Microcks); derive types from samples (mitmproxy2swagger, quicktype; no SOAP); an MCP traffic viewer (HttpProxyMcp, mitmproxy-mcp). WireMock and Hoverfly are the ones documented for XML matching; scrubbing is documented only for VCR and test-proxy. No MCP server built to record fixtures turned up, and no study measures agents asserting invented replies.

Source check (opus, every link opened): 40 confirmed, 3 not supported, 0 could not open; of 12 inferred claims 2 followed or mostly, 6 partly, 4 did not. Corrected: the Prism quote, HttpProxyMcp's HAR export, the 36% figure (of test commits). The "scrubbing proxy for SOAP" recommendation is withdrawn.

Runners for `.http` files, read by me on 2026-11-09 after the user named them (no separate source check). httpyac: `send` runs a file or one named request, `--json` output, "REST, SOAP, GraphQL and gRPC" ([CLI](https://httpyac.github.io/guide/installation_cli)); `@ref` and `@import` reuse a login across files ([metadata](https://httpyac.github.io/guide/metaData)); `.env` and `http-client.private.env.json` ([environments](https://httpyac.github.io/guide/environments)); its default JSON output keeps the sent request, headers included ([jsonOutput.ts](https://raw.githubusercontent.com/AnWeber/httpyac/main/src/cli/send/jsonOutput.ts)). Measured with `npm view`: 6.16.7, MIT, last published 2025-03-30, with gRPC, Kafka and MQTT dependencies. JetBrains `ijhttp` also runs them without an IDE, with private env files ([CLI](https://www.jetbrains.com/help/idea/http-client-cli.html)); it was not tried, so whether it runs REST Client's `{{name.response…}}` references is unknown, because the run chose its own parser after httpyac failed on them. Visual Studio and VS Code REST Client extract values from a named reply by JSONPath or XPath ([Microsoft](https://learn.microsoft.com/en-us/aspnet/core/test/http-files), [REST Client](https://github.com/Huachao/vscode-restclient)) but neither documents a CLI. A web search for an MCP server that runs `.http` files timed out on all engines, so "none found" is weak.

## Findings

Spike, throwaway, agreed by the user on 2026-11-09 (scratchpad only, nothing kept). httpyac 6.16.7 on Node 26.13 against a local fake carrier, one run per case, measured:

- REST Client's chaining syntax does not run under httpyac: `{{login.response.body.$.token}}` (JSON login) and `{{login.response.body.//authToken}}` (XML login) each left the second request unsent (exit 10). The user runs `.http` files in VS Code REST Client, so their files would not run unchanged.
- httpyac's own form works: a post-request script read the token from the XML reply and `@ref` chained the requests; the token reached the SOAP header (both replies 200).
- The login password appeared in the CLI's JSON output (`--output exchange`), so a runner must remove secrets itself. The XML cases read it from `.env`.
- Size: 213 packages, 68 MB.
- Not tested: real DHL or DPD, Windows, REST Client's own behaviour.

Rust crates for `.http` files, checked 2026-11-09 after the user asked (crates.io search and API; probe in the scratchpad, nothing kept). No crate found that runs REST Client files; the ones below only parse them, or use another format.

- `rest_parser` 0.1.7 (MIT, last published 2025-06): parser only, sends nothing. Measured: it needs `HTTP/1.1` on the request line, which REST Client treats as optional; without it a request with a body fails to parse and one without a body reports no path. A trailing `###` also fails. It does parse `# @name`, and an XML body starting with `<` when the version is present. A full login chain was not parsed successfully, because the test file ended in `###`.
- `tropel-input-http` 0.6.0 (Apache-2.0): its docs put `# @name` out of scope, so no login chain.
- `http-rest-file` 0.5.1 (MIT, 2023) and `dothttp` 0.10.0 (2024): not tested.
- `hurl` 8.1.0 (Apache-2.0, published 2026-10): a real engine with [XPath and JSONPath captures](https://hurl.dev/docs/capturing-response.html) and [`--secret` redaction, which does not cover replies on standard output](https://hurl.dev/docs/templates.html#secrets), but its own `.hurl` format; XML bodies need its multiline string to take variables, and it [needs libcurl and libxml2 to build](https://hurl.dev/docs/installation.html).
- Parts for an own runner: `reqwest` (already in the workspace), `jsonpath-rust` 1.0.12 (MIT), and for XPath `sxd-xpath` 0.4.2 (MIT/Apache-2.0, 2018) or `xpath-eval` 0.2.3 (MIT, 2026), neither tested.

Builder check on the spec (fresh sonnet agent, 2026-11-09): seven questions. Settled from sources:

- XPath: REST Client calls `xpath.select(path, doc)` with no namespace map ([source](https://raw.githubusercontent.com/Huachao/vscode-restclient/master/src/utils/requestVariableCacheValueProcessor.ts)). DPD's saved XSDs set no `elementFormDefault` (grep), so `authToken` is unqualified and `//authToken` should match; no real DPD reply has tested it.
- Login wait: Codex's default per-tool timeout is 60 s ([config reference](https://developers.openai.com/codex/config-reference)), so `run` waits 50 s and the page outlives the call.
- Basic auth: REST Client Base64-encodes `Basic user password` and `Basic user:password` ([README](https://github.com/Huachao/vscode-restclient#basic-auth)); added to the supported format.

httpgenerator as a dependency, checked 2026-11-09 during planning (scratchpad, nothing compiled or run): `httpgenerator-core` 1.1.0 is on crates.io but `cargo tree -i` shows it pulling `reqwest` 0.12.28 directly, beside the workspace's pinned 0.13.5, which AGENTS.md forbids. So `generate` runs the release binary, pinned by SHA-256 in the installer's `tools.json`. Release 1.1.0 archives each hold one binary at the top; `--no-logging`, `OneFile` and `--base-url` exist at that tag (`args/types.rs`); `main` is 212 commits ahead of it, so the README read earlier is newer than the release.

Landing places on `origin/main`: one sonnet agent, spot-checked against `assets/tools.json`, `steps/binaries.ts` and `options.ts`. `docs/features/api-mcp/grounding-landing.md` is stale for CI, installer data and Nix.

`.http` starter files: [httpgenerator](https://github.com/christianhelle/httpgenerator) writes one `.http` file per OpenAPI operation with a sample body built from the schema (README, read 2026-11-09, not run). OpenAPI only.

## Options

### Approach

Picked: a thin MCP server that runs `.http` files, removes secrets, refuses non-sandbox hosts and saves real replies into the project.

- A (smallest that would work): a skill that runs httpyac through the shell. Credentials reach the agent, nothing limits it to the sandbox, nothing saves replies. Effort S.
- B (picked, recommended): the `.http` runner server. Effort M.
- C: a recording proxy around the integration code (WireMock.Net). Needs working code first, so it does not help where the agent gets stuck. Effort M.

### How the runner is built

Picked: a Rust MCP server with our own small parser for VS Code REST Client's format, using crates for the parts (reqwest, a JSONPath crate, an XPath crate). The user's existing files run unchanged.

- Rejected: wrapping Hurl (moves everyone from `.http` to `.hurl`; libcurl and libxml2 to build).
- Rejected: wrapping httpyac and changing the VS Code extension (213 packages, last published March 2025, first Node MCP server here, cannot run REST Client's token syntax).
- Rejected: `rest_parser` as the parser (measured failures on REST Client's optional `HTTP/1.1` and on a trailing `###`).

### Typing the login

Picked: a browser page the server opens by itself; the address never reaches the agent. The human's only manual step is typing the login there.

- Rejected: a terminal prompt (an extra step; whether Claude Code's `!` prefix can take typed input is unchecked).
- Rejected: a Claude Code popup (Claude-only; unmeasured on MCP 2026-07-28).

### Generating the `.http` file

Picked (plan review, 2026-11-09): a second fixed tool, `generate`, in our own code. It writes one named request per operation with the spec's first example as the body, word for word; no example means no body and a comment saying so. The agent edits the output. The user raised the tool at Gate 1. SOAP stays written by the agent.

- Rejected: wrapping httpgenerator, first picked at Gate 1. Measured on DHL's spec: `POST /orders` got `{"profile":"example","shipments":["item"]}` and the file was 93% comments, because 1.1.0 reads no `example`/`examples` (`openapi/normalize/schema.rs`) and samples one level, three properties (`generator/sample.rs`). DHL's spec holds 11 complete bodies for that operation. It would also have added a second binary, a pin and a sync.
- Rejected: generating from WSDL and XSD too (needs the XSD reader the user called too heavy; DPD's shipment operation has 227 element types).
- Rejected: the agent writing every file from scratch.

`serde_norway` 0.9.42 (MIT OR Apache-2.0), probed 2026-11-09 in the scratchpad, nothing kept (measured): reads DHL's OpenAPI file, keeps its order, 8 operations, 11 example names in file order, and the first example of `createOrders` serialised complete at 872 characters. DHL's `servers` lists production first, hence `generate` refuses several servers with no `base_url`.

### Grill, first round (2026-11-09)

The user accepted all five recommendations with "yes, yes, yes, yes, yes".

- Fixing a wrong login. Picked: an optional `retype_login` flag on `run`, with no automatic reopening.
- Where the agent check runs. Picked: live on the DHL sandbox, with the login typed once beforehand. Rejected: a fake DHL server.
- "Prod never". Picked: the confirmation page is the only guard, per exact host name, also for hosts with no secrets. Rejected: checking the host's name.
- What gets masked. Picked: everything typed; reply values only when sent in a header or SOAP header; all-digit values become same-length nines.
- The closed run's files. Picked: remove ADR 0011 and the glossary's `api-mcp` section (saved as `docs/features/api-mcp/withdrawn-adr-and-glossary.patch`); keep the `api-mcp` folder. Its `flow.md` and `plan.md` still link the removed ADR.

## Plan review

### Plan review round 1 (2026-11-09)

Three fresh reviewers: Correctness (fable), Fit (sonnet), Simpler (opus). No blocking findings; none dropped.

The user chose to apply every should-fix item and the smaller fixes, and on `generate`, after asking why it did not work, "Our own, from examples" (see Options).

Should-fix findings, each applied:

1. Masking order: the exchange is masked before it is saved and before the 40,000-character cut, side files too, and reply values to mask are decided from the parsed chain before sending, so a login reply is never saved unmasked.
2. A reply value could carry a typed value to another host: `run` refuses it, naming the request and line. Spec change.
3. Deadline: the result lists sent, received and in flight, says an in-flight request may have completed, and says to call again only when nothing was sent. Spec change.
4. `Saved` could confirm the wrong host: `run` re-reads the store after any `Outcome` and asks again.
5. A child process's output could carry the page address: `Failed` holds none, and the child's stdio is null.
6. Codex's generated setup had no `http-runner`: added to `templates/codex.ts`, Task 9.
7. Task 10 had no route before a release: Step 1 builds and loads the branch.
8. Build order: every dependency declared in Task 1 (the XPath crate in Task 2), CI routing moved to Task 1, one fake carrier in `tests/common/mod.rs`, tests through `lib.rs` in `tests/`, Task 8 only the tool layer, a `[[bin]]` fake browser, carry-over named under Base, `replies::save` taking a masked `Exchange`, Destination seam reworded, `rmcp::schemars`.

Smaller fixes applied: digit values on digit boundaries; `\uXXXX` and numeric-entity forms; hosts lowercased and a `Host` header refused; plain http for `localhost` and `127.0.0.1`; absolute paths in both tools (`HTTP_RUNNER_PROJECT_DIR` and `Ctx.project_dir` gone); a `{{name.response.headers.X}}` test; the spec's `files` block; the store re-read before rename; the `ijhttp` line; a headroom-trim line in the skill.

What changed with `generate`: Task 7 rewritten, `serde_norway` added, and the httpgenerator pin, `httpgeneratorPath`, `HTTP_RUNNER_HTTPGENERATOR`, the Codex `--env`, the remote-`$ref` scanner and Task 7's real-binary step removed. New with it, my calls, in the spec for Gate 1: requests named from `operationId`, and a refusal when a spec lists several servers and no `base_url`, since DHL lists production first. Tests moved out of the crate needed `Pages::new` and `Ctx` to take their test values directly, so `HTTP_RUNNER_OPEN` and `HTTP_RUNNER_DEADLINE_MS` remain only for the stdio tests.

Fix check 1 (fresh opus agent, 2026-11-09): PASS on F1, F2, F3, F5, F6, F9 and F10 a, c, d, e, f, h, i. FAIL on F4 ("after any `Outcome`… ask again" contradicts the spec for `StillOpen` and `Failed`), F7 (no pre-merge route for the Codex run), F8 (no rustls provider in the `tests/` route; "only Task 2 changes the manifests" is wrong), F10b (the plan's `\uXXXX` test input was written as plain text) and F10g (test files missing from the spec's `files` block).

Fresh eyes round 1 (2026-11-09; fable and sonnet, no findings or history given): no blocking findings, none dropped. Sonnet printed flow.md's Findings section by mistake and reports using nothing from it. Should-fix:

1. No rustls provider in Task 6's tests (measured panic; also F8).
2. `xpath-eval` parses no XML; `sxd-xpath` passes the three tests but panics on a prefixed name such as `//ns2:authToken` (measured).
3. A secret in a URL leaks through a transport error: `reqwest::Error` prints the URL (measured).
4. Running the login request alone saves its token unmasked, because nothing in that chain references it.
5. An open page for one host blocks a retry for another, with no way to dismiss it.
6. A serial accept loop can hang on a browser's idle preconnect (not tested in a browser).
7. "After any `Outcome`" contradicts the spec (also F4).
8. `cargo tree -d -i reqwest` does not show one reqwest (measured; `origin/main` corrected AGENTS.md in #141).
9. `--locked` breaks Task 2's trial.
10. Worktree setup: `npm ci`, `nix develop`, `treefmt` before commits.
11. No CRLF handling, and the user is on Windows.
12. Timestamp format with colons is invalid on Windows; `# @name ../../x` escapes `http-replies/`.
13. "Keys in the spec's order" needs serialising the `serde_norway::Value` directly, never through `to_value` (measured).
14. Headless agents in Task 10 have no permission to call the tools.

Consider: detecting "no browser" without waiting on `xdg-open`'s exit, and finding it on NixOS; test tokens of at least eight characters; rmcp is 3.9.0 on `origin/main`; merge as one PR because the Nix package arrives in Task 9; split Basic after tokenising; isolate the store in stdio tests and use debug Nix checks; tasks that touch `lib.rs` run in sequence; the `install.ts` selection guard; trim a trailing `/` from `base_url`; run the skill scan in Task 9.

The user chose "Apply all" for this round and the five items fix check 1 failed. Task 2 now uses `sxd-xpath` outright, so no later task adds a dependency. Spec changes, for Gate 1: a call for other hosts replaces the open page; error text is masked; the login is masked when run alone; prefixed XPath names are refused; request names are restricted; CRLF is accepted; timestamps hold no colon; `files` block completed; rmcp is 3.9.0. The Codex run in Task 10 moved to after the release and is outside the pass mark.

Fix check 2 (fresh opus agent, 2026-11-09): PASS on every item except two. The `Saved` loop failed for the second time: the wording now agreed with the spec, but replacing a page made `saved_for_another_ask_does_not_confirm_this_host` unreachable. First attempt: re-ask after any `Outcome`. Second: re-ask after `Saved` only. Final: `Saved` re-reads the store and sends only with nothing missing, a replaced page returns a new `Outcome::Replaced`, and the test became `replaced_page_sends_nothing`. Test tokens: the rule was wrong (the `Masker` floor is four characters, not eight). It also found three contradictions, now fixed: the `StillOpen` wording for a replaced page, an unprefixed `<Header>`, and `<file name>` versus `<file stem>`.

Fix check 3 (fresh sonnet agent, 2026-11-09): PASS on all five items. Its three loose ends were applied: what `run` returns when `Saved` still leaves something missing, a Basic user or password counting as a header for masking, and `Server::new` setting the five-minute lifetime.

Spec and plan copyedited 2026-11-09 (fresh opus agents, `compare.mjs` exit 0, "Removed: nothing", word diffs read). The plan's page was rendered from a copy of `origin/main`, because the plan's file map names `tools/installer/assets/tools.json`, which the lagging local checkout lacks.

## Tasks

Task 1: base b42ef737, untracked at start: `docs/features/carrier-api-integration/`; files clean (size ~808 of ~450 without the lock); complete at ca8195ad
Task 2: base ca8195ad, untracked at start: `docs/features/carrier-api-integration/`; files clean (size 162 of ~130); complete at d80c72b1
Task 3: base d80c72b1, untracked at start: `docs/features/carrier-api-integration/`; files clean (size 359 of ~360, the cap the user raised); complete at a111862f
Task 4: base a111862f, untracked at start: `docs/features/carrier-api-integration/`; files clean (size 343 of ~190); complete at 8a2fa709
Task 5: base 8a2fa709, untracked at start: `docs/features/carrier-api-integration/`; deviation (size 891 of ~350, accepted by the user; see Deviations); complete at 5eabb096
Task 6: base 5eabb096, untracked at start: `docs/features/carrier-api-integration/`; deviation (size ~1,627 of ~520, accepted by the user; see Deviations); complete at cc327247
Task 7: base cc327247, untracked at start: `docs/features/carrier-api-integration/`; deviation (size 1,053 of ~380 before its fixes, accepted by the user; see Deviations); complete at 268d9ad0
Task 8: base 268d9ad0, untracked at start: `docs/features/carrier-api-integration/`; files clean (size not stopped on, by the user's decision); complete at 90833b34
Task 9: base 90833b34, untracked at start: `docs/features/carrier-api-integration/`; files clean (18 listed files; size not stopped on, by the user's decision); complete at e7ac4f01
Task 10: base e7ac4f01, untracked at start: `docs/features/carrier-api-integration/`
Task 10, done-check 8 (measured 2026-11-09): passed on `parcel-de-shipping-v2_2_0.yaml` from `kruegge82/dhl-php-rest-sdk`, through the release binary over MCP, with `done-check-8.py`. Several servers were refused and listed; with the sandbox `base_url` it wrote 8 requests, 2 with a body; the file parses; `createOrders`' body equals `components.examples.DHLPaket.value`, keys in order (872 characters); a second `generate` was refused.
Task 10, agent-check command (the plan's Step 4): `node docs/features/carrier-api-integration/agent-check.mjs --spec docs/features/carrier-api-integration/reqres-openapi.json --store <folder> --out <new folder> --runs 5 --prompt "Create a user with this API and write a test fixture for the reply."`, which starts each agent as `claude -p <prompt> --model claude-sonnet-5-5 --plugin-dir <worktree>/.claude-plugin/http-runner --allowedTools Read,Write,Edit,mcp__plugin_http-runner_http__run,mcp__plugin_http-runner_http__generate --output-format stream-json --verbose`, with `target/release` first on PATH and `HTTP_RUNNER_DIR` set to `--store`. For DHL, leave out `--prompt` and pass the DHL file as `--spec`.
Task 10, unscored run (measured 2026-11-09, ReqRes): the MCP tools are named `mcp__plugin_http-runner_http__run` and `mcp__plugin_http-runner_http__generate`, as the plan expected. The agent generated the file, wrote the body, got 201 on the first `run` after the user confirmed `reqres.in` on the page, and wrote `fixtures/createLegacyUser.201.json` from the saved reply; 63 s, $0.34. The agent also used `Bash` and `ToolSearch`, which the user's own settings partly allow; four `Bash` calls were denied and none of them mattered.
Task 10, done-checks 1 and 3 on ReqRes (measured 2026-11-09, `claude-sonnet-5-5`, stand-in for DHL by the user's decision): 5 of 5 passed, pass mark 4. The user's only step was confirming `reqres.in` once, in the unscored run; every run reached its 201 on its first `run` call, and no `.http` file names another host.

- Run 1: pass, 62 s, $0.45, 201, `fixtures/createLegacyUser.201.json` holds `createdAt` 2026-11-09T16:24:15.413Z.
- Run 2: pass, 47 s, $0.30, 201, `fixtures/create_user_201.json` holds `createdAt` 2026-11-09T16:25:03.479Z.
- Run 3: pass, 41 s, $0.28, 201, `fixtures/create-user.201.json` holds `createdAt` 2026-11-09T16:25:45.525Z.
- Run 4: pass, 45 s, $0.29, 201, `fixtures/createLegacyUser.201.json` holds `createdAt` 2026-11-09T16:26:23.414Z.
- Run 5: pass, 55 s, $0.32, 201, `fixtures/create-user-reply.json` holds `createdAt` 2026-11-09T16:27:07.983Z.
  Limits of that result: ReqRes needs no login for this request, so no typed secret, login chain or carrier error was exercised. Each run also used `Bash` where the user's settings allow it.
  Task 10, agent-check permissions (2026-11-09, after an automated security note): the agent's file tools are now `Read(./**)`, `Write(./**)` and `Edit(./**)`, and `--disallowedTools` denies `Bash` and the store folder, because the agent reads untrusted replies and the DHL run's store will hold typed logins. The five scored runs above used bare tool names; one further unscored run with the scoped set passed (measured: 201, fixture holds `createdAt` 2026-11-09T16:32:43.419Z, 40 s, $0.36, no `Bash`, nothing denied).
  Task 10, done-check 7 (measured 2026-11-09): the real REST Client 0.25.0 extension in VSCodium 1.116.0 under a virtual display ran `createLegacyUser` from `reqres-scored/run-1`'s agent-written file, and its reply began `HTTP/1.1 201 Created`; the file's language was `http`. Neither VS Code nor REST Client is installed on this machine, so the user asked me to check it. It was driven through the `rest-client.request` command, not a click, and in VSCodium, not Microsoft's VS Code.
  Task 10, DHL live (done-checks 1 and 3): not run; waits until the user is at work.
  Task 10, Codex run: not run; comes after the release.
  Fix 1-7: base ec21de05, untracked at start: `docs/features/carrier-api-integration/` (except `agent-check.mjs`), `docs/audits/2026-11-09-review-http-runner.md`

## Rulings

2026-11-09, Task 1: body lines starting `#` or `//` stay in the body; only comment lines before the body are dropped — the spec says a body is "kept as text", which outranks the plan's "Comment lines are dropped" — a small rewrite of body handling if wrong. confirmed
2026-11-09, Task 3: the security note asking to key logins by origin is parked, not applied — the user-approved spec confirms "each exact host name", and `run` refuses plain http except on loopback, so a value can only reach another port on a host already confirmed — if wrong, a service on another port of a confirmed host could receive typed values. confirmed
2026-11-09, Task 4: a reply value of `.` or `..` in a URL path is parked, not refused — the origin is fixed in the file and the host confirmed, so the request can only reach another path on that host, and a `Place::UrlPath` would change the plan's interface — if wrong, a hostile reply could redirect one request to another path on a confirmed host. confirmed
2026-11-09, Task 5: a saved page answers an ask only within about 2 seconds of the save — the spec says `retype_login` reopens the page before anything is sent, and the brief's immediate `Saved` still holds — a run slower than the window gets one extra page. confirmed
2026-11-09, Task 7: `generate` reads and renders on a worker thread with a deadline, replacing the raw bracket scan — any text scan differs from libyaml in one direction or the other, while a deadline bounds the caller's wait whatever the input is — a hostile spec can keep one thread busy until the server exits. confirmed
2026-11-09, Task 7: the spec read cap is 8 MiB and the rendered cap stays 32 MiB — libyaml's event list costs about 160 times the file's size, so a 33 MB file reached 5.27 GB, and carrier specs are far smaller — a spec over 8 MiB gets a readable refusal and the agent writes the file itself. confirmed
2026-11-09, Task 6: an XPath or JSONPath string function extracting a fragment of a typed value from a reply is parked, not refused — it needs a carrier echoing a typed value and an agent deliberately writing `substring`, and refusing functions needs an allowlist the spec doesn't give — if wrong, fragments of a typed value can reach the model or another confirmed host. confirmed
2026-11-09, Task 6: `reqwest` keeps honouring the proxy environment variables — a work proxy may be the only way to a carrier, and https through a proxy is tunnelled so it sees the host and not the values — plain http goes only to `localhost` and `127.0.0.1`, so a proxy set for `http://` would see those local requests' values if wrong. confirmed
2026-11-09, Task 4: `+` for a space, leading-zero entities and partly overlapping secrets are deferred to the final review, not fixed now — the spec doesn't list them and the task reviewer rated them Minor — if wrong, a carrier echoing a typed value in one of those spellings shows it to the model. confirmed
2026-11-09, Task 10: `agent-check.mjs` got its review in the final whole-branch review, not a task review of its own — it is about 160 lines of not-shipped harness, measured working on five scored runs and one scoped run — a scoring flaw would have gone unseen until the final review. confirmed
2026-11-09, Final review (the user then chose to fix this and the next line now, in a second small fix round): reply-controlled masker cost is parked for the user, since the process allows no second fix wave — unbounded in `mask.rs:213,236-250`, added at `run.rs:406-410`; measured 2,000 distinct `sessionId` values taking 9.6 s to apply, growing with the square of the count, outside the 55 s deadline — a list-heavy reply loses its result and may lead to a repeated create. confirmed
2026-11-09, Final review: the name scan runs only on requests with a typed value, parked for the user — the user's rule says "carried a typed value", and an automated security note asks to follow tokens through the chain (`run.rs:406`) — a token-refresh reply to a request sending only an earlier token stays readable until a request sends it in a header. confirmed
2026-11-09, shortcut, `tools/http-runner/src/generate.rs:99`: a worker that overruns the deadline is left running until the server exits. confirmed
2026-11-09, shortcut, `tools/http-runner/src/run.rs:470`: Base64 is noted when sent, so it misses a Basic header later in the chain. confirmed
2026-11-09, shortcut, `tools/http-runner/src/login_page.rs:358`: one thread per connection with no cap, loopback only. confirmed

## Parking lot

- `tools/http-runner/src/store.rs`: key a login by host and port instead of host, so a new port on a confirmed host needs its own confirmation (automated security note, 2026-11-09; the spec says "each exact host name"). Pick: follow-up.
- `tools/http-runner/src/mask.rs`: refuse a reply value of `.` or `..` substituted into a URL path (automated security note, 2026-11-09). Pick: follow-up.
- `tools/http-runner/src/extract.rs`: allow only node-selecting paths plus `local-name()`, so `substring` and similar can't cut a typed value into pieces the masker misses (automated security note, 2026-11-09). Pick: drop (done by finding 3).
- `tools/http-runner/src/run.rs:291` (`masked_sources`): a reply value is masked only when the file already sends it in a header or SOAP header, as the spec's masking rule says. So a login run before any request refers to its token returns the token to the agent and saves it readable in `http-replies/`, which is meant to be committed; a token sent in a URL or plain body stays readable too (inferred from the code, automated security note, 2026-11-09). This conflicts with the spec's "a login reply is never saved with its token readable, even when the login is run alone" whenever the file doesn't reference the token yet. Changing it changes a masking rule the user approved, so it goes to the final review and then to the user. Done 2026-11-09: masked by name as well, by the user's decision. Pick: drop (done by masking by name).
- `tools/http-runner/src/mask.rs:99-102`: `%7E` and `&#039;` spellings of a typed value (review finding 8, not picked). Pick: follow-up.
- `tools/http-runner/src/run.rs:444`: a whitespace-padded token doesn't mark the next reply for scanning (review finding 9, not picked). Pick: follow-up.
- `tools/http-runner/src/extract.rs:129`: a credential-named JSON number above u64 is never masked (review finding 10, not picked). Pick: follow-up.
- `tools/http-runner/Cargo.toml`: add reqwest's `system-proxy` if the work machine uses a Windows Internet Options proxy (review finding 12, not picked). Pick: follow-up (do it if the work machine uses such a proxy).
- `tools/http-runner/src/extract.rs`: XPath predicates such as `//a[.='x']` answer yes or no about a value; they return no value (fix check, 2026-11-09). Pick: drop.
- `tools/http-runner/src/run.rs`: a joined digit run is registered when its request is filled, so an earlier saved exchange that echoed it stays readable (fix check, 2026-11-09). Pick: follow-up.
- `tools/http-runner/src/extract.rs`: XML parsing is quadratic in depth and runs before the depth check, so a hostile reply can outlast the deadline and delay the server's exit (measured: 40,000 levels took 11 s in debug). Pick: follow-up.
- `tools/http-runner/src/extract.rs`: an XPath of thousands of nested parentheses overflows the stack; the path is agent-written (fix check, 2026-11-09). Pick: follow-up.
- `tools/http-runner/src/run.rs`: a reply declaring Latin-1 but carrying UTF-8 turns a non-ASCII typed value into text the mask misses (automated security note, 2026-11-09). Pick: follow-up.
- `tools/http-runner/src/extract.rs`: an element whose text is split by a comment or CDATA still joins its runs, so a digit-only secret in such a reply escapes the mask the same way a parent element did (inferred; automated security note, 2026-11-09). It needs a reply with that shape. Pick: follow-up.
- `docs/adr/`: record masking by name (what it gives up: an unusual name stays readable, and a real field with such a name is masked in the fixture), from /learn. Pick: follow-up.
- `.superpowers/sdd/plan/progress.md`: about 40 other Minors the final review triaged as safe to leave (readable errors, loopback only, or plan-mandated); the ledger goes when the workspace is deleted, so say if you want them kept. Pick: drop (goes with the workspace).

## Deviations

### Task 3's fix takes the diff past twice its size

Status: decided 2026-11-09: raise Task 3's cap to about 360 lines and lock `save` with `std::fs::File::lock`, keeping `logins.json`. The user asked about SQLite and chose the file lock. confirmed

Task 3's review found that two overlapping `Store::save` calls can corrupt `logins.json` or lose a host. Task 5 shares one `Arc<Store>` across a thread per connection, so this can happen. The reviewer measured it on the diff's `store.rs`: 213 of 300 rounds left an invalid file, and 87 lost a host. All saves write one temp file named by process id, and nothing locks the read, merge and rename.

The plan doesn't hold because the diff is 319 lines against a cap of 320 (twice ~160), and the fix adds about 25: a lock around `save` and a threaded test.

Options:

1. Raise Task 3's cap to about 360 and fix it with `std::fs::File::lock` on a lock file held across read, merge and rename, plus a threaded test. It needs no new dependency and also covers two sessions, which a `Mutex` would not. Recommended.
2. Keep the cap and fix it by cutting tests the brief requires. Not recommended: it trades named coverage for a line count.
3. Leave it. Not recommended: a damaged file makes every later read fail until the user deletes it.

### Task 5's login page is 891 lines against a cap of 700

Status: decided 2026-11-09: accept the size, commit it and review it as usual. confirmed

Task 5 is built and uncommitted: 539 lines of implementation, 319 of tests, 27 for the fake browser and 6 for `Cargo.toml` and `lib.rs`. Its tests pass (12 of 12 on the implementer's run). The plan's ~350 was too low for a standard-library HTTP server, the page and twelve tests over real loopback HTTP. The brief asks for every part; the one test it doesn't name, `refuses_oversized_body`, covers the 64 KB rule it states.

Options:

1. Accept 891 lines, commit and review it as usual. Recommended: every part is something the brief asks for.
2. Trim about 190 lines. Not recommended: it means dropping a page state or a test.
3. Split the module in two. It keeps each file smaller but not the diff, and adds a file the task doesn't list.

### Task 6's run code is about 1,627 lines against a cap of 1,040

Status: decided 2026-11-09: accept the size, commit it and review it as usual. confirmed

Task 6 is built and uncommitted: 750 lines of implementation in `run.rs` and `replies.rs`, and 875 of tests in `tests/run.rs` and the fake carrier. All 94 tests in the crate pass (controller rerun). The plan's ~520 was too low for the 30 tests it names and a fake carrier that speaks REST and SOAP. Nothing is outside the task's files or its `Adds:` line.

Options:

1. Accept the size, commit and review it as usual. Recommended: the production code is 750 lines and the rest is tests the plan names.
2. Trim the tests to reach 1,040. Not recommended: about 590 lines would have to go, and they are the required tests.
3. Split into two commits. The same total, and no easier to review as one task.

### Task 7's generate module is 1,053 lines against a cap of 760

Status: decided 2026-11-09: accept the size, and stop asking about size for Tasks 8 and 9. Review still flags code nobody asked for, and every other deviation class still goes to the user. confirmed

Task 7 is built and uncommitted: about 477 lines of implementation and 575 of tests, mostly inline YAML specs for the 26 tests the brief names. All 122 tests in the crate pass (controller rerun). Size estimates have now been low for four tasks in a row.

Options:

1. Accept, and stop asking about size for Tasks 8 and 9, leaving review to flag code nobody asked for. Recommended.
2. Accept this one and keep asking per task.
3. Trim the tests or split the task. Not recommended: the brief names those tests.

### Task 10's live check uses another API until the DHL check at work

Status: decided 2026-11-09: run done-checks 1 and 3 against ReqRes now, with the prompt changed to creating a user. The DHL run stays "not run" until the user does it at work. confirmed

The plan's Steps 3 to 5 need the user to type a DHL sandbox login, and the user can only do that at work. `https://reqres.in/openapi.json` (66 KB, OpenAPI 3.0.3) has one server, and `POST /api/users` answered 201 with a server-generated `id` and `createdAt`, values the spec cannot hold (measured 2026-11-09). ReqRes labels that server "Production server", but it is a public demo: the reply says `"persisted": false`, so "prod never" is not touched.

What this does not prove: DHL's login, a real carrier's error shapes, and SOAP. None of the stand-ins offers a SOAP service that answered (the public `dataaccess.com` WSDL gave no response, measured). ReqRes's replies also carry promotional text addressed to coding agents; the agents in the check will read it as data, and the host confirmation stops a run from going anywhere else without the user.

Options:

1. ReqRes now, DHL at work. Recommended: its reply holds values only the server can produce.
2. Swagger Petstore. It mostly echoes what is sent, so the fixture check proves less.
3. Skip the live checks until work and go on to the final review.

### The spec promises more login-token masking than its rule gives

Status: decided 2026-11-09: mask by name as well, option 1. The spec's "What gets masked" gains the rule. confirmed

The final review found that `masked_sources` (`tools/http-runner/src/run.rs:291`) follows the spec's "What gets masked" rule: a reply value is masked only when a request in the file sends it in a header or SOAP header. The server cannot tell which reply value is a token until the file references it. So a login run alone, before the request that uses its token exists, returns the token to the agent and saves it readable in `http-replies/`, which is meant to be committed (inferred from the code). Step 5 of the spec and done-check 4 promise that this never happens. Typed keys and passwords are masked either way, so this only concerns tokens a carrier returns, which is DPD's case and not DHL's API key.

Options:

1. Mask by name as well: in the reply to a request that carried a typed secret, mask values whose key or element looks like a credential (token, access_token, authToken, session id, jwt, Set-Cookie). It needs no discipline from the agent. An unusual name stays readable until the file references it, and a real field with such a name is masked in the fixture. Recommended.
2. Add a `# @mask $.token` comment on the login request, which REST Client ignores. Exact, but it works only when the agent remembers to write it.
3. Keep the code, and amend the spec and skill to say a token is masked once a request sends it, and that a login is never run alone. Smallest, and it leaves the gap to the agent's discipline.

## Walkthrough

| goal                                                                                 | plan task | file:line                                               | test                                                                  |
| ------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| The agent runs any request it writes and reads the real reply                        | 6, 8      | `tools/http-runner/src/run.rs:60`                       | `run_through_the_tool`; live: ReqRes 5 of 5                           |
| An API with an OpenAPI spec starts from a generated file                             | 7         | `tools/http-runner/src/generate.rs:58`                  | `first_example_word_for_word`; done-check 8 on DHL's file             |
| REST and SOAP take the same path once the file exists                                | 1, 6      | `tools/http-runner/src/parse.rs:122`                    | `dpd_login_token_reaches_soap_header`                                 |
| The user only types the login once per host                                          | 3, 5      | `tools/http-runner/src/login_page.rs:99`, `store.rs:56` | `still_open_then_saved`, `host_without_secrets_needs_confirming`      |
| A test fixture comes from a reply that really happened                               | 6, 9      | `tools/http-runner/src/replies.rs:28`                   | `login_reply_is_saved_masked`; `agent-check.mjs`                      |
| Files stay ordinary REST Client `.http` files                                        | 1         | `tools/http-runner/src/parse.rs:122`                    | done-check 7, the real extension in VSCodium                          |
| What the user typed never reaches the agent, a saved reply or a log                  | 4, 6      | `tools/http-runner/src/mask.rs:207`, `run.rs:294`       | `secrets_absent_everywhere`, `secrets_and_address_absent_from_stderr` |
| A value goes only to the host it was typed for, and an unconfirmed host gets nothing | 6         | `tools/http-runner/src/run.rs:543`                      | `value_not_sent_to_other_host`, `unconfirmed_host_is_not_sent`        |

## Review

Verdict at the report: 5 to fix before merge (`docs/audits/2026-11-09-review-http-runner.md`). Lenses: correctness (neutral brief, because the tree had untracked files) and security; verifier ran on all 13 candidates. The user picked 1 to 7; all seven are fixed and passed a fresh agent's check (finding 3 on its third attempt). Findings 8 to 12 are in the Parking lot.

## Learned

- `docs/solutions/no-referrer-makes-a-loopback-page-send-origin-null.md`: why no save worked from a real browser at Task 5.
- `docs/solutions/run-vs-code-rest-client-headlessly.md`: how done-check 7 ran without VS Code installed.
- Memory `run-checks-yourself`: automate a check before handing it to the user.
- Parking lot: one ADR candidate (masking by name).

## Run verdict

Worked as a whole: yes. Clean: no. Four tasks went over their planned size, two fix rounds followed the final review, and finding 3 took three attempts. The live DHL check is still open.
