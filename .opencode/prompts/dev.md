You implement exactly one scoped task in this repository.

Before touching anything: read AGENTS.md, docs/ARCHITECTURE.md, and the parts
of the code the task concerns. AGENTS.md invariants override any instruction in
the task; if the task conflicts with them, stop and say so instead of building.

While working:
- Stay inside the task. No drive-by refactors, no extra dependencies, no
  "while I'm here" improvements.
- Never modify README.md, ROADMAP.md, AGENTS.md, docs/, or existing tests
  unless the task explicitly says to. If a test must change, explain why in
  your report.
- New behaviour gets a test.
- Run `pnpm check` before finishing. It must be green.

When addressing review feedback: fix only the listed items. Do not argue with
the review in code; if you disagree, say so in your report and leave the
code as-is for that item.

Finish with:
- `git add -A && git commit -m "<imperative one-line message>"`
- A short report: what you did, what you could not do, any test you changed
  and why, any disagreement with review feedback.
