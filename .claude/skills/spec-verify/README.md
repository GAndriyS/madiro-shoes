# spec-verify — maintainer notes

## Design decisions

- **A skill, not an agent — for now.** The main session holds the browser MCP
  tools and `AskUserQuestion`; an agent would need the two-pass handshake for
  every ambiguous route. The body's **Input contract** section is written as
  the exact seam for a future `spec-verifier` agent: wrap the contract, swap
  direct questions for an `## Interview required` block, keep everything else.
- **Verdict vocabulary** is disjoint from plan-verifier's on purpose
  (PASS/FAIL vs MET/NOT MET) except `UNVERIFIABLE`, shared so a spec-verify
  PASS greppably closes plan-verifier's runtime-UNVERIFIABLE rows.
- **Sessions are a script's job, not the agent's.** The session broker
  (`scripts/dev-session.mjs`, project-owned — each project writes the adapter
  for its own backend; `AGENTS.md → Harness profile → browser-qa` names it)
  reads `.env`, signs in through the API and writes the session into the QA
  browser over CDP; the agent sees `ok …` lines only. That keeps passwords
  out of transcripts and lets a run sign in and out without a human. The QA
  browser uses a dedicated debug port, never the default 9222, so a personal
  Chrome started with the default debug port never receives a session.
- **Live is the default, a stub is a per-row exception.** A run on the QA
  browser stubs only the response the stand cannot give (an error status, an
  emailed code, OAuth) and keeps everything after it on the real API; the
  verdict names the stub. Grading a whole flow on stubs proves the frontend
  against our own reading of the contract, which is exactly what the run
  exists to check against the backend.
- **Stage 0 (server preflight) is deliberately duplicated in `ui-verify`.**
  Each skill must stay self-contained for the later lift into separate
  agents; a cross-skill file reference breaks the moment one is renamed or
  vendored. If the protocol changes, change it in both.

## Deliberate omissions

- **No video capture** — screenshots plus the snapshot log carry the
  evidence; recordings would need tooling the framework doesn't ship.
- **No automated a11y audit** — only screen-observable a11y facts from the
  spec's NFR lines are graded; a Lighthouse/axe pass is a separate concern
  and would double the run time.
- **No design comparison** — visual fidelity is `/ui-verify`'s whole job.
- **No repo-committed artifacts** — screenshots live under
  `.git/spec-verify-shots/` (a browser MCP like `chrome-devtools` writes only
  within the workspace root, and `.git/` is inside the checkout but outside
  the tree); the run file
  (`harness/sdd/<slug>.md`) carries the report and the paths. Same "never a
  per-branch file" rule as mr-self-review.
