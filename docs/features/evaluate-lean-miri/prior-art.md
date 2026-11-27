# Prior art: formally checking Rust MIR (lean-miri evaluation)

Source check (2026-11-25, fresh agent): 47 confirmed, 4 not supported, 0 couldn't open. Corrections applied below; uncited
trade-offs relabelled [inferred].

Gaps: web search engines timed out, so no blog posts or third-party write-ups were found; the only outside mention found is via GitHub's issue search (see Tool facts). Prusti's repo API redirected (moved) and I did not follow it, so Prusti is not covered. OSV has no entry for lean-miri, but it is not a published package, so that is weak evidence. Docs were read from `main`/`master` raw files, not versioned releases.

## Approaches

### A. Dynamic UB interpreter (Miri, with MiniRust as its spec)
- Shape: interprets MIR and aborts on UB on the executed path; MiniRust is the same semantics written as a spec-interpreter.
- Used by: rust-lang/miri, run in CI with `rustup toolchain install nightly --component miri` and `cargo miri test` ([Miri README, "Running Miri on CI"](https://raw.githubusercontent.com/rust-lang/miri/master/README.md)); [MiniRust README](https://raw.githubusercontent.com/minirust/minirust/master/README.md) says the spec "is written as an interpreter".
- Good at: cheap, finds real UB in tests you already have [inferred]. Costs: checks only executed paths; Miri "does not catch every violation" and "has no access to most platform-specific APIs or FFI"; Windows is "supported less well" ([Miri README](https://raw.githubusercontent.com/rust-lang/miri/master/README.md), limitations and "Supported targets") [source].
- Bad fit: when you need all-input guarantees [inferred]. For this repo it is the cheap step for browser-core's unsafe blocks, but FFI calls are unsupported and the Windows-only blocks would need stubbing [inferred].

### B. Bounded model checking on MIR (Kani)
- Shape: cargo subcommand (`cargo kani`); you write `#[kani::proof]` harnesses with `kani::any()` inputs ([Kani README](https://raw.githubusercontent.com/model-checking/kani/main/README.md)). (The MIR-to-CBMC translation claim failed the source check and is removed.)
- Used by: model-checking/verify-rust-std exists and is active per its API; the cited page does not show it uses Kani (unverified).
- Good at: automatic, bit-precise UB checks in unsafe code, with a GitHub Action ([README](https://raw.githubusercontent.com/model-checking/kani/main/README.md)).
- Costs: README states "Linux or Mac"; concurrency is "out of scope" and compiled as sequential ([rust-feature-support, Concurrency](https://raw.githubusercontent.com/model-checking/kani/main/docs/src/rust-feature-support.md)); with no formal Rust semantics, results hold "subject to the proviso" the program has no UB ([undefined-behaviour](https://raw.githubusercontent.com/model-checking/kani/main/docs/src/undefined-behaviour.md)) [source].
- Bad fit: Windows CI (README says Linux/Mac) [source]; async code such as tokio [inferred].

### C. Extract MIR, prove in a proof assistant (Charon+Aeneas, lean-miri, Anneal)
- Shape: a rustc driver dumps MIR as JSON; the prover consumes it. Charon exports "types, functions and traits ... and the simplified MIR bodies" ([Charon README](https://raw.githubusercontent.com/AeneasVerif/charon/main/README.md)); Aeneas translates MIR to a pure lambda calculus with F*, Coq, HOL4 and Lean backends ([Aeneas README](https://raw.githubusercontent.com/AeneasVerif/aeneas/main/README.md)). lean-miri keeps an operational interpreter and generates weakest-precondition VCs ([README, VC sections](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/README.md)).
- Used by: Google's Anneal vendors lean-miri under `anneal/vendor/lean-miri` ([zerocopy #4009](https://api.github.com/repos/google/zerocopy/issues/4009)).
- Good at: all-input proofs checked by the Lean kernel [inferred from the Lean-kernel mentions in lean-miri docs/development.md].
- Costs: you write specs and proofs. Charon is "beta software" with "a number of open bugs" ([Charon README, Limitations](https://raw.githubusercontent.com/AeneasVerif/charon/main/README.md)); Anneal is alpha and verifies only "a small, pointer-free scalar subset" ([Anneal README](https://raw.githubusercontent.com/google/zerocopy/main/anneal/README.md)) [source].
- Bad fit: dependency-heavy async/network crates like web-mcp [inferred: the exporter needs compatible MIR for the whole dependency closure, see below].

### D. Source-level deductive verifiers (Verus, Creusot)
- Shape: annotate Rust with specs; an SMT solver (Verus) or Why3 (Creusot) discharges them. Creusot translates to Coma/Why3 and models mutable borrows as prophecies ([ARCHITECTURE.md](https://raw.githubusercontent.com/creusot-rs/creusot/master/ARCHITECTURE.md)). Verus supports "a subset of Rust" and ships Windows x86_64 binaries ([README](https://raw.githubusercontent.com/verus-lang/verus/main/README.md), [INSTALL.md](https://raw.githubusercontent.com/verus-lang/verus/main/INSTALL.md)).
- Good at: proving correctness of small core modules [inferred]. Costs: annotations in your source; Creusot targets "(safe) Rust" ([ARCHITECTURE.md](https://raw.githubusercontent.com/creusot-rs/creusot/master/ARCHITECTURE.md)) [source].
- Bad fit: unchanged third-party-crate-heavy code, and UB proofs about raw FFI under Creusot [inferred].

Not comparable: a-mir-formality is a model of MIR and the type/trait system, not a checker you run on your code (repo description, GitHub API).

## lean-miri adoption constraints
- Platform: "main execution and reference checks require Linux x86_64, Python 3, bash, flock, a C compiler and Rustup/Cargo" ([docs/development.md, Rust toolchain](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/docs/development.md)) [source]. A Windows host is not supported [inferred]; STATUS lists Windows facilities as remaining work.
- Pins: Lean `v4.35.0`, a specific Miri commit and rustc commit; a MIR-enabled std must be generated; schema 16 exports, older ones need re-export; heavy checks "about 15 GB" (same page) [source].
- Exporter: missing MIR "stops export", so "dependencies and std must contain compatible MIR"; generic roots contribute declarations only ([exporter/README.md, Roots](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/exporter/README.md)) [source].
- Status: "import and proof APIs are experimental"; the runner can exit 0 when the guest did not complete ([README, Usage](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/README.md)). STATUS: "Overall completion and the ability to verify arbitrary Rust are not claimed"; rustc MIR transformation and const evaluation "remain trusted" ([STATUS.md](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/STATUS.md)) [source]. STATUS says coroutine coverage "remained unsupported" and lists Windows/peripheral OS facilities outside the current acceptance scope [source]; whether async code works is not stated [inferred: unlikely, since async fns lower to coroutines].

## Pitfalls
- API churn: Anneal carried a local patch because lean-miri lemmas were `private` ([zerocopy #4009](https://api.github.com/repos/google/zerocopy/issues/4009)); lean-miri itself carries a Tree Borrows workaround for Miri issue 5543 ([lean-miri #89](https://api.github.com/repos/proofs-rs/lean-miri/issues/89)) [source].
- Trusted base includes exporter and rustc (STATUS); Anneal notes rustc, `build.rs` and proc-macros "execute outside the Lean sandbox" ([Anneal README](https://raw.githubusercontent.com/google/zerocopy/main/anneal/README.md)) [source].
- Fit for this repo [inferred]: only browser-core's few unsafe FFI blocks merit proof; web-mcp and ado-mcp are async and dependency-heavy, and the toolchain is Linux-only against a Windows+Linux build. Cheapest step is Miri on pure-logic tests; Kani next if Linux-only CI is acceptable.

## Tool facts (lean-miri)
- What it is: "A lean4 port of miri"; Rust to exported MIR JSON to a Lean interpreter that defines semantics for safety proofs, with experimental VC generation [[repo API](https://api.github.com/repos/proofs-rs/lean-miri), [README](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/README.md)].
- Licence: MIT and Apache-2.0 (`LICENSE-MIT` and `LICENSE-APACHE` at repo root) [[contents API](https://api.github.com/repos/proofs-rs/lean-miri/contents)]; the license API reports only LICENSE-APACHE. Vendored material is attributed in THIRD_PARTY.md.
- Latest release: none; `/releases/latest` returned 404 and `/tags` is empty [[releases API](https://api.github.com/repos/proofs-rs/lean-miri/releases/latest), [tags API](https://api.github.com/repos/proofs-rs/lean-miri/tags)]. Repo created 2026-10-25, 22 stars.
- Recent activity: last commit 2026-11-25, merge of PR #94 "Simplify MIR and Tree Borrows weakest preconditions over initial states"; PRs #88 and #91 to #94 closed, #89 and #90 open; 4 open issues and PRs [[commits API](https://api.github.com/repos/proofs-rs/lean-miri/commits?per_page=5), [issues API](https://api.github.com/repos/proofs-rs/lean-miri/issues?state=all)].
- Needs: Linux x86_64, Python 3, bash, flock, C compiler, Rustup/Cargo, Elan with Lean v4.35.0, the pinned rustc build, network for first setup; keys or services: unknown (not stated) [[docs/development.md](https://raw.githubusercontent.com/proofs-rs/lean-miri/main/docs/development.md)].
- Security issues: project advisories none (`/security-advisories` returned `[]`) [[API](https://api.github.com/repos/proofs-rs/lean-miri/security-advisories)]. OSV: empty result for the queried name (Go ecosystem; not a published package) [[OSV query API](https://api.osv.dev/v1/query)].
- Outside mention: google/zerocopy's Anneal vendors it and tracks upstreaming patches [[zerocopy #4009](https://api.github.com/repos/google/zerocopy/issues/4009)]; not a blog post.
