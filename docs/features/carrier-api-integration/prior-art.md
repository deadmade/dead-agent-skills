# Prior art: agent-assisted integration from OpenAPI / WSDL / XSD

**Source check (2026-11-09, a fresh agent opened all 19 links):** 39 confirmed, 1 not supported, 0 could not open. Of 13 inferred claims, 3 followed, 6 partly, 4 did not. The report is corrected below; the closing recommendation is withdrawn.

**Gaps:** Kiota's polymorphism and supported-features pages 404'd, so its oneOf/anyOf handling is unverified beyond its validation rules. The `dotnet-svcutil` guide documents only `-u` and `--help`; the other options below come from the .NET Framework `svcutil.exe` page and may differ. This report does not cover recording real replies; see [prior-art-recording.md](prior-art-recording.md). Speakeasy docs were not opened. Several searches timed out. I found no benchmark for WSDL/XSD with agents, and none comparing generated types, spec slice and full docs on one task.

## Approach 1: generator first, agent reads the output

A generator runs on a filtered spec; the agent reads its types and client, then writes mapping and error handling.

- **Kiota** — C# stable, OpenAPI only. `--include-path`/`--exclude-path` take globs with `#GET`-style method filters; `kiota show` prints the path tree to pick filters; a `kiota-lock.json` records parameters and a description hash, and generation is skipped when nothing changed. [source: [Using Kiota](https://learn.microsoft.com/en-us/openapi/kiota/using)] Generated code must not change when you add resources. [source: [Kiota design](https://learn.microsoft.com/en-us/openapi/kiota/design), "URI space tree"] It warns on `oneOf`/`anyOf` without a discriminator and on divergent success schemas. [source: [Using Kiota](https://learn.microsoft.com/en-us/openapi/kiota/using), `--disable-validation-rules`]
- **OpenAPI Generator** — filters by `operationId`, tag, method or path (normalizer `FILTER`); `SORT_MODEL_PROPERTIES` makes output independent of property order in the spec; the normalizer rewrites oneOf/anyOf/allOf. [source: [Customization](https://openapi-generator.tech/docs/customization/), "OpenAPI Normalizer"]
- **NSwag** — emits one C# client plus DTOs as a `partial` class with hooks. [source: [CSharpClientGenerator](https://github.com/RicoSuter/NSwag/wiki/CSharpClientGenerator), "Extend the generated partial class"] Commands cover OpenAPI and JSON Schema only. [source: [CommandLine](https://github.com/RicoSuter/NSwag/wiki/CommandLine)]
- **SOAP: dotnet-svcutil / svcutil.exe.** `dotnet-svcutil` takes a WSDL file or a service address, generates a `ClientBase` proxy, and `-u` regenerates from `ConnectedService.json`. [source: [dotnet-svcutil guide](https://learn.microsoft.com/en-us/dotnet/core/additional-tools/dotnet-svcutil-guide)] `svcutil.exe` also accepts XSD. For local files you must pass every file; imports are followed only for remote URLs. [source: [svcutil.exe](https://learn.microsoft.com/en-us/dotnet/framework/wcf/servicemodel-metadata-utility-tool-svcutil-exe), "Code Generation"] The DataContractSerializer forbids `xs:choice`, `xs:all`, `xs:group`, attributes in complex types and `xs:union`; svcutil then falls back to XmlSerializer. [source: [Data Contract Schema Reference](https://learn.microsoft.com/en-us/dotnet/framework/wcf/feature-details/data-contract-schema-reference), "Support Levels", "Complex Types"]
- **SOAP: xscgen** (XSD only, no WSDL/client) — XmlSerializer classes with namespace mapping and renames. It treats `xs:choice` as a sequence, so you must set only a valid combination by hand; recursive choices, groups with maxOccurs>0, and choices whose elements have minOccurs>0 or are nillable are unsupported. [source: [XmlSchemaClassGenerator README](https://github.com/mganss/XmlSchemaClassGenerator), "Choice Elements", "Unsupported"]

**Good at:** names and types come from the spec; rerunning is cheap; the compiler checks the agent, except for what the generator flattens, such as valid `xs:choice` combinations under xscgen [inferred]. **Costs:** a generator toolchain (the .NET SDK for dotnet-svcutil, Java for OpenAPI Generator's `java -jar` route); filtering needs a first look at the API [inferred]. **Bad fit:** SOAP outside .NET, since Kiota and NSwag target other languages for OpenAPI only; `xs:choice` under xscgen [inferred from the sources above]. Generated types describe what the spec claims, not what the server returns [inferred]. **SOAP:** yes, .NET only: svcutil (client and data types), xscgen (types only).

## Approach 2: slice or render the spec as Markdown

The agent reads a smaller, readable form of the document and writes the code itself.

- **Redocly `split`** writes each path, webhook and component to its own file. OpenAPI 3.x and AsyncAPI only, split per path, not per operation. [source: [split](https://redocly.com/docs/cli/commands/split)]
- **widdershins** renders OpenAPI/Swagger/AsyncAPI to Markdown; `--shallowSchemas` controls schema size and `--maxDepth` limits schema examples. [source: [README](https://github.com/Mermade/widdershins), "Options"]
- **llms.txt** — small index of links plus `.md` mirrors of pages, "fetched only when needed". [source: [llmstxt.org](https://llmstxt.org/)] Mintlify splits indexes over 100,000 characters. [source: [Mintlify](https://www.mintlify.com/docs/ai/llmstxt), "Split indexes"]

**Good at:** output is language-neutral; the tools need only an npm install [inferred]. **Costs:** the agent still writes the DTOs, so nothing stops a wrong one [inferred]. **Bad fit:** specs with long `$ref` chains, if slices drop referenced schemas [inferred]. **SOAP:** none read WSDL; you would write and own a WSDL/XSD-to-Markdown step [inferred; their docs list no WSDL input].

## Approach 3: query or execute server over the spec

An MCP server holds the spec; the agent searches it and, usually, calls the API.

- **Cloudflare Code Mode** exposes `search` and `execute`; the spec stays in a sandbox, "only what the search code returns enters the model context". External `$ref`s stay unresolved; marked experimental. [source: [Code Mode MCP guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/), "Publish a large API"; [blog](https://blog.cloudflare.com/code-mode-mcp/)]
- **Stainless** generates MCP servers from OpenAPI: a 3-tool dynamic mode ([changelog](https://www.stainless.com/changelog/mcp-dynamic-tools/)) or SDK code mode, `docs_search` + `execute`. [source: [SDK code mode](https://www.stainless.com/blog/sdk-code-mode/)]
- **Context7** serves library docs via `resolve-library-id` and `query-docs`; its parser and crawler are private. [source: [README](https://github.com/upstash/context7), "Available Tools", "Disclaimer"]

**Good at:** huge APIs, many calls per task [inferred]. **Costs:** a running service, sandbox, auth [inferred]. **Note:** the earlier `api-mcp` design had this shape. Search over the spec needs no live calls, and Context7 targets coding, so the shape is not limited to operating an API. **SOAP:** none of the three documents WSDL or SOAP support.

## Evidence

- Stainless's own eval: 31 cases, one API (Increase), Claude Opus; SDK code mode scored completeness 98% vs 94% (Anthropic Code Mode), 90% (Cloudflare) and 70% (dynamic tools); factuality was far lower, 53, 43 and 33 for SDK code mode, Cloudflare and dynamic tools. Vendor benchmark of API _operation_, not integration code. [source: [SDK code mode](https://www.stainless.com/blog/sdk-code-mode/), "Overall results"]
- WAPIIBench follow-up: retrieving compact endpoint representations "reduces hallucinations" for full invocations but hurts when the endpoint is already given ("unnecessary parameters"); constraints derived from the spec, enforced during generation, reliably prevent illegal URLs, HTTP methods and arguments. [source: [arXiv 2607.05936](https://arxiv.org/abs/2607.05936), abstract] These arms are retrieval and constrained decoding; neither compares generated types that an agent reads.

## Inference

No approach here observes what the API really returns, which is what the developer later named as the failure. No SOAP tool outside .NET turned up in this search.
