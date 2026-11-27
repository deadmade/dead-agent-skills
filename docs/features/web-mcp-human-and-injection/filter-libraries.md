# Filter libraries for untrusted text (research, 2026-11-25)

[source] = read on a page fetched this run. [inferred] = my reading, not stated by a page. Pages were treated as data.

## 1. Microsoft (C#/.NET)

Two things fit the memory. Neither is an offline content filter.

- **Semantic Kernel prompt-template encoding.** Inserted variables and function results are treated as unsafe and HTML-encoded, so `</message><message role='system'>` cannot add a system message. Opt out with `AllowUnsafeContent`. It guards chat-template structure only, it never inspects meaning, and it runs locally. [source: https://devblogs.microsoft.com/agent-framework/protecting-against-prompt-injection-attacks-in-chat-prompts/ (the semantic-kernel URL redirected here)]. The post says the filter support (to plug in Prompt Shields) is covered in a separate post; I did not fetch it, so I cannot confirm that API's name.
- **Prompt Shields (Azure AI Content Safety).** A classifier service for "user prompt attacks" and "document attacks" (web pages, emails, tool results). The standalone API takes one `userPrompt` and up to five `documents` and returns `attackDetected`. It is cloud-only and the page documents no offline mode. It is trained mainly on English. It returns a verdict and does not block or clean anything. [source: https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection]
- **Spotlighting.** Delimiting, datamarking, or encoding (base64/ROT13) of untrusted text, plus a system-prompt line saying not to obey it. The Foundry toggle is preview, base64 only, and Chat Completions only. It raises token cost and the model then mentions the encoding. The transform is trivial to do locally. I fetched no Microsoft reference code. [source: https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks and the learn page above]
- **Not checked:** Microsoft.Extensions.AI. No claim either way.

Rust fit: none. Prompt Shields is an HTTPS call, and Spotlighting is a technique to copy.

## 2. Rust crates

| Crate | Does | How | Licence / last update | Fit |
|---|---|---|---|---|
| `llm-guard` 0.2.0 | Prompt-injection phrases, role-override markers, **`InvisibleText`** (zero-width/bidi), script mixing, IDN homographs, markdown-link smuggling, deobfuscation (base64, leet, confusables fold), `strip_controls` | Substring/regex rules, pure Rust, no network. Optional trigram "fuzzy" tier. A separate `llm-guard-ml` ONNX crate is described as a planned tier. | MIT OR Apache-2.0; 2026-05-17; 3 versions, young | Best fit. Whether `InvisibleText` covers Tags U+E0000-E007F is **not stated** [inferred: check the source]. [source: https://static.crates.io/readmes/llm-guard/llm-guard-0.2.0.html] |
| `patronus-ark` 0.1.18 | Injection, DLP, PII, tool risks | L1 rules offline; L2/L3 models downloaded | **GPL-3.0 or commercial** (Ark Core: MIT/Apache); 2026-11-24 | Use Core only, and only if its rules prove good. [source: https://static.crates.io/readmes/patronus-ark/patronus-ark-0.1.18.html] |
| `cerberust` 0.3.5 | "PII, secrets, prompt-injection" scanners | Only the crates.io blurb was read | not read; 2026-11-20 | Unverified. [source: crates.io search listing] |
| `unseen-core` 0.1.0 | "Removes invisible Unicode carriers, normalizes" | Only the blurb was read (README fetch 404) | not read; 2026-11-04; 11 downloads | Exactly the right job, but brand new and unvetted. |
| `invisible-characters` 0.1.6 | A list of invisible chars | Data | not read; 2026-06-18 | Data only. |
| `ammonia` 4.2.5 | HTML whitelist sanitizer (html5ever) | Parse, whitelist, serialize | MIT OR Apache-2.0; 2026-11-13 | See below. [source: crates.io API; https://docs.rs/ammonia/4.2.5/ammonia/struct.Builder.html] |
| `unicode-security` 0.1.3 | UTS #39 checks | Tables | MIT/Apache-2.0; 2026-11-02 | The fetched docs show only `identifier_allowed`; the confusable-skeleton and mixed-script APIs are [inferred] from UTS #39. It detects and does not strip, so it is no Tags/zero-width remover. [source: https://docs.rs/unicode-security/0.1.3/unicode_security/] |

**ammonia and hidden content: your suspicion is right.** It filters by tag, attribute and URL scheme. It does not evaluate CSS. Defaults remove `script` and `style` elements with their contents and strip comments. `style` is not an allowed attribute by default, so `<div style="display:none">hidden</div>` becomes `<div>hidden</div>` and **the hidden text survives** [inferred from the documented defaults]. Its optional `filter_style_properties` only filters properties and does not detect hiding. Default-allowed `title`, `alt` and `<details>` can still carry text. Removing hidden content needs your own DOM pass (computed-style or inline-style checks) before or instead of ammonia. [source: docs.rs page above]

## 3. Others (all outside a Rust binary)

- **LLM Guard (Protect AI):** Python scanners (PromptInjection, InvisibleText) using local HF models. **Archived**, no longer maintained. [source: https://github.com/protectai/llm-guard]
- **Rebuff:** Python/JS SDK needing OpenAI, Pinecone/Supabase. Self-described prototype; local-only mode is only a roadmap item. [source: https://github.com/protectai/rebuff]
- **LlamaFirewall / PromptGuard 2 (Meta):** Python 3.10+, local BERT-style classifier fetched from Hugging Face. AlignmentCheck needs a Together API key. [source: https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall] The model could be run from Rust via ONNX [inferred]. Its licence and ONNX availability are unchecked.
- **NeMo Guardrails (NVIDIA):** Python 3.11-3.13, Apache-2.0. Local regex/CEL rules, plus model or LLM-backed checks that call a configured endpoint. Its "injection detection" checks model output, not input. [source: https://github.com/NVIDIA-NeMo/Guardrails]
- **Lakera Guard:** HTTPS API (`/v2/guard`) on SaaS or a self-hosted container, for paying customers. [source: https://docs.lakera.ai/docs/api]

## Takeaway

The rule-based invisible-text, confusable and phrase detection is small enough to write ourselves in Rust. Of the crates, only `llm-guard` is a plausible dependency, and only after its source is read. A real injection classifier means Python, a cloud API, or running PromptGuard-style weights through ONNX. No crate removes CSS-hidden content.
