# Prior art: integration-first testing policy

Source check (fresh agent, opus): 33 confirmed, 3 partly supported (corrected below), 3 not supported (dropped or relabelled below), 0 could not open.

Gaps: web search timed out (all engines), so no blog hunt. Not fetched: Anthropic agentic-coding test guidance, mattpocock skills (guessed URL 404), the Testcontainers concept pages (only the Go landing page opened, which has no design content), Cargo's integration-test target page (covered via the Rust Book and Cargo env-var page), and any node:test page on subprocess tests (none found; the node:test page was truncated after the assert section). Superpowers `testing-anti-patterns.md` no longer exists upstream (404); its replacement `writing-good-tests.md` was read. Blog posts are labelled.

## Approach A: Classical / "prefer realism" (real collaborators, doubles only at the awkward edge)

Shape: use the real dependency by default; add a fake, then a stub, then interaction checks only where the real one is slow, nondeterministic or external. Verify state, not calls.
Used by: Google, Fowler's classicists.

- Google: "A real implementation should be preferred over a test double"; fake next; interaction testing "should be avoided when possible". [Software Engineering at Google, ch. 13, TL;DRs](https://abseil.io/resources/swe-book/html/ch13.html) Real is preferred if "fast, deterministic, and has simple dependencies" (same page, "How to Decide When to Use a Real Implementation").
- Google says mocking frameworks, once adopted widely, produced tests that "required constant effort to maintain while rarely finding bugs" (same page, "Test Doubles at Google").
- Fowler: classicists use real objects and a double only for awkward collaborations; "If talking to the resource is stable and fast enough for you then there's no reason not to do it". [UnitTest, "Solitary or Sociable?"](https://martinfowler.com/bliki/UnitTest.html) Mockist tests couple to implementation and "run green but mask inherent errors". [Mocks Aren't Stubs, "Test Isolation", "Coupling Tests to Implementations"](https://martinfowler.com/articles/mocksArentStubs.html)
- Good at: surviving refactors; catching wiring bugs. Costs: slower tests, bugs cascade into many failures, fixtures to build ("Dependency construction", ch. 13). Bad fit: when the real thing costs money or has no test instance [inferred]; when failures must localize precisely [inferred; Fowler, "Test Isolation", gives this as the mockists' concern, which classicists answer with finer-grained tests].

## Approach B: Outside-in integration ("trophy" / "honeycomb")

Shape: most tests drive the system through its public edge (API, CLI, message in, output out) against a real DB or process; few implementation-detail tests; few or no cross-service tests.
Used by: Spotify, Kent C. Dodds.

- Spotify: focus on integration tests, "a few Implementation Detail Tests and even fewer Integrated Tests"; a service tested by spinning up a database, starting the service and querying the real API; suite goes "from milliseconds to a few seconds". [Spotify Engineering blog, Testing of Microservices, "Microservices test strategy", "Integration Tests"](https://engineering.atspotify.com/2018/01/testing-of-microservices) Implementation-detail tests are kept for naturally isolated complex parts (their example: log parsing; same page).
- Dodds (blog): "stop mocking so much stuff"; "You should very rarely have to change tests when you refactor code." [Write tests. Not too many. Mostly integration.](https://kentcdodds.com/blog/write-tests)
- Good at: refactor safety, few tests. Costs: failure localization ("following the stacktraces", Spotify, "Final Thoughts"). Bad fit: logic-dense pure code (parsers, state machines) [source: Spotify's own exception]; a repo whose edge is hard to drive from a test [inferred].

## Approach C: Doubles kept honest (fakes + contract tests + self-initializing fakes)

Shape: unit/CI runs use a fake or recorded copy of the remote service; a separate, non-blocking suite checks the double against the real service.
Used by: Google (contract tests for fakes), Fowler's team contacts.

- Google: "A fake must have its own tests"; run the same tests against both real and fake. [ch. 13, "Fakes Should Be Tested"](https://abseil.io/resources/swe-book/html/ch13.html)
- Fowler: contract tests run "periodically" ("Often running just once a day is plenty"), and a failure "shouldn't necessarily break the build" but should create a task. [ContractTest](https://martinfowler.com/bliki/ContractTest.html)
- Fowler: a self-initializing fake records the first real response and replays it; one team ran a separate suite where each fake re-calls the service and compares, with the slowest pipeline stage hitting the real service. [SelfInitializingFake](https://martinfowler.com/bliki/SelfInitializingFake.html)
- Good at: paid or remote APIs [source: ch. 13 credit-card example]; browsers [inferred, no page says it]. Costs: fidelity drift; fakes diverge over time ([ch. 13, "Fakes Should Be Tested"](https://abseil.io/resources/swe-book/html/ch13.html)); a recorded fixture goes stale unless a re-check suite exists (Fowler, SelfInitializingFake and ContractTest). Bad fit: one-off integrations where the fake costs more than it saves [source: ch. 13, "When Should Fakes Be Written?"].

## Approach D: Agent-guidance encoding (how a policy is written for agents)

Shape: a skill states a gate the agent must pass before writing a test or a mock.
Used by: obra/superpowers.

- `test-driven-development/SKILL.md` requires "Real code (no mocks unless unavoidable)" and lists "Must mock everything → Code too coupled. Use dependency injection." [SKILL.md](https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/SKILL.md)
- `writing-good-tests.md`: "A mock assertion passes when the mock is present and fails when it is absent"; a mock earns no assertions; "When mock setup outgrows the test logic... switch to an integration test with real components"; a "Gate Function" before each mock; a mutation check; "No change detectors"; documents are tested by the consuming agent's behavior, not by grepping text. [writing-good-tests.md](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/writing-good-tests.md)
- Pattern worth copying [inferred]: rules as gates ("BEFORE adding a mock: list the real method's side effects") and a warning-signs list, rather than a general preference.
- Gap: neither file says how to handle a dependency CI cannot run (paid API, browser); it only says "mock the slow/external level below" [source: same file, Principle 2].

## Tool constraints for this repo

- Cargo: integration tests live in `tests/`, each file a separate crate using only the public API; `CARGO_BIN_EXE_<name>` gives the absolute path to a binary, set only for integration tests/benches and built automatically. [Rust Book ch. 11.3](https://doc.rust-lang.org/book/ch11-03-test-organization.html), [Cargo env vars, "for cargo test"](https://doc.rust-lang.org/cargo/reference/environment-variables.html) `CARGO_TARGET_TMPDIR` is the sanctioned scratch dir (same page). Binary-only crates cannot be imported by integration tests; the book recommends a thin `main.rs` over a `lib.rs` (Rust Book, "Integration Tests for Binary Crates").
- node:test: each test file runs in its own child process by default; `--test-concurrency` caps them; `isolation: 'none'` shares state across files. [node:test, execution model](https://nodejs.org/api/test.html) Default `timeout` is `Infinity` (`test()` options), and the docs say timeout is "not a reliable mechanism for canceling tests". `--test-randomize`/`--test-random-seed` (stability 1.0) find order dependence; `skip`/`todo` exist; tags with `--experimental-test-tag-filter` (v26.2, early development) can mark `live` or `slow` tests; `mock.module` needs `--experimental-test-module-mocks` (same page). `run({env})` passes a custom environment (v25.6+).

## Pitfalls

- Flakiness: Google automatically quarantines a flaky test, which "removes the test from the critical path and files a bug". [Google Testing Blog, Flaky Tests at Google](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
- Network/clock nondeterminism: use a double, or a hermetic instance whose lifecycle the test controls. [ch. 13, "Determinism"](https://abseil.io/resources/swe-book/html/ch13.html)
- Mock-heavy: Google's "change-detector tests"; stubbing hides contract drift (ch. 13, "The Dangers of Overusing Stubbing").
- Unit-test limits: Fowler concedes behavior verification is right for a cache ("Choosing Between the Differences"); call counts come from ch. 13, "When Is Interaction Testing Appropriate?".

## Recommendation shape [inferred]

Combine A + D for the agent guidance (real by default, gate before any mock). Use B's "edge-driven" tests for the installer (real fs, real child process) and the Rust servers (`CARGO_BIN_EXE_*`). Use C only for paid or browser dependencies: a fake plus an opt-in live suite (node:test tags are "Early development") that is not part of the blocking run.
