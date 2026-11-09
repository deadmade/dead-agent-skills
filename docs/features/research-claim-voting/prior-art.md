# Prior art: verifying cited claims with several agents

**Source check:** [source] claims: 38 confirmed, 6 not supported (corrected below), 0 couldn't open. [inferred] claims: 2 follow, 5 partly follow (narrowed below), 2 don't follow (removed or relabelled below).

**Gaps:**

- Claude Code's `/deep-research` is documented only as "votes on each claim". Verifier count, threshold and prompts are not in the pages I opened. The bundled `workflow-authoring` skill text (read through the Skill tool, not a web page) has a 3-skeptic example.
- Nothing I opened measures N same-model verifiers checking claims against cited sources. Voting evidence comes from reasoning and judging tasks. Most papers were read at abstract level; CoVe was read in full HTML.
- The Codex page gives no default thread cap and was served from `learn.chatgpt.com`. Google search timed out.

## Approach A: one isolated verifier per claim, no vote

Each claim goes to its own call, shown the claim and its evidence. Some use more than two labels.

- SAFE searches up to `max_steps` times per fact, then answers Supported or Not Supported; a parse failure returns `None`, not a label ([rate_atomic_fact.py](https://raw.githubusercontent.com/google-deepmind/long-form-factuality/main/eval/safe/rate_atomic_fact.py)). It costs about $0.20 per prompt-response pair, up to $0.40 for longer responses ([README, Cost](https://github.com/google-deepmind/long-form-factuality/tree/main/eval/safe)).
- The Databricks agent's verifier sees only the claim and cited evidence, never the report, against self-confirmation bias. Verdicts: SUPPORTED, PARTIAL, UNSUPPORTED, CONTRADICTED. Failed fetches fall back to snippets marked lower confidence. Failed claims can be softened with "(unverified)", one of three strategies, and that stage is disabled at its Light depth ([Stage 1, Stage 4, Stage 7](https://github.com/mshtelma/databricks-deep-research-agent/blob/main/docs/citation-pipeline.md)).
- CoVe's factored mode answers each check in a separate prompt that can't see the draft: FactScore 60.8 joint, 63.7 factored ([§3.3, §4.3](https://arxiv.org/html/2309.11495v2)).
- DeepResearch Bench's FACT extracts statement-URL pairs, scrapes, and has an LLM judge support ([Evaluation Framework](https://github.com/Ayanami0730/deep_research_bench)).

Good at: no interference between claims [source: CoVe §3.3], and a failure stays local [inferred]. Costs: calls grow with claim count [source: VeriFastScore, EAVer]. Bad fit: when one false "confirmed" is expensive, since no second reader checks most claims [inferred].

## Approach B: per-claim panel with a vote

Each claim goes to N verifiers and the majority decides.

- Claude Code `/deep-research` votes on each claim and filters losers. A claim its verifiers could not check after a rate limit or API error is listed as unverified, not refuted ([Run a bundled workflow](https://code.claude.com/docs/en/workflows.md)).
- The workflow-authoring skill's example: 3 skeptics told to refute, survive at 2 or more non-refuted, "default to refuted=true if uncertain". An uncertain verifier counts against the claim, and a dead agent falls short of the 2 votes, so can't-check ends up as refuted, unlike the docs' rule [inferred].
- PoLL: a panel of smaller models from disjoint families beat one large judge, with less intra-model bias, at over 7x lower cost ([abstract](https://arxiv.org/abs/2404.18796)).

Good at: catching one verifier's slip, when slips are uncorrelated [inferred]. Costs: N times A's calls, though agents in one run can share a prompt cache [source: workflows docs]. Bad fit: N copies of the author's own model, because errors correlate (below), although nothing tests this on claim checking [inferred].

## Approach C: one verifier over a batch

- VeriFastScore verifies all claims of a response in one pass, 6.6x faster. Few-shot prompting of closed LLMs could not do its joint task (decompose, judge verifiability and verify, on about 4K evidence tokens); it needed a fine-tuned 8B model. That result doesn't cover verifying a list that already exists ([abstract](https://aclanthology.org/2025.findings-emnlp.491/)).
- EAVer groups related claims and reuses evidence, with about 80% fewer searches than the most search-efficient baseline, but is a trained policy ([abstract](https://arxiv.org/abs/2609.22223)).
- Batch prompting cut cost up to 5x at six samples with comparable accuracy; batch size and task complexity affect it ([abstract](https://arxiv.org/abs/2301.08721)). A 2026 follow-up says it has "unpredictable downstream task performance" and proposes a fix ([abstract](https://aclanthology.org/2026.findings-emnlp.119/)).

Good at: cost and shared evidence. Costs: a fine-tuned model or a harder prompt. Bad fit: claims citing many different long pages, unless the verifier keeps compact notes as EAVer does [inferred].

## Docs that constrain the design

- Workflows: 16 concurrent agents by default (fewer with fewer CPUs), 1,000 per run; a large run flags above 25 agents or 1.5M tokens ([Behavior and limits, Cost](https://code.claude.com/docs/en/workflows.md)). Non-fork subagents lose the `Workflow` tool; forks keep the main session's tools.
- Subagents: 20 concurrent, 3 layers deep ([limit](https://code.claude.com/docs/en/sub-agents.md#concurrent-subagent-limit), [depth](https://code.claude.com/docs/en/sub-agents.md#let-subagents-spawn-their-own-subagents)). A non-fork starts with fresh context: the task message plus CLAUDE.md files, git status, preloaded skills and a sibling roster ([startup](https://code.claude.com/docs/en/sub-agents.md#what-loads-at-startup)). Background subagents keep every MCP tool ([tools](https://code.claude.com/docs/en/sub-agents.md#available-tools)). Final reports are scanned for instruction-shaped text ([scanning](https://code.claude.com/docs/en/sub-agents.md#subagent-output-scanning)).
- Codex: `agents.max_concurrent_threads_per_session` caps threads; subagents inherit the parent's sandbox and MCP servers ([Global settings](https://developers.openai.com/codex/subagents)).
- FEVER labels claims Supported, Refuted or NotEnoughInfo ([abstract](https://arxiv.org/abs/1803.05355)); no label name means "page didn't open" [inferred].

## Pitfalls

- Models agree 60% of the time when both err, on one leaderboard dataset, and larger models' errors stay correlated across providers ([Correlated Errors, ICML 2025](https://arxiv.org/abs/2506.07962)). No page tests same-model verifiers directly.
- Majority voting alone explains most of multi-agent debate's gains ([Debate or Vote](https://arxiv.org/abs/2508.17536)). Voting can help easy items and hurt hard ones as calls grow ([Are More LLM Calls All You Need](https://arxiv.org/abs/2403.02419)).
- A preprint on 7B-32B open models, with one frontier API check, finds homogeneous teams hit a ceiling and heterogeneous teams escaped it ([Ringelmann effect](https://arxiv.org/abs/2606.02646)). Treat as suggestive.
- LLM evaluators favour their own outputs ([self-preference](https://arxiv.org/abs/2404.13076)). Whether that reaches a verifier shown one claim and its source is untested.
- Phrasing: CoVe measured yes/no checks at 0.19 against 0.22 for general questions in factored mode, and 0.15 each in joint mode. Its "tends to agree" examples are anecdotes about ChatGPT ([§4.3](https://arxiv.org/html/2309.11495v2)).
- Anthropic's blog post found one judge call more consistent with humans than "multiple judges to evaluate each component", when grading research output on criteria that include factual and citation accuracy. That may not be an N-voter panel ([Effective evaluation](https://www.anthropic.com/research/multi-agent-research-system)).
