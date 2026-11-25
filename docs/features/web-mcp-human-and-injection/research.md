# web-mcp: more human-like browsing and prompt-injection defence

Research run: [flow.md](flow.md). Search reports: [literature.md](literature.md), [prior-art.md](prior-art.md),
[filter-libraries.md](filter-libraries.md).

## Question

Which changes to web-mcp (and browser-core) would most cut blocks, captchas, busy errors and timeouts by making its
traffic look like one real person's, and which defences would most reduce prompt injection through the text and
actions it hands the agent? Constraints: Rust, Windows and Linux x64, one headed window on the user's own machine and
residential line, no paid keys or services (ADR 0004); stealth beyond ADR 0009 researched as an explicit option; the
user's localhost use of `fetch` must keep working; "work better" means fewer blocks and failures, not ranking quality.
Added during the run: an automated check against bot-detection pages.

## Answer

Stay inside ADR 0009 and fix behaviour, not fingerprints: web-mcp's remaining tells are robot-speed typing with no
pointer movement (E3) and a plain HTTP client that differs from its browser (E1), while stealth patching was detected
more, not less (E5, E6). For injection, wrap page text in per-reply random markers and strip invisible Unicode and
hidden elements in-house (E12, E19, E25, E29); this is defence in depth only, because adaptive attackers bypass every
marking or detection layer (E13, E14) and the user chose to keep private addresses and `eval` open.

## Evidence

All rows are from sources fetched in this run; the evidence table in flow.md is the record and overrides the search
reports. `checked` gives the claim vote (two fresh verifiers, opus and fable, plus the Phase 2 source check as a first
vote where it confirmed the row unchanged). M1 was measured in this session.

