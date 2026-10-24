---
name: ui-verify
description: >-
  /ui-verify figma-link [--routes ...] [--breakpoints ...] [--spec spec-path]
  — visual-fidelity review: opens the running app through the browser MCP
  named in AGENTS.md → Harness profile → browser-qa and the referenced Figma
  frame via the Figma MCP (requires prior /mcp authentication), compares the
  implementation against the design element by element — spacing,
  typography, colors, radii, hover/focus/disabled/empty states, responsive
  breakpoints, design-token vs hardcoded values — and reports each
  discrepancy on the mr-self-review severity scale
  (CRITICAL/WARNING/SUGGESTION, 0.7 confidence floor) with side-by-side
  screenshots. /implement runs it in stage 3c when the spec carries a design
  link. Use when the user says "звір з фігмою", "перевір верстку по
  дизайну", "compare with Figma", "pixel-check the UI", or invokes
  /ui-verify. Not for whether the feature behaves correctly — that is
  /spec-verify; with no Figma link, or design-source none, it refuses and
  routes there.
metadata:
  version: 1.0.0
  tags: ui, figma, design, fidelity, visual-review, browser-mcp, command
---

# UI verify — the design open on the second monitor

Play a design reviewer with the Figma file open next to the running app:
walk the implemented screens element by element against the frame and report
every place they disagree — measured, not eyeballed. The deterministic gates
cannot see a rendered pixel; `/spec-verify` checks that the feature *works*;
this skill checks that it *looks the way the design says*.

The boundary sentence, mirrored from the sibling: **does it LOOK right** is
answered here; **does it WORK** is `/spec-verify`. A broken filter found
while comparing paddings is handed to `/spec-verify`'s lane (or `### Noticed
in passing` there), not graded here.

**When `AGENTS.md → Harness profile → design-source` is `none`**, there is no
design to compare against: refuse and route to `/spec-verify`, exactly as
with a missing link. The same holds when `browser-qa` is `none` — there is no
app to open; `/implement` records the skip of stage 3c.

Two MCP surfaces do the work: a Figma server for the design
(`get_screenshot`, `get_metadata`, `get_variable_defs` — any server exposing
those tools qualifies, a hosted connector or a `.mcp.json` entry; keep one,
because a second, unauthenticated `figma` entry can mask the working one)
and the browser MCP from `browser-qa` for the implementation, written below
in the `chrome-devtools` verbs (`navigate_page`, `take_screenshot`,
`evaluate_script`, …); another browser MCP substitutes its equivalents.

## Arguments

```
/ui-verify figma-link [--routes ...] [--breakpoints ...] [--spec spec-path]
```

| Argument | Meaning |
|---|---|
| `figma-link` | A Figma frame/node URL. Mandatory — with no link this skill refuses and routes to `/spec-verify`; that refusal is a feature, because a comparison without a source of truth is an opinion |
| `--routes` | The app route(s) that render the frame. If neither the link context nor the spec names them, ask the user — one question, up front |
| `--breakpoints` | Default: derived from the widths of the Figma frames the link resolves to; when the design carries a single width, `1440` plus `375` |
| `--spec` | Optional `harness/specs/SPEC-<ISSUE>-*.md`. Its **Design review** section marks *known* gaps — states the design does not cover, accepted deviations — which are then listed as design gaps, never filed as findings |

## Input contract

What the invoker must supply — everything else this skill finds itself:

- the Figma frame/node link;
- routes, when neither Figma nor the spec names them;
- the spec path, when one exists (for the Design review section);
- a run slug for screenshot naming, when invoked from `/implement`;
- the report language (defaults to the language of the request).

A future `ui-verifier` agent wraps exactly this contract; where this skill
asks the user directly, the agent version returns an `## Interview required`
block instead — the two-pass handshake per `.claude/agents/README.md`.

## Stage 0a — preconditions

Probe **every** Figma-capable server in the session first — list the tools,
then a cheap `whoami` or `get_metadata` on the node through each one. One
answering server is enough; the skill uses that one and names it in the
report.

