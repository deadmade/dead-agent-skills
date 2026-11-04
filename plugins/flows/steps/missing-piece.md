Say which plugin provides it, then use the fallback:

| Missing                                  | Plugin                 | Fallback                                                               |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| a pack file (`<packs>/…`)                | flows                  | none: flows is broken, reinstall it                                    |
| `search`, `fetch`, papers                | web-mcp                | paper-lookup for papers, WebSearch/WebFetch for the rest               |
| a knowledge graph                        | graphify               | Explore agents                                                         |
| library docs                             | dead-skills (context7) | the library's docs via web-mcp `fetch` or WebFetch                     |
| a desktop ping                           | dead-skills            | nothing                                                                |
| security review                          | host security skill    | review the diff for exploitable vulnerabilities using the host adapter |
| `claude-md-improver`, `revise-claude-md` | claude-md-management   | read applicable AGENTS.md and CLAUDE.md against the code yourself      |
| a stack pack                             | its plugin             | go on without it                                                       |