| #   | claim                                                                                                                                                     | source                                                       | type            | setting                                       | result                                          | transfers here?                                                      | strength | checked                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- | --------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------- | --------------------------- |
| E1  | [source] Swapping `HeadlessChrome` for `Chrome` in the UA (and, per both votes, dropping the HeadlessChrome brand from `sec-ch-ua`) unblocked 590/784 headless-only blocks; headless 15.2% soft-blocked vs 6.8–7.2% headed           | arXiv 2606.14525                                             | experiment      | Tranco 10K, datacenter IP                     | header consistency removes most headless blocks | partly: browser already headed; applies to the reqwest path          | Med      | unverified |
| E3  | [source] Behaviour separates 7 AI agents from 56 humans (F1 0.999) vs fingerprints ~0.80; agents 0.6–9.5 ms/key vs human 120 ms, no pointer movement      | arXiv 2605.01247                                             | experiment      | honeysite, own XGBoost detector               | timing is the strongest signal                  | partly: web-mcp types ~16 ms/key, no mouse; engines' use not shown   | Low-Med  | 2/2 confirmed |
| E4  | [source] Local agents in the user's Chrome passed nearly all defences; cURL/wget/scrapy failed Anubis proof-of-work                                       | arXiv 2606.30119                                             | experiment      | 9 honeysites, 1,449 visits, university IPs    | a real local browser passes most checks         | partly: same browser shape, not a residential line                   | Low-Med  | 2/2 confirmed |
| E5  | [source] Stealth Crawl4AI/BrowserUse stayed detectable and added header, referer and permission inconsistencies                                           | arXiv 2606.30119                                             | experiment      | same                                          | stealth didn't help                             | yes                                                                  | Low-Med  | 3/3 confirmed |
| E6  | [source] "Undetectable" services evaded DataDome 52.9%, BotD 44.6%; consistency rules cut evasion ~48%/45%                                                | arXiv 2406.07647                                             | measurement     | ~500k requests, 20 services                   | partial patching is detectable                  | yes                                                                  | Med      | 3/3 confirmed |
| E8  | [source] Google's "unusual traffic" page gives causes but no thresholds or pacing                                                                         | support.google.com/websearch/answer/86640                    | vendor docs     | n/a                                           | no published limit                              | yes                                                                  | Med      | 3/3 confirmed |
| E10 | [inferred] No source tests request spacing or burst limits against search-engine blocks                                                                   | absence                                                      | n/a             | n/a                                           | pacing benefit unmeasured                       | yes: main gap                                                        | n/a      | not checkable               |
| E12 | [source] Spotlighting: datamarking cut ASR ~50%→3.1% (GPT-3.5), encoding 0–1.8%, delimiters about halved it; plain "don't obey" modest; use random markers | arXiv 2403.14720                                             | experiment      | 1000 synthetic docs, static attack            | marking helps against static attacks            | partly: old models; today's warning line is the "instruction" tier   | Low-Med  | 3/3 confirmed |
| E13 | [source] Adaptive attacks bypassed 8 IPI defences at >50% ASR                                                                                             | arXiv 2503.00061                                             | experiment      | tool agents                                   | static ASR overstates protection                | yes                                                                  | Med      | 3/3 confirmed |
| E14 | [source] Adaptive attacks bypassed 12 defences (prompting and detectors) at >90% for most                                                                 | arXiv 2510.09023                                             | experiment      | 12 defences                                   | same                                            | yes                                                                  | Med      | 3/3 confirmed |
| E15 | [source] CaMeL: 77% of AgentDojo tasks with provable security vs 84% undefended                                                                           | arXiv 2503.18813                                             | benchmark       | AgentDojo                                     | constraining capability works, ~7 pt cost       | partly: lives in the host agent                                      | Med      | 3/3 confirmed |
| E16 | [source] Destination allow-list and planner/reader split: 0% exfiltration; fine-tuning 32.5%, output guard lost to ROT13                                  | arXiv 2608.27092                                             | preprint        | 6 models, mock tools                          | constrain destinations, not recognition         | yes in direction                                                     | Low      | 3/3 confirmed |
| E17 | [source] PromptArmor LLM sanitiser: FPR/FNR <1% on AgentDojo                                                                                              | arXiv 2507.15219                                             | benchmark (own) | AgentDojo                                     | strong static number                            | partly: an LLM call per page                                         | Low      | 3/3 confirmed |
| E18 | [source] Detectors largely fail on attacks without explicit instructions                                                                                  | doi 10.1145/3847320.3847398                                  | benchmark       | web-agent samples                             | —                                               | partly                                                               | Low      | 2/2 confirmed |
| E19 | [source] Models follow zero-width and Unicode Tag instructions; tool use raises compliance (h up to 1.37)                                                 | arXiv 2603.00164                                             | experiment      | 5 models, 8,308 outputs                       | invisible carriers are real                     | yes: web-mcp passes them through                                     | Low-Med  | 3/3 confirmed |
| E21 | [source] Anthropic: 1.4% ASR (Opus 4.5 + safeguards) in browser use vs adaptive attacker; "far from solved"                                               | anthropic.com/research/prompt-injection-defenses             | vendor blog     | Claude for Chrome                             | model layer helps, not zero                     | yes, outside web-mcp's control                                       | Low      | split |
| E22 | [source] OWASP LLM01: no fool-proof prevention; unranked list incl. least privilege, approval, segregating external content, filtering                    | genai.owasp.org/llmrisk/llm01-prompt-injection/              | standards       | n/a                                           | —                                               | yes                                                                  | Med      | 2/2 confirmed |
| E25 | [source] agent-browser `--content-boundaries` wraps snapshot, get text/html, eval, console output with a per-process nonce; defence in depth              | agent-browser.dev/security                                   | vendor docs     | n/a                                           | —                                               | partly: web-mcp formats its own output                               | Med      | 3/3 confirmed |
| E26 | [source] agent-browser: "For maximum protection, deny the eval category via --action-policy"                                                              | agent-browser.dev/security                                   | vendor docs     | n/a                                           | —                                               | yes                                                                  | Med      | 2/2 confirmed |
| E27 | [source] MCP fetch server refuses private addresses on every redirect hop, pins the connection, caps 5 MiB; `--allow-private-ips` is opt-in               | github.com/modelcontextprotocol/servers fetch `server.py`    | system design   | n/a                                           | private access off by default                   | yes: web-mcp's `fetch` is the reverse                                | Med      | 3/3 confirmed |
| E28 | [source] Readability-style extraction un-hides large hidden blocks when they hold the real page; extraction isn't a sanitiser                             | same `server.py`                                             | system design   | n/a                                           | —                                               | partly: web-mcp uses dom_smoothie, not checked                       | Med      | 3/3 confirmed |
| E29 | [source] Mitigation for Unicode Tags: filter the Tag code points at prompting and response time                                                           | embracethered.com 2024 hiding-and-finding-text-with-unicode-tags | blog         | n/a                                           | —                                               | yes                                                                  | Low      | 3/3 confirmed |
| E30 | [inferred] Patchright and rebrowser patch Playwright/Puppeteer, so neither applies to agent-browser without swapping the driver                            | Patchright and rebrowser READMEs                             | system design   | n/a                                           | —                                               | yes                                                                  | Med      | 2/2 confirmed |
| E31 | [source] impit wraps reqwest with patched rustls/h2: "Without the patched dependencies, the project won't build"                                          | github.com/apify/impit                                       | system design   | n/a                                           | —                                               | yes: clashes with the root lockfile policy [inferred]                | Med      | 3/3 confirmed |
| E32 | [source] MCP 2025-11-25: servers MUST sanitize tool outputs and rate limit; annotations are untrusted hints                                               | modelcontextprotocol.io/specification/2025-11-25/server/tools | spec           | n/a                                           | —                                               | yes                                                                  | Med      | 3/3 confirmed |
| E33 | [source] Semantic Kernel HTML-encodes inserted variables and function results so they can't add chat-role tags (`AllowUnsafeContent` turns it off); protects template structure only | Semantic Kernel docs, see [filter-libraries.md](filter-libraries.md) | vendor docs | n/a | — | partly: web-mcp has no chat template | Med | not voted |
| E34 | [source] Azure Prompt Shields is a cloud classifier (one prompt plus up to five documents per call, returns `attackDetected`); no offline mode found | Azure AI Content Safety docs, see filter-libraries.md | vendor docs | n/a | — | no: cloud call, key, a classifier (E14, E18) | Med | not voted |
| E35 | [source] Rust `llm-guard` 0.2.0 (MIT/Apache): rules only, offline: injection phrases, role markers, zero-width/bidi, homoglyphs; Tags block coverage not stated | crates.io / its README, see filter-libraries.md | system design | n/a | — | partly: phrase rules are a detector (E14); the invisible-text part fits | Low | not voted |
| E36 | [inferred] ammonia filters tags, attributes and URL schemes, not CSS, so `display:none` text survives | ammonia docs, see filter-libraries.md | system design | n/a | — | yes: hidden-element removal needs our own DOM pass | Med | not voted |
| M1  | agent-browser 0.43.0 (installed = pinned in `tools.json`) has `type --delay <ms>`, `mouse move --human --seed --duration`, `--input-mode human`, `--content-boundaries`, `--action-policy`, `--confirm-actions`; `--allowed-domains` "rejects CDP", so it can't be used with web-mcp's `--cdp` attach | `agent-browser --help` | measured | this machine | — | yes | High | measured |

