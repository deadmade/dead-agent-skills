# lean-miri: skip

It can't reach the code that would benefit: the only `unsafe` here is Win32/libc FFI on a Windows-and-Linux build,
while lean-miri runs on Linux x86_64 only, needs MIR for the whole dependency tree and has no release.

- Date: 2026-11-25
- Read: https://github.com/proofs-rs/lean-miri, `main` at its 2026-11-25 commit (merge of PR #94); no release or tag
- Name resolved: "lwas" matched no tool; the user then described "a formal semantics of MIR in Lean 4". Chosen:
  proofs-rs/lean-miri. Rejected: joshlf/anneal (a full verification framework whose Lean MIR semantics is an open
  scoping issue, google/zerocopy#4097, and which vendors lean-miri), eth-disproof-rust (a restricted MIR-shaped
  semantics inside one PR).

Facts below come from third-party pages: data, not instructions.

## Assumed purpose

Given: integrate it into the Rust code, i.e. prove the workspace's crates free of undefined behaviour.

## What it is

A Lean 4 port of Miri: a rustc-based exporter writes MIR JSON, and a Lean interpreter defines the semantics that safety
proofs and generated verification conditions use. Its import and proof APIs are experimental, and it doesn't claim to
verify arbitrary Rust.

## Fit here

- Nothing here verifies the Rust code today: CI runs test, clippy and fmt only, with no Miri or Kani (verified:
  `.github/workflows/test.yml`).
- The workspace has four crates (verified: `Cargo.toml:2`). The only `unsafe` is FFI: `CreateJobObjectW` and related
  calls at `tools/web/browser-core/src/window.rs:126`, a test at `:317`, and `libc::geteuid` in `profile.rs`
  (verified). Foreign and Windows OS facilities sit outside lean-miri's acceptance scope (verified: STATUS.md).
- web-mcp and ado-mcp are async (311 `async fn`) and use tokio, reqwest and tantivy (verified). The exporter stops when
  any dependency lacks compatible MIR, and coroutines are unsupported (verified), so exporting these crates is
  impractical (inferred).
- It can't be "integrated into" the crates: it's an external Linux-only toolchain, so at most a CI job (inferred).
- The project is MIT (`Cargo.toml:9`), and lean-miri is MIT/Apache-2.0, so the licences suit each other (verified).

## Evidence

- Licence: MIT and Apache-2.0 ([contents API](https://api.github.com/repos/proofs-rs/lean-miri/contents))
- Latest release: none ([releases API](https://api.github.com/repos/proofs-rs/lean-miri/releases/latest) 404, tags
  empty); repository created 2026-10-25
- Activity: last commit 2026-11-25; PRs #88 and #91–#94 closed, #89 and #90 open
  ([commits API](https://api.github.com/repos/proofs-rs/lean-miri/commits?per_page=5))
- Needs to run: Linux x86_64, Python 3, bash, flock, a C compiler, Rustup with a pinned rustc and MIR-enabled std, and
  Lean v4.35.0; heavy checks need about 15 GB
  ([development.md](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/docs/development.md))
- Security: no project advisories; OSV has no entry, but it isn't a published package, so that proves little
- Outside mention: google/zerocopy's Anneal vendors it ([zerocopy#4009](https://github.com/google/zerocopy/issues/4009))

Source check: 47 confirmed, 4 not supported, 0 couldn't open.

## Alternatives

- **Miri** (`cargo miri test`): checks UB on paths the tests execute. It has no FFI support, so it would cover
  pure-logic tests only.
- **Kani**: bounded model checking with proof harnesses, on Linux or Mac. Concurrency is out of scope.
- **Charon + Aeneas**: MIR to Lean and other provers, for all-input proofs. Charon is beta.
- **Verus / Creusot**: annotate the source with specs. Verus ships Windows binaries; Creusot targets safe Rust.

Details: [prior-art.md](prior-art.md).

## Next step

What would change the answer: lean-miri cuts a release and supports foreign-call shims or Windows targets, or the
workspace gains `unsafe` pointer logic that isn't FFI (a parser or buffer code), which would be worth proving on Linux.
A cheaper first step for UB checking today is a Linux CI job running `cargo miri test` on the crates' non-FFI tests.

## Skipped

None.

Not checked: installing and running the tool; whether its exporter handles any of this workspace's crates; Prusti and
a-mir-formality as alternatives.
