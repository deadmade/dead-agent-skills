# Raw evaluation: /research-feature, /understand, /learn, writing, the set (unverified, 2026-11-04)

Reviewer: fresh opus agent, read-only. Paths under `plugins/flows/`. Verification pending.

## Most important

1. Certain: /learn runs after finishing. Build flows run /review-code then /learn (build-feature:174-176, fix:75,
   implement:69, upgrade:54). review-code Decide rules on the Parking lot (checks.md:36) and then runs
   finishing-a-development-branch (merge, worktree removal; finishing:106,173). learn:59-61 then adds Parking-lot lines
   that flow-rules:76 says are picked "at Finish" (already past); its writes land after the merge/PR. Fix: /learn
   before review-code's Decide.
2. Certain: learn:53 "Don't ask the user; you decide" vs revise-claude-md (commands/revise-claude-md.md:52-54 "Apply
   with Approval… Only edit files they approve") and domain-modeling:66-68 "Only offer to create an ADR when…".
3. Certain: learn:26-27 "pstack `recall` on the topic or the current session" vs recall/SKILL.md:21 "skip the current
   chat"; recall:22 runs a full `why` sweep (up to seven investigators + a synthesizer) vs flow-rules:135.
4. Certain: research-feature:64-65 strength column per why/references/epistemics.md (Direct/Supported/Inferred/
   Speculative/Unknown) vs literature.md:33-35 High/Med/Low.
5. Certain (text), likely (effect): research → build-feature handover undefined (research:92-93). Inline: flow-rules:
   180-182 writes build-feature's state into a `flow: research` file without Tasks/Deviations/Parking lot. New command:
   build-feature:50-52 slug collision → spec and plan in another folder than research.md. Order of /learn and
   `phase: done` (research:94) vs the build undefined. Same for understand:20-21 (no state file; map only in chat).
6. Certain: research Phase 2 wiring: prior-art.md:32 "Write the report… to `<report path>`" but research gives no path
   (template Artifacts has only "Report:"); Source check takes "only the report file" (prior-art.md:40-41) with
   [source]/[inferred] markers, but literature.md:41 returns markdown without them; "rows from both reports"
   (research:69) can't be followed.
7. Certain: research Phase 1 asks before grounding (research:53-57); no confirmation of the framed question before two
   background agents run on it.

## Inconsistencies

- Certain: start/resume: research:40-44 lacks build-feature:45-48 "work in that worktree… write that copy";
  implement, fix, upgrade lack slug-resume, collision check and "never create over existing".
- Certain: learn:80 writes "under **Learned**"; only build-template.md:63 has it; flow-template.md and
  research-template.md don't.
- Certain: research-feature runs pstack `how`/`why` (research:55-56) but its uses.json lists no pstack-picks
  (flow-rules:155; README tree wrong).
- Certain: dead rule flow-rules:42-44 (/understand "called from a build flow…"); no conductor calls /understand.
- Certain: copyedit scope (flow-rules:62, writing:239, README:120: spec, plan, audit) vs research:92 copyedits
  research.md.
- Likely: copyedit.md:24 needs a subagent; flow-rules:10-12 skips subagent steps; flow-rules:63 still says "say… that
  it was copyedited".

## understand

- Certain: understand:43-45 "Follow mattpocock `teach`… no `lessons/`" vs teach:49 (HTML lesson in `./lessons/`),
  teach:65-67 (`./assets/`); overrides quote only two sentences.
- Certain: the course offer (understand:45) needs `/teach`, which packs don't install (flow-rules:158-160).
- Likely: understand:28-31 lists `how` first then graphify "first"; one `why` is the full seven-category sweep
  (why:31,49).

## learn readability

- Certain: Sort table says a check is "written test-first" (learn:40) vs Phase 3 "it is not written here" (59-61).

## The set

- Gaps: refactor (no behaviour change → no tests, flow-rules:205; build-feature too heavy, implement needs a plan);
  spike/prototype (research:35 forbids measuring; build-feature:98 spike only inside brainstorm); data/schema
  migration (only a stack-pack hint); release/changelog/version bump; performance regression or incident without a
  repro (/fix Phase 1 stops); onboarding a repo (AGENTS.md, glossary from scratch); bumping many dependencies.
- Overlaps: `how` + `why` grounding in understand, research, build-feature, implement; build-feature reruns grounding
  after a research handover.
- Split: flow-rules rules used by one conductor only: Audits (39-41), Scope (242-252), Reports (254-265), tob
  spec-compliance (167-172), all review-code's. Repeated instead of shared: untrusted-data (research:32,
  flow-rules:129), missing web-mcp (research:33-34, flow-rules:234), "Reviewers are independent" (build-feature:27-29,
  review-code:31-33). "Calling another conductor" (flow-rules:180-182) assumes the caller has a flow.md.
- Readability: flow-rules:70-128 (Deviations) is one ~60-line bullet with override markers inside.
- README: `/flows:writing copyedit` is the only user command missing from the table.