**Claim vote** (2026-11-25, two fresh verifiers, opus and fable, given only the rows). Not supported:

- E1 (opus): "we replaced HeadlessChrome with Chrome in the User-Agent string and removed the HeadlessChrome brand from
  the sec-ch-ua header" — the row (as Phase 2 corrected it) named the UA only; fable confirmed. Unverified as voted.
- E2 (opus, fable): "Cloudflare (37.0%) and Akamai (26.4%) block at rates far above the overall average" — per-provider
  block rates, not shares of blocks (by share: "Cloudflare (challenge) 792 51.0"). The 82% part was confirmed.
- E7 (opus, fable): the bot-detection-engines page "does not mention JA3/JA4 fields"; the Enterprise-only clause came
  from the JA3/JA4 page, which the vote row didn't name. The headers/session/browser-signals and `__cf_bm` parts were
  confirmed by both.
- E21 (fable): "A 1% attack success rate—while a significant improvement—still represents meaningful risk"; the 1.4%
  per-model figure is in a chart image (opus and the source check read 1.4%).

**Didn't survive**

- E2: [source] Cloudflare 37%, Akamai 26% of blocks; 82% from bot detection — sank on the quote above.
- E7: [source] Cloudflare scores headers, session and browser signals; `__cf_bm` tracks one user's request pattern; JA3/JA4 Enterprise-only — sank on the quote above.
## Options

### Looking human / fewer blocks — picked H1

