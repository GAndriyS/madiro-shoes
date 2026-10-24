# ui-verify — maintainer notes

## Design decisions

- **A skill, not an agent — for now.** Same reasoning as `spec-verify`: the
  main session holds the MCP tools and `AskUserQuestion`; the body's **Input
  contract** section is the seam for a future `ui-verifier` agent (wrap the
  contract, swap direct questions for `## Interview required`).
- **Severity by reference.** The CRITICAL/WARNING/SUGGESTION scale and the
  0.7 confidence floor live in `.claude/skills/mr-self-review/routing.md`
  and are cited, not copied — one place per fact, and ui-verify findings can
  feed the same fix loop without re-scoring.
- **Stage 0b (server preflight) is deliberately duplicated from
  `spec-verify`.** Each skill must stay self-contained for the later lift
  into separate agents; a cross-skill file reference breaks the moment one
  is renamed or vendored. If the protocol changes, change it in both.
- **Refusal without a Figma link is a feature.** A fidelity comparison
  without a live source of truth is an opinion; behaviour checks without a
  design belong to `/spec-verify`. A project whose `AGENTS.md → Harness
  profile → design-source` is `none` gets the same refusal on every call.

## Deliberate omissions

- **No automated pixel-diff tooling** — the comparison is per-property with
  measured values, not image subtraction; a pixel-diff would flag every
  anti-aliasing difference and drown the real findings.
- **No design-system sync** — this skill grades one frame against one route;
  token governance is the project's conventions skill (`AGENTS.md → Harness
  profile → conventions-skill`).
- **No repo-committed screenshots** — pairs live under
  `.git/ui-verify-shots/` (a browser MCP like `chrome-devtools` writes only
  within the workspace root, and `.git/` is inside the checkout but outside
  the tree); the run file carries the report and the paths. Same "never a
  per-branch file" rule as mr-self-review.
