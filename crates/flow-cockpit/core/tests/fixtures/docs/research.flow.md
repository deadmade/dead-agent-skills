---
flow: research
phase: report
now: Waiting for you to approve the report (Gate 1).
---

# Tenant databases: research

## Request

<!-- The user's words, verbatim. -->

How should we split databases per customer?

## Artifacts

- Report: docs/features/tenant-databases/research.md

## Gates

<!-- One line per gate: `- Gate <n>, <what>: <date>[, <extra>]`. The date stays empty while the gate is open; a
reopening is appended as `Reopened <date>: <why>`. -->

- Gate 1, report approved: 2026-10-22

## Skipped

<!-- Phases the user chose to skip, and why. -->

None.

## Grounding

<!-- What the code looks like where this lands: modules, entry points, conventions, file:line. -->

Every query goes through `db.rs:30`.

## Prior art

<!-- Approaches found, who uses them, key sources; source check: confirmed / not supported / couldn't open. -->

Citus shards by tenant id; Postgres row-level security keeps one schema.

## Evidence

<!-- The literature agent's table (E1, E2, …), agreements, conflicts, gaps. -->

E1: shared schema with a tenant column scales to thousands of tenants.

## Options

<!-- One `### <decision>` heading per decision, then `Picked: <the choice in plain words>`; below it, the options
offered, the evidence rows and the recommendation. -->

### Split

Picked: one schema with a tenant column and row-level security

## Run verdict

<!-- The user's, at Finish: worked as a whole: yes | no; clean: yes | no. -->

Worked as a whole: yes; clean: yes.
