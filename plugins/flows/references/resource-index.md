# Flow resource index

All paths below are relative to the named package root. Find installed skill roots through the host adapter,
not assumptions about plugin caches. In a source checkout, resolve package roots through `plugins/catalog.json`
source entries. Native marketplace entries point at generated distributions.

| Package       | Resource                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| flows         | `skills/<conductor>/SKILL.md`, `agents/<reviewer>.md`, `packs/<pack>/skills/<skill>/SKILL.md`    |
| graphify      | `skills/graphify/SKILL.md` (a host without plugin dependencies bundles it; see the host adapter) |
| csharp-skills | `skills/<router>/SKILL.md`, with library files relative to that package root                     |
| rust-skills   | `skills/rust-best-practices/SKILL.md`                                                            |
| postgres      | `skills/<skill>/SKILL.md`                                                                        |
| hallmark      | `skills/hallmark/SKILL.md`                                                                       |

Use available MCP tools for Context7 and web research. Security and instruction-maintenance plugins
have equivalent review procedures in the host adapter and are not installation dependencies.
