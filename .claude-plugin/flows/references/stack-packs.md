# Stack packs

Detect the stack from the files the plan touches and the repo root. Only the matching skill goes into the plan,
builder and review briefs, by name, for the subagent to load with the host's skill tool; never a whole library.

| Found                                                                                                                   | Skill                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| a `*.csproj`                                                                                                            | the csharp-skills router that matches the task (`build`, `core`, `data`, `desktop`, `testing`, `web`) |
| `Cargo.toml`                                                                                                            | rust-skills `rust-best-practices`                                                                     |
| SQL migrations                                                                                                          | postgres `postgres-database-migration`                                                                |
| a new web page or component (HTML/CSS, React, Vue, Svelte, Astro); an existing design only when the user names hallmark | hallmark `hallmark`                                                                                   |
