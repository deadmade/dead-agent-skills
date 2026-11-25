# web-mcp guards what it returns and keeps its capabilities open

Every web-mcp reply carries text a hostile page controls, and the agent reading it can act: `fetch` reaches private
addresses (for the user's own localhost sites), `browser open` reaches any http(s) URL and `browser eval` runs
arbitrary JavaScript. Until now the only defence was one sentence before the page text. The research run
(`docs/features/web-mcp-human-and-injection/research.md`) found that only capability limits measured near 0% attack
success (its E15, E16), while marking and detection are bypassed by adaptive attackers (E13, E14, E18).

The user chose to keep the capabilities and guard the replies instead. Every reply carrying page text now goes
through one guard in web-mcp (error texts only get the stripping): the Source line stays outside a block opened and closed by markers with a fresh random nonce; Unicode Tag
characters, bidi controls and zero-width characters are stripped in-house (joiners kept); `fetch`'s reply cap falls
to 50,000 characters; and the offline rule library `llm-guard` matches page text against two short tables of our own,
multi-word injection phrases and chat-template sentinels (`<|system|>`, `[INST]`), each hit removed and replaced by a
visible placeholder, counted in the Source line. `.web/` keeps the original. `lookup`'s structured records and `browser eval` output (the agent's own script, with no archive) get the
markers and stripping only. Hidden elements (`[hidden]`, `aria-hidden`) already never reach a reply: Readability
drops them, and a test pins that.

llm-guard's own scanners are not used. Run over sample text, its `Block`-rated scanners removed ordinary words
("Operating system:", `### Example:` headings, links titled `README.md`), while its curated injection phrases are rated
only `Warn`.

Stealth (patching the driver or browser, ADR 0009's forbidden list) was considered again and rejected again: the
research found patched stacks detected more, not less (E5, E6).

## Considered options

- **Limit capabilities**: private addresses opt-in for `fetch`, the private-address check on `browser open`, `eval`
  off by default. Declined by the user ("A guard against promt injection should be enough"; "we can let this be turned
  on") for their localhost and page-scripting work.
- **Flag llm-guard hits in place** instead of removing them. Rejected by the user in favour of removal.
- **llm-guard's own scanners, removing their `Block` hits.** Rejected after measuring them: they cut ordinary pages
  and left injection phrases alone.
- **Withhold a page with hits.** Rejected: it would block every page that discusses injection.
- **A classifier model or cloud check** (PromptGuard 2, Prompt Shields, an LLM sanitiser). Rejected: a Python or
  model runtime, or a key and a cloud call, for detectors that adaptive attacks bypass.

## Consequences

- **Accepted risk.** Injected text can still steer `fetch` or `browser` to the home network or `169.254.169.254`, and
  `eval` can send a tab's data anywhere. The guard lowers the odds; it does not close that path.
- **Removal can cut real text.** A false positive removes words from an ordinary page; the placeholder says where, and
  the archived original is the fallback.
- **The guard is a rule list.** A rephrased attack passes `llm-guard`, and so does a listed phrase with doubled spaces
  or a line break inside (matching is exact up to ASCII case); the markers and stripping are what every reply gets
  regardless.
- **A new dependency** (`llm-guard`, young, MIT OR Apache-2.0) sits in the root workspace.
