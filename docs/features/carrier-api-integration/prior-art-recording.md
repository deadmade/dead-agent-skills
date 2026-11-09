# Prior art: recording real API replies

**Source check (2026-11-09, a fresh agent opened every link):** 40 confirmed, 3 not supported, 0 could not open. Of 12 inferred claims, 2 followed or mostly followed, 6 partly, 4 did not. The report is corrected below; the closing recommendation is withdrawn.

**Gaps:** Prism's docs site, Polly.JS docs and VCR's record-mode pages were empty or 404 (Prism read via GitHub). Optic's site would not open; its docs come from a gist copy. No issue threads or postmortems on stale recordings or leaked secrets turned up; pitfalls below are doc warnings. Not verified: WireMock.Net SOAP recording, Hoverfly and VCR secret scrubbing, Microcks SOAP conformance tests, `svcutil`/`xsd.exe`. I found no MCP server built to record fixtures.

## A. Record through a proxy, replay as stubs

Shape: a proxy (or, for VCR, a hook into the HTTP library) sits between code and API, writes request/response pairs, replays them later.

- **WireMock / WireMock.Net:** stubs are written when recording stops ([record-playback](https://wiremock.org/docs/record-playback/)). Request bodies match by content type: `equalToXml` for XML, `equalToJson` for JSON. XML supports `${xmlunit.ignore}` placeholders and `namespaceAwareness` ([request-matching](https://wiremock.org/docs/request-matching/#request-with-xml-body)). Binary bodies are stored as `base64Body` or extracted to files by size. WireMock.Net records via `ProxyAndRecordSettings` ([proxying](https://wiremock.org/dotnet/proxying/)).
- **Hoverfly:** capture mode, exact matchers by default, `xml` and `xpath` matchers ([matchers](https://docs.hoverfly.io/en/latest/pages/reference/hoverfly/request_matchers.html)); binary bodies get `encodedBody: true` ([pairs](https://docs.hoverfly.io/en/latest/pages/keyconcepts/simulations/pairs.html#binary-data-in-responses)).
- **VCR (Ruby):** `filter_sensitive_data` swaps secrets for placeholders on write and back on replay ([docs](https://benoittgt.github.io/vcr/#/configuration/filter_sensitive_data)).
- **Azure SDK test-proxy (.NET tool):** language-neutral out-of-process proxy. Sanitizers run before save and on incoming requests before matching; a `variables` map carries random non-secret values from record to playback ([README](https://github.com/Azure/azure-sdk-tools/blob/main/tools/test-proxy/Azure.Sdk.Tools.TestProxy/README.md#storing-variables)).

Used by: Azure SDK. Good at: deterministic offline tests, and recordings are readable, since a body sits in the stub's `body` attribute [inferred]. Costs: matching and scrubbing setup; a recording is one moment's capture; a separate process for Hoverfly and test-proxy, while WireMock.Net starts from code [inferred].
**SOAP:** WireMock and Hoverfly match XML bodies and XPath [source]; VCR and test-proxy pages say nothing on XML [source: absent]. **No tool here is shown to do both XML and scrubbing:** scrubbing is documented only for VCR and test-proxy.

## B. Check a spec against live traffic

Shape: send real requests, compare replies to the spec, report differences.

- **Prism `proxy`:** validates traffic against OpenAPI v2/v3/Postman; recording is still on the roadmap ([README](https://github.com/stoplightio/prism)). The guide says that a real API can diverge from its mock and "subtle differences often go unnoticed" ([validation proxy](https://github.com/stoplightio/prism/blob/main/docs/guides/03-validation-proxy.md)).
- **Optic `capture`:** a proxy in front of a server plus a command that makes requests. Without `--update` it only compares; `--update automatic` rewrites the spec ([capture docs, gist copy](https://gist.github.com/acunniffe/3b007e841cbd34c614d0d981c7f9afe2)).
- **Schemathesis:** generates requests from OpenAPI, GraphQL or gRPC and checks replies ([docs](https://schemathesis.readthedocs.io/en/stable/)).
- **Microcks:** conformance tests keep the request/response pairs they exchanged ([conformance](https://microcks.io/documentation/explanations/conformance-testing/)).

Good at: finding spec-versus-reality gaps [inferred]. Costs: Prism and Schemathesis need a spec; Optic can create or update one from what it observes. Bad fit: Schemathesis's generated requests, on a sandbox where each one creates a shipment or label [inferred]. Microcks stores the pairs it exchanged; the others report differences [inferred].
**SOAP:** Prism and Schemathesis: none listed (OpenAPI and Postman for Prism; OpenAPI, GraphQL and gRPC for Schemathesis). Microcks mocks WSDL services with XPath dispatch on hand-written SoapUI examples ([tutorial](https://microcks.io/documentation/tutorials/first-soap-mock/)).

## C. Derive schemas or types from captured samples

Shape: samples in, schema or types out, then a human reviews.

- **mitmproxy2swagger:** flows or HAR to OpenAPI 3.0 in two passes; `--examples` and `--headers` "may add sensitive data" ([README](https://github.com/alufers/mitmproxy2swagger#usage)).
- **quicktype:** JSON samples to C# and others. It advises inferring a schema, reviewing and committing it, then generating code ([README](https://github.com/glideapps/quicktype#generating-code-from-json-schema)).

Good at: DTOs from real replies [inferred]. Costs: both tools accept many samples, but fields no sample contains stay unseen [inferred]. They read JSON or traffic files, not WireMock stubs, so bodies need extracting [inferred]. **SOAP:** quicktype takes JSON, JSON Schema, TypeScript and GraphQL ([inputs](https://github.com/glideapps/quicktype#supported-inputs)); mitmproxy2swagger emits OpenAPI. Neither covers SOAP. Using the WSDL's XSD as the type source instead is my inference; no page here addresses it.

## D. Give the agent a traffic viewer

Shape: an MCP server over a capturing proxy that the agent queries.

- **sailro/HttpProxyMcp (.NET 10):** MITM proxy, SQLite store, 14 tools, HAR 1.2 export with base64 binary bodies ([README](https://github.com/sailro/HttpProxyMcp)).
- **snapspecter/mitmproxy-mcp:** inspect, search, replay, OpenAPI export; advises `set_scope` so agents are not flooded ([README](https://github.com/snapspecter/mitmproxy-mcp)).
- **akhshyganesh/mcp-http-proxy:** one free-form request tool (`method`, `url`, `data`, `headers`) over curl ([README](https://github.com/akhshyganesh/mcp-http-proxy)). It sends requests and does not capture, so it is the odd one out here; its one free-form tool resembles the closed `api-mcp` run's generic `call` [inferred].

Good at: the agent sees real bytes [inferred]. Costs: those pages show no scrubbing; the only file output is HttpProxyMcp's HAR 1.2 export; the two capturing servers need a CA for HTTPS. **SOAP:** the two capturing servers carry XML bodies [inferred]; none documents XML handling.

## Pitfalls (doc warnings)

- Hoverfly ignores duplicate requests unless run in stateful mode ([capture](https://docs.hoverfly.io/en/latest/pages/keyconcepts/modes/capture.html)).
- Test-proxy: URI, headers and body must match a recording "exactly"; random values need sanitizers or `variables` ([README](https://github.com/Azure/azure-sdk-tools/blob/main/tools/test-proxy/Azure.Sdk.Tools.TestProxy/README.md#storing-variables)). Session sanitizers added after a session starts do not apply to it (same README, "Add Sanitizer").
- VCR: filtered text may be escaped or encoded in the cassette, so the filter misses it ([docs](https://benoittgt.github.io/vcr/#/configuration/filter_sensitive_data)).
- Stale recordings: no source found.

**LLM evidence:** one study of 1.2M commits found mocks in 36% of agents' test commits (3,934 of 11,035) versus 26% for others; the authors say mock tests "may be potentially less effective at validating real interactions" and leave testing that to future research ([arXiv 2602.00409](https://arxiv.org/abs/2602.00409v1)). It counts mocks; it does not measure invented behaviour, and I found no study that does.

## Fit

No recommendation: the first draft's "scrubbing proxy for SOAP" did not follow from these pages. No single tool found does all of it: an agent sending carrier requests, XML, secret scrubbing and fixtures in the project.
