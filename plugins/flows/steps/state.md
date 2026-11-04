- **Build flows** (`/build-feature`, `/implement`, `/fix`, `/upgrade`) and `/research-feature`, which researches
  and builds nothing, keep `docs/features/<slug>/flow.md`. Its frontmatter names the flow (`flow: feature | research | implement | fix |
upgrade`) and the `phase:`; a conductor only resumes its own flow. Update it after every phase, with links to every
  artifact. It is how the next session resumes. build-feature and research-feature have their own templates; the others
  use [build-template.md](build-template.md).
- **`now:`** (frontmatter, one plain sentence) says where the run stands and what comes next. Rewrite it after every
  phase and at every stop where you wait for the user; at such a stop it starts with `Waiting for you`, which is what
  the flow cockpit reads as the run's status. A conductor called inline writes into its caller's `now:`.
- A flow.md started before the **Tasks** and **Rulings** sections, the **Run verdict** line or `now:` existed gets
  them added when it is resumed; none is required of it.
- The user reads specs, plans and flow.md in the flow cockpit, which draws Mermaid: use a diagram where it explains
  something better than prose; never required.