- No server answers (401 or an auth error on all of them) → **stop** with:
  "Figma MCP is not authenticated. Run /mcp in an interactive session,
  authenticate figma, then re-invoke." — and quote each probe's error
  verbatim under it, because the caller (`/implement` stage 3c) copies that
  line into the run file and `plan-verifier` grades from it. A skip recorded
  without probing every server can be false — an unauthenticated duplicate
  refuses while the working connector goes untried — and the row then
  reaches the verifier as `UNVERIFIABLE` and the pass is redone. Never
  degrade to comparing from memory or from a screenshot pasted earlier in
  the chat — a fidelity verdict is only worth having when the reference is
  the live design.
- **A server answers but its plan runs out** (a "tool call limit" refusal on
  a metered plan after the first call) → do not stop and do not grade from
  the geometry you already have: open the file in the Figma web app in the
  desktop Browser pane and ask the human to sign in there through
  `https://www.figma.com/login` — a third-party "Continue with …" pop-up
  does not reach the pane's cookies. Signed in, the page exposes the plugin API: read with
  `javascript_tool`, read-only — `figma.getNodeByIdAsync`,
  `node.getStyledTextSegments([...])`, `figma.getStyleByIdAsync` — every
  state × breakpoint in a few calls. Anonymous, `figma` is `undefined` and
  Inspect is closed; check `typeof window.figma` before reading. Name the
  surface in the report header. A geometry-only pass followed by a separate
  typography pass doubles the gates, the sign-in hand-offs and the
  `plan-verifier` rounds.
- **Spend the first Figma calls on typography and colours, not geometry.**
  On a metered plan the first call may be the only one; geometry can be
  measured against the app later, a type style or a hex cannot be guessed.
- The link resolves to a whole file rather than a frame/node → ask for the
  frame; a file-level comparison would grade everything against nothing in
  particular.

## Stage 0b — preflight

Same server protocol as `/spec-verify`, duplicated on purpose so each skill
stays self-contained for the later agent lift:

0. With a session broker in `browser-qa`: `node scripts/dev-session.mjs
   start` — the QA browser the browser MCP attaches to; a frame behind
   sign-in gets `dev-session.mjs login --app <slice> --as <role>` before its
   route (`/spec-verify` § Sessions on the dev stand). A role with no QA
   account → that frame is "not comparable — BLOCKED (no QA account:
   <role>)"; session broker `none` → frames behind sign-in are "not
   comparable — BLOCKED (no session broker)".
1. `curl -sf <base-url>` (the slice's URL from `browser-qa`) — down → start
   the slice's dev-server command from `browser-qa` in the background, poll
   until the first compile finishes.
2. Compile failure → **ABORT** with the build error verbatim — there is
   nothing to compare.
3. The port serving another slice's app → stop and ask which server wins.
4. Probe navigation + `list_network_requests` → the `Data:` header line
   (proxy target, failing API calls).

## Stage 1 — read the design

**The spec's `### Design values` table comes first.** When `--spec` names a
spec that carries one, it *is* the reference: its rows are the property
checklist below, and Figma is read only to fill rows marked `—` / "not read",
to cover a state the table lacks, and to spot-check one row per frame for
drift since the table's read date (a drifted row is a finding against the
spec, reported next to the app finding). No table and a frame link → read the
frames with [references/figma-read.md](references/figma-read.md) — one
script over all frames, typography and colours included — before anything
else.

From the Figma node, build the reference before looking at the app:

- `get_screenshot` of the frame (and of each breakpoint variant frame);
- `get_metadata` for geometry — sizes, paddings, gaps;
- when `get_metadata` / `get_design_context` fail with "Failed to parse SSE
  message … EOF while parsing a string" (≈ 20 000 characters — any
  section- or board-sized node), do not retry them: list the board's child
  frames, then read each frame's geometry with a **read-only** `use_figma`
  script returning only `name, type, x, y, w, h, fontSize, fills, strokes,
  cornerRadius, itemSpacing` — exact values, small output; a retry of the
  failing call only burns quota;
- `get_variable_defs` for tokens — colors, type styles, radii as *named*
  values, so a hardcoded hex in the app is distinguishable from a token.

