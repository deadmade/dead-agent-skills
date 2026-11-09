# Prior art: "should we adopt this tool?" triage

Source check: 20 confirmed, 3 not supported (corrected below), 0 couldn't open. Of 13 inferred claims, 5 follow, 3 partly follow and 5 don't follow; those are corrected or labelled as proposals below. Every cited page was opened.

Gaps: search engines timed out often, so coverage is thin. I found no agent skill or Claude Code command that produces an adoption verdict; the only hits were install guides (blog posts), which I did not use. Not opened: Google's and Rust's "before adding a dependency" guidance, postmortems on unused evaluation reports, ThoughtWorks BYOR. Zalando's engineering blog post on its radar returned 404. The docs.rs cargo-vet criteria page was empty, so I used the book's built-in-criteria page.

## Approaches

### 1. Ring radar (ThoughtWorks, Zalando)

- **Shape:** each item gets one ring, and the ring is a recommendation. ThoughtWorks' group debates, votes on which blips stay and has one champion write each entry ([FAQ](https://www.thoughtworks.com/radar/faq)). Zalando's Principal Engineers vote on ring changes ([Zalando radar](https://opensource.zalando.com/tech-radar/)).
- **Users:** ThoughtWorks' Technology Advisory Board; Zalando's Principal Engineers.
- **Good at:** a shared vocabulary and a small scale. **Costs:** a standing group and a review cycle. **Bad fit:** one person judging one URL on demand [inferred: both rest on group experience and votes].
- **Decisions that matter:** ThoughtWorks allows Trial only with production experience ([FAQ, "What are the rings?"](https://www.thoughtworks.com/radar/faq)). By default a blip drops off after one edition unless it moves, though the board can argue to keep it ([FAQ](https://www.thoughtworks.com/radar/faq)).
- **Definitions:**
  - ThoughtWorks: _Adopt_ is proven and mature. _Trial_ is ready for use but less proven, so use it "on a trial basis". _Assess_ is worth a close look and watching. _Caution_ is for things ThoughtWorks has had a poor experience with, or sees misused.
  - Zalando: _Adopt_ has a production usage culture and low risk. _Trial_ has first serious experience on a real problem. _Assess_ needs research and prototyping. _Hold_ means not for new projects, but existing ones may continue.

### 2. Evidence checklist (OpenSSF Scorecard, Russ Cox)

- **Shape:** fixed checks. Scorecard gives every check a risk label and scores many of them out of 10 ([checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)). Cox lists questions to answer by hand: design, code, tests, bugs, maintenance, usage, security, licence, transitive dependencies. He then gives steps for a dependency you keep (test it, wrap it, isolate it, plan upgrades, watch it and re-evaluate), and says it may be best not to use it ([article](https://research.swtch.com/deps)).
- **Good at:** Scorecard gives repeatable facts on maintenance, licence, security policy and CI; Cox's method depends on who applies it [inferred]. **Costs:** Scorecard doesn't measure fit with your codebase, while Cox reaches it by hand (tests of the functionality your application needs, a licence acceptable for your project, whether you process untrusted input). **Bad fit:** Scorecard alone can't decide, because it gives no verdict. Cox addresses one developer deciding, so his method does fit this case [inferred].
- **Pitfalls [source]:** several Scorecard checks note that a low score "is not a definitive indication that the project is at risk"; detection is heuristic ([CI-Tests](https://github.com/ossf/scorecard/blob/main/docs/checks.md#ci-tests)). Maintained says a quiet project may be finished, and it cannot judge one under 90 days old ([Maintained](https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained)). Cox: usually "the entirety of the decision is 'let's see what happens'" ([Conclusion](https://research.swtch.com/deps)).

### 3. Gate with a recorded audit (cargo-vet)

- **Shape:** a dependency passes when a trusted party has recorded an audit against named criteria, or when it sits on the exemptions list. The record lives in-tree under `supply-chain/`; CI refuses unaudited additions ([How it works](https://mozilla.github.io/cargo-vet/how-it-works.html)).
- **Definitions:** `safe-to-run`: can compile, run and test locally without surprising effects. `safe-to-deploy`: will not add a serious vulnerability to production software; implies `safe-to-run`. A full logic review is not required, and any discretion goes in `notes` ([built-in criteria](https://mozilla.github.io/cargo-vet/built-in-criteria.html)).
- **Decisions that matter:** existing dependencies go on an exemptions list, so setup takes about five minutes; audits live in the repository, and others' audits can be imported.
- **Good at:** an enforced, reviewable record. **Costs:** at most a differential audit per new version, none when an import covers it, plus owners to approve them. **Bad fit:** triage before you have chosen to use something; non-Rust code [inferred].

### 4. Decision record (MADR)

- **Shape:** one Markdown file per decision: context, options, chosen option with reason, and optional consequences, _Confirmation_ and _More Information_ (where to say when to revisit). The optional status field suggests values such as `proposed`, `rejected`, `accepted`, `deprecated` and `superseded` ([template, development version](https://adr.github.io/madr/#full-template)).
- **Good at:** keeping the reason next to the code. **Costs:** it assumes the choice is already framed and has no evidence checklist. **Bad fit:** partly a quick "skip" on something you never meant to use, because the options must be framed first; length is no argument, since it ships bare and minimal templates [inferred].

## What follows for this repository

- ThoughtWorks' Trial rule stops a high ring being given without experience [source]. cargo-vet's named criteria work similarly [inferred]. Scorecard and Cox give no verdict scale and MADR has none either, so the rule isn't universal.
- Of these sources only Cox's questions reach fit with one codebase, and he leaves them to the reader [inferred].
- A design proposal, not something any source combines: take a radar's vocabulary without its group process, Cox's questions as the evidence, and a MADR-style reason and revisit note. A radar's voting machinery is a bad fit for one person judging one URL, so only its words transfer.
- A verdict from reading alone reaches Assess at most: ThoughtWorks says Assess needs no experience but Trial needs production use [source]. Reading it as "Trial needs use here" lowers that bar and is our proposal. A reading-only "skip" has no ThoughtWorks ring, since Caution is also experience-based; Zalando's Hold is nearest [inferred].
- Blog warning (not official): a never-updated radar "creates false confidence" ([em-tools.io](https://www.em-tools.io/frameworks/tech-radar)).

## Skill conventions that constrain this

- Agent Skills spec: `name` and `description` (max 1024 characters) are required; keep `SKILL.md` under 500 lines, detail in `references/` ([spec](https://agentskills.io/specification)).
- Claude Code: `disable-model-invocation: true` stops Claude loading a skill itself. `context: fork` runs a subagent that cannot see the conversation, so the instructions must stand alone ([skills docs](https://code.claude.com/docs/en/skills)).