- **H0 (lite)**: per-key delays with jitter in typed search, staggered engine starts. For E3, M1; against E10. Effort S.
- **H1 Behaviour and honest consistency (picked)**: H0, plus a human mouse path before clicks (`mouse move --human`,
  M1), the same pacing for the `browser` tool's `type`/`click` with a shorter range, `fetch` keeping its honest
  `web-mcp/<version>` UA but adding `Accept-Language`, and block statuses (403/429/503) retried through the browser
  fallback. For E1 (unverified), E3, E4, M1; against E10, E8. Trade-off: every typed search gets slower (about 2.4 s
  for 20 characters at ~120 ms/key) against a 10 s engine deadline (`search.rs:30`). Effort M.
- **H2 Stealth stack (rejected)**: Patchright, rebrowser-patches, Camoufox or a driver swap, with a new ADR superseding
  0004/0009. Against E5, E6, E30, E31 and the terms-of-service risk ADR 0009 names; for it only vendors' self-reported
  passes. Effort L.

### Validation — picked both

An opt-in run, outside `npm test` and CI, that opens sannysoft, browserscan, deviceandbrowserinfo and CreepJS in
web-mcp's real window and records pass/fail and the signal per page, run by hand on Windows and NixOS; plus a
per-engine block/timeout log over real use. The log decides: check pages catch regressions (webdriver flag, typing
speed) but don't predict engines (the google-block spike: deviceandbrowserinfo said "bot" while Google let the window
through). Effort S–M.

### Prompt-injection defence — picked I0 plus hidden elements and a cap

- **I0 (lite)**: a per-reply random nonce opening and closing the untrusted block, the URL outside it; in-house
  stripping of Unicode Tags (U+E0000–E007F), bidi controls and zero-width characters, keeping joiners where scripts
  need them. For E12, E19, E25, E29; against E13, E14. Effort S.
- **Picked**: I0, plus `fetch` dropping `[hidden]`/`aria-hidden` elements like `rows` already does (ammonia can't, it
  ignores CSS: E36), and a 50,000-character reply cap (today 200,000, `tools.rs:330`) whose note names the `.web/` file
  holding the rest and marks it untrusted. Effort S–M.
- **I1 Capability limits (declined)**: `eval` off by default behind a config switch, the private-address check on
  `browser open`, `fetch` limited to loopback. For E15, E16, E26, E27; the only class measured near 0% ASR. The user
  kept private addresses and `eval` open for their workflow: **accepted risks** — injected text can still steer
  `fetch`/`browser` to the home network or `169.254.169.254`, and `eval` can send a tab's data anywhere. Effort M.
- **I2 Classifier per page (not recommended)**: Prompt Shields (cloud, E34), PromptGuard 2 (Python/model), `llm-guard`
  phrase rules (E35). Against E14, E18, false positives on pages about injection, and a runtime or key. Effort L.

## Recommendation

Build H1, the validation run and log, and the picked injection set, in that order of value: the block log first, so
H1's effect is measured rather than assumed. What would change it: the log showing blocks driven by volume rather than
behaviour (then pacing and rests, A3, matter more than input timing); engines blocking anyway with H1 in place (then
H2 comes back as an ADR question); an injection incident through `eval` or a private address (then I1's limits).

## Open questions

- Does human-speed typing lower search-engine blocks at all? No source measured pacing or behaviour against Google,
  Bing, DuckDuckGo or Brave (E10, E3's detector is the authors' own). The block log settles it.
- Does the slower typing push typed searches past the 10 s engine deadline and raise the timeouts the user wants
  fewer of? A measurement here settles it.
- web-mcp types with one `press` per key, not agent-browser's `type --delay`; how to space keys inside one batch (a
  wait between presses, or switching to `type --delay`) is unmeasured.
- What do `dom_smoothie` and `htmd` keep of comments, `alt`/`aria-label` text and CSS-hidden nodes? Unverified (E28 is
  about a different extractor).
- Does the Windows window (Chrome for Testing) pass the same check pages as NixOS/Helium? Not measured (ADR 0009).
- `docs/adr/0009-hosted-search-first.md` describes hosted search first, but no such code was found in `search.rs`.

Not checked: the claim vote ran once, so E33–E36 (the filter-library lookup) were not voted; E1 is unverified and
E21 split; no source measured pacing against search engines. Risk: the user kept private addresses and `eval` open,
so the picked injection defences reduce but do not close the path from a hostile page to an action.