Turn it into a property checklist per element group: spacing/gaps, type scale
(family, size, weight, line-height), colors as tokens, radii, the state
variants the design defines (hover/focus/disabled/empty), and the
per-breakpoint frames. The checklist is the contract for Stage 3 — what the
design does not define cannot become a finding.

## Stage 2 — capture the implementation

- `navigate_page` to the route; `resize_page` to each Figma frame width;
  `take_screenshot` per breakpoint.
- `take_snapshot` for text content — copy is part of fidelity.
- Where the eye is not enough, measure: `evaluate_script` with
  `getComputedStyle` for exact px/hex/line-height values. A discrepancy row
  quotes measured values, not impressions — "gap 16px, design says 24px",
  never "feels tighter".
- Drive the states the design defines: hover the button, focus the input,
  empty the list. A state the design draws and the app lacks is a finding;
  a state the app has and the design never drew is a design gap.

Screenshot pairs go to
`.git/ui-verify-shots/<slug>/<route>-figma.png` /
`<route>-actual-<width>.png` — inside the checkout but outside the tree,
because a browser MCP like `chrome-devtools` can only write within the
workspace root and the working tree gets no per-branch artifacts; the report
names absolute paths for MR/PR attachment.

## Stage 3 — compare and classify

One row per disagreement: element, property, design value, measured value.
Severity comes from the scale in
`.claude/skills/mr-self-review/routing.md` — by reference, not copied here,
so there is one place per fact:

- **CRITICAL** only with a stated production consequence (the layout
  collapse hides the CTA; the disabled state is indistinguishable from
  enabled). A fidelity deviation without a consequence is not critical.
- **WARNING** — the default for measured deviations from the design, and for
  a hardcoded value where a token exists (cite the conventions skill,
  `AGENTS.md → Harness profile → conventions-skill`).
- **SUGGESTION** — taste, or deviations arguably improving on the frame.
- Findings below the 0.7 confidence floor are dropped before the table and
  counted in the verdict line.

Sections that render from API data while the stand is degraded are listed as
"not comparable — no data" — the BLOCKED analogue — and never counted as
discrepancies. Deviations the spec's Design review section already accepted
are listed under design gaps, not re-litigated.

## Stage 4 — report

Printed in chat; inside an `/implement` run also appended verbatim to
`harness/sdd/<slug>.md` under `## Reports`.

```markdown
## UI fidelity — <route> vs Figma <node id>
Figma: <link> · App: <base-url><route> · Breakpoints: 1440, 375
Data: <live | sections not comparable — no data: <list>>

| # | Element | Property | Figma | Actual | Severity | Conf |
|---|---|---|---|---|---|---|
| 1 | H1 "Items" | font-size | 32px | 28px | WARNING | 0.9 |
| 2 | card grid | gap | 24px | 16px | WARNING | 0.85 |
| 3 | primary button | hover state | fill -8% | missing | WARNING | 0.8 |

Verdict: 3 discrepancies (0 CRITICAL · 3 WARNING · 0 SUGGESTION) · dropped below 0.7: 1
Matches: <what is faithful — a clean run must be affirmative, not silent>
Design gaps (not findings): <states/breakpoints the design does not cover>

### Screenshots
<absolute .git/ui-verify-shots/ paths — figma/actual pairs, one pair per line>
```

The `Matches:` line is mandatory: a report that only lists deviations cannot
be told apart from a run that never looked at the faithful parts.

## What this skill must not do

- **Edit code or styles.** The report feeds the fix loop; a reviewer who
  patches while reviewing grades their own work.
- **Test behaviour.** Clicking through flows to see if they work is
  `/spec-verify` — this skill drives states only to photograph them.
- **Re-litigate accepted deviations.** What the spec's Design review already
  waved through is a design gap line, not a finding — otherwise every run
  re-argues settled decisions.
- **File findings on states the design does not cover.** Those go to the
  `Design gaps` line — they feed the spec and the designer back; they do not
  fail the implementation, which cannot be unfaithful to a frame that does
  not exist.
- **Write any file into the working tree.** Screenshots live under
  `.git/ui-verify-shots/`, the report in chat and the run file — the same
  "never a per-branch file" rule as mr-self-review.
