---
name: implement
description: >-
  /implement path-to-plan [--max-review-loops N] [--from plan|implement|find|browser|verify|docs|mr]
  — executes an approved Implementation Plan end to end from one command.
  Drives implementer → (/code-review ∥ /security-review) → the fix loop →
  browser verify on UI diffs (/spec-verify + /ui-verify, when the project
  has browser QA) → plan-verifier → docs → the MR/PR draft, stops at the
  human gates (wave split, accepted warnings, deviations, MR/PR), and
  records stage state + agent token cost in harness/sdd/slug.md (plus a
  slug-brief.md every delegation reads as its Step 1) so a later chat can
  resume with --from. Spec and plan are NOT part of it — run spec-creator
  and implementation-planner by hand first; this starts once the plan
  exists in harness/plans/. Use when the user invokes /implement, says
  "implement the plan", "імплементуй план", or wants to continue an
  implementation run. Not a subagent — the main session executes it.
metadata:
  version: 1.0.0
  tags: sdd, implement, workflow, orchestration, subagents, plan, command
---

# /implement — run an approved plan

You (the main session) are the orchestrator. Every agent runs in its own
context, returns a report and cannot call the next one — `Agent` is in no
subagent's `tools` list, deliberately (`.claude/agents/README.md`). This skill
is the order, the gates and the delegation prompts.

Project facts this skill needs come from `AGENTS.md → Harness profile`
(`base-branch`, `conventions-skill`, `vcs-cli`, `review-template`,
`review-unit`, `browser-qa`, `design-source`, `i18n`, `ui-paths`) and
`AGENTS.md → Commands` (install, scoped test, lint, formatter). Slice names
come from `harness/config.json` (`node scripts/verify.mjs --list`). Below,
"MR/PR" means the project's `review-unit`.

**Before this command:** the spec (`spec-creator`, approved by hand) and the
plan (`implementation-planner`, approved by hand) already exist — both are run
manually, on purpose, so a human reads each before anything is built. This
command starts at the plan. A small, reversible change does not earn this
pipeline — implement it directly; `/implement` is for work that already
earned a spec and a plan.

**A direct `implementer` delegation is stage 2 by another name.** When the
human points `implementer` at a plan with two or more waves instead of typing
`/implement`, open the brief and the run file **before the first spawn**,
write each stage row the moment its result arrives, and commit per wave —
exactly as below. Without them a context compaction loses the early waves'
metrics because no run file exists yet, stage 2 lands as one large commit
that stage 3 cannot split by wave, and the human is stopped again and again
to ask what is left.

## Arguments

```
/implement <plan path> [--max-review-loops <n>=3] [--from plan|implement|find|browser|verify|docs|mr] [--slug <name>]
```

| Argument | Meaning |
|---|---|
| `<plan path>` | `harness/plans/<slug>.md`. Required — `implementer` and `plan-verifier` refuse to guess a plan. If omitted and exactly one plan exists, take it and say so; otherwise list and stop |
| `--max-review-loops` | Cap on the review fix loop (stage 3b). Default 3 |
| `--from` | Resume at a stage; reads `harness/sdd/<slug>.md` for the earlier stages' reports |
| `--slug` | Overrides the run slug (default: the plan file's slug) |

## Stage 1 — read the plan before anyone runs

Nothing is delegated until the plan has been turned into an **execution
brief** — the tasks, their DAG, who owns which paths, and the mode. This is
the step that decides whether one `implementer` runs or several, and in what
order; skipping it is how two lanes edit the same file. Parallel code-writing
agents fail through conflicting implicit assumptions, not just merge
conflicts — the lanes, the shared brief and the serialised integration step
exist to close that class of failure.

**Install once, before the first parallel wave.** Probe the worktree's
installed dependencies; when they are missing, run the project's install
command (`AGENTS.md → Commands`) yourself before any lane starts. A lane that
runs the install on its own rewrites the dependency tree under its sibling,
whose gate then goes red on module-resolution errors that are not its own.

**Probe the agent symlinks once, before the first delegation** — in a
layout where `.claude/agents` and `.claude/skills/<name>` are symlinks to
canonical copies. `file .claude/agents` must say `directory`. When it is a
small text file (a Windows checkout with `core.symlinks=false`), no project
agent or skill is registered: say so in the brief's Notes, delegate each role
as `general-purpose` with "read the canonical `<name>.md` agent definition
(the path the symlink file names) and follow it" plus an explicit `model`,
and point the human at the project's symlink setup note (`AGENTS.md →
Conventions`). Unnoticed, every agent runs this way with every tool, the
role's `tools` allowlist held only by its prompt.

**Design values exist before code is written** (skipped when `AGENTS.md →
Harness profile → design-source` is `none`). A plan with UI steps whose
spec carries a design frame link but no `### Design values` table (or one
marked "not read" for a reason that no longer holds) gets the table now:
read the frames with `.claude/skills/ui-verify/references/figma-read.md`,
put the table in the brief under **Binding rules**, and tell the human in the
split gate — rows that contradict a shared component or the theme are a gate
question there (fix here · separate ticket · accept), not a 3c surprise. A UI
step's delegation then carries: "Build to the Design values rows in the
brief; they are fixed — write them as literal values, not as steps of the
theme's scale." Values read only at 3c turn into fix passes for numbers that
were readable before the code was written.

**Probe the browser MCP once, before the first delegation, when stage 3c
will run** (a UI-touching plan, or a spec with a design link; never when
`AGENTS.md → Harness profile → browser-qa` is `none`): start the browser
the profile's session broker launches, then the browser MCP's own page list
must show the tab that browser's debug endpoint lists. An MCP server's args
are read once, at session start — a session opened before the MCP config
gained its attach argument keeps an MCP that drives its own browser (its
page list shows only `about:blank`), and the desktop `/mcp` dialog offers no
reconnect. Restart the session now, before stage 2, not at 3c, where the
only remedy is a long pause and a `--from browser` resume in a new session.

**A `main session` browser-capture row signs in through the broker.** When a
plan row (a gate step, a live-contract probe) needs a session, take it with
the session broker named in `browser-qa` in the QA browser (`/spec-verify`
§ Sessions on the dev stand) — no human. Only when the role has no QA account and the human
must act: install the recorder *before* the message that asks them to act —
never announce the login ahead of the capture: a human who logs in on an
earlier cue produces a response nobody records, and the step needs a second
login.

Read the whole plan file with `Read`, then extract:

1. **Header** — `**Mode:**` (multi-agent | single-agent), `**Spec:**` and its
   status, `**Slices:**`, `**Supersedes:**`, and `**Scope:**` when present
   (a delta plan: the `AC-N` ids it owns and the earlier plan it extends —
   stage 4 hands the verifier that earlier run's report path). A spec still
   `draft` → one `AskUserQuestion`: build on a draft, or stop and approve it
   first.
2. **Tasks** — every row of the **Steps** table: `#`, Change, Files / seams,
   Slice, Satisfies, Executor, Skills, Verification, and **Depends on**. Keep
   only rows whose Executor is `implementer` (or `single pass`) for the run;
   rows for `main session` are listed as *not this run*.
3. **DAG** — from **Depends on**. When the column is absent, infer edges and
   **say so**: two steps that name the same file are ordered as the table
   orders them; a route precedes the page that links to it; a shared component
   precedes its consumers. An inferred DAG is confirmed at the gate below,
   never silently acted on.
4. **Owned paths** — from the plan's **Ownership** table when the **Execution**
   section has one; otherwise from each step's Files / seams. Two steps that
   would run in parallel and touch one path collapse into one lane. Every path
   belongs to exactly one lane; a path no step names but the work will
   obviously touch (the text catalogue in `AGENTS.md → Harness profile →
   i18n` for a step that adds visible text) is flagged as an ownership gap.
5. **Waves** — topological order over the DAG: wave 1 = steps with no
   dependencies, wave *n* = steps whose dependencies are all in earlier waves.
   Steps in one wave with disjoint owned paths run in parallel; steps sharing
   a path serialise into one lane. Single-agent mode is one wave of one lane —
   the DAG still fixes the order you take the steps in.

Print the brief (this is also the first block of the run file):

```markdown
## Execution brief — <slug>
Mode: multi-agent · Spec: <path> (approved) · Slices: web, api · Steps this run: 5 of 6 (row 6: main session)
DAG: stated in plan | inferred (see notes)

| Wave | Lane | Steps | Owns (paths) | Depends on | Slice(s) | Verification |
|---|---|---|---|---|---|---|
| 1 | A | 1, 2 | <web path>/features/x/**, i18n keys x.* | — | web | verify.mjs --slice web |
| 2 | B | 3 | <api path>/features/y/** | 1 | api | verify.mjs --slice api |
| 3 | — | 4 (integration) | — | 2, 3 | web + api | verify.mjs --slice web --slice api |

Notes: <inferred edges · ownership gaps · rows not this run · anything in Open questions the executor inherits>
```

### The handoff brief — `harness/sdd/<slug>-brief.md`

Write it in this stage, commit it with the run file, and append to it only
where a section says so (known failures at stage 2, amendments at the gates).
It is what every delegation points at instead of making each agent re-derive
the same map:

```markdown
# Handoff brief — <slug>
Spec: <path> (<status>) · Plan: <path> · Branch: <name> · Base: <merge-base sha> · Base branch: <origin/<base-branch> | origin/<parent> @ sha>

## Binding rules (locators, not prose)
<the plan's **Context read**, verbatim — every rule with its `path:line`>

## Ownership
<the plan's Ownership table, or the brief's own if the plan had none>

## Amendments in force
<decisions accepted at this run's gates — a stage-1 split edit, warnings
accepted at 3b, a DEVIATED accepted at 4. These override step rows; "none
yet" at creation, appended at each gate that decides one>

## Known pre-existing failures
<filled in at stage 2 from the base-commit check; "none observed yet" until then>
```

Then every delegation opens with:

```
Your Step 1 is harness/sdd/<slug>-brief.md — read it instead of re-deriving the
context. Beyond it, read the plan you were handed and only the files you will
edit (and their tests).
```

**Why.** Without the brief, every agent in the chain opens with the same sweep —
`AGENTS.md`, the spec, the plan — re-deriving unchanged context at the cost
of a full sweep every pass. The brief is written once by the party that
already holds it.
It does **not** replace an agent reading the code it is about to change, and an
agent that finds the brief wrong says so in its report rather than silently
re-deriving.

**Gate:** `AskUserQuestion` — "Run with this split? (N waves, M parallel
lanes at the widest, DAG stated | inferred)". Options: *run as shown* /
*serialise everything into one lane* / *edit* (the human names the change; you
regenerate the brief). Do not delegate before this answer. Then commit the run
file with the brief.

**An option the brief already knows breaks the plan is not an option.** When
a gate question has a choice that leaves the plan unexecutable (a base branch
without the seams the steps build on, a split that puts one file in two
lanes), state that fact in the question and offer only executable choices.
An unexecutable option, once picked, has to be reversed, and one decision
turns into several asks.

Echo one line when done — `slug · mode · waves · lanes · from` — and go to
stage 2.

## The run file — `harness/sdd/<slug>.md`

Created at the first stage (or at `--from`) next to
`harness/sdd/<slug>-brief.md`, appended after every stage, committed with the
branch. It is what makes the "new chat" possible: the next session reads it
and continues.

```markdown
# Implementation run: <slug>
Plan: <path> · Spec: <path> (<status>) · Mode: multi|single · Branch: <name>

| Stage | Result | Agent | Tokens | Tool calls | Duration | Note |
|---|---|---|---|---|---|---|
| 1 read plan | 3 waves · 3 lanes | main | — | — | — | DAG stated |
| 2 implement · wave 1 | 2/2 | implementer, fresh | 70k | 35 | 5.0 min | |
| 2 implement · wave 2 | 3/3 | implementer, cont. | 40k | 20 | 3.0 min | 1 re-delegation |
| 2 conventions sweep | 1 WARNING, fixed | conventions subagent, fresh | 25k | 10 | 2.0 min | |
| 3 find | cr: 2 findings · sec: 0 | built-ins | 50k | — | — | tree `abc1234`, clean |
| 3b review loop | clean after 1 loop | implementer, fresh | 20k | 10 | 1.5 min | |
| 4 verify | COMPLETE | plan-verifier, fresh | 30k | 15 | 2.5 min | |
| 5 docs | AGENTS.md not affected | doc-writer, fresh | 15k | 8 | 1.0 min | |
| 6 mr | MR/PR draft ready | main | — | — | — | delta since `abc1234` · spec → implemented |

## Reports
<latest implementer report · latest findings list · plan-verifier report —
verbatim; a newer version replaces the older one>

## Insight candidates
<collected from every report as they arrive — one line each>
```

Tokens, tool calls and duration come from each `Agent` / `SendMessage`
result (`subagent_tokens`, `tool_uses`, `duration_ms`) — **one row per
delegation**, with `fresh` or `cont.` in the Agent cell. Copy them the
moment the result arrives: they exist nowhere else once the chat is gone,
and `/workflow-retro --deep` on a run whose chat has ended can compute its
metrics only from this table — a column not copied here stays `—` there.
This table is the only place "the reviewers are expensive" ever becomes a
number. **The wall clock in the run file's `### Totals` comes from
`git log --date=iso` between the stage-1 commit and the MR/PR commit, never
from memory** — a remembered duration of a long run is easily off by an
hour, and `/workflow-retro --deep` computes its deltas from that line.

## Stage map

| # | Stage | Who | Gate |
|---|---|---|---|
| 1 | read the plan | you — execution brief: tasks, DAG, owned paths, waves, mode | ⛔ **Human confirms the split** (run as shown / one lane / edit) |
| 2 | implement | `implementer` (sonnet), wave by wave per the brief — one lane or N in parallel, then the integration step; then the **conventions sweep** (subagents loading the skill in `AGENTS.md → Harness profile → conventions-skill` on the run's diff, the `/mr-self-review` 3b shape) | Report `Steps: N/N`. `done < total` → same delegation again with the report; **no reviewer yet** until the last wave — the sweep's findings join the stage-3 list |
| 3 | find | `/code-review` ∥ `/security-review` — same turn | Collect the findings you judge real into one list. Empty → stage 4 |
| 3b | review loop | `implementer` fix pass → verify touched slices → re-check | ⛔ **Human decides** on findings left standing and on a loop that hit the cap |
| 3c | browser verify | `/spec-verify` (+ `/ui-verify` when `design-source` is not `none` and the spec carries a design link) — mandatory on UI-touching diffs per a deterministic rule, auto-skipped otherwise or when `browser-qa` is `none`; the applied rule goes to the run file either way | FAILs and CRITICAL/WARNING discrepancies → one bounded fix pass → re-walk only the failed checks; ⛔ **Human decides** on anything left standing |
| 4 | verify | `plan-verifier` (opus), **once**, with the last implementer report; `INCOMPLETE` → implementer on Gaps → re-verify with the previous report | `COMPLETE`, or ⛔ `DEVIATED` the human accepts |
| 5 | docs | `doc-writer` (opus) — documents what landed; proposes (never writes) `AGENTS.md` lines and insights | Commit docs |
| 6 | mr | `/mr-self-review` in delta mode — gates and tripwires on the whole diff, the reviews on `git diff <stage-3 sha>..HEAD` (the discovery pass was stage 3) → drafted MR/PR body; spec `Status:` flip by hand in the same commit per `harness/specs/README.md` § Status lifecycle | ⛔ Human approves the MR/PR — then push + draft via `vcs-cli` |
| 7 | wrap-up | `/engineering-insights` with every report's **Insight candidates**; finish the run-file table | — |

**`test-writer` is off the default chain — by decision, to save tokens.** The
plan's Executor column may still name it; those rows are reported by
`implementer` under *left to others* and by `plan-verifier` as `NOT MET`
unless the plan was written without them. Tell the planner up front (in the
delegation: "no test-writer stage; test coverage is the implementer's step or
out of scope") so the plan does not carry rows nobody executes. When a feature
genuinely needs a test pass, run `test-writer` by hand between stages 3b and
4 — it is in `.claude/agents/`.

Single-agent mode in the plan header: stage 2 is you, in one pass; stages 3–7
unchanged.

**Human gates use `AskUserQuestion`** (you have it; subagents do not). One
question, the artifact path, a 3-line summary. Whole reports go to the run
file, not the chat.

## Stage 2 — implement, wave by wave

Follow the brief. One wave at a time; the next wave starts only when every
lane of the current one reported `Steps: N/N` for its rows.

A wave with one lane, or single-agent mode collapsed to one lane:

```
Execute the plan harness/plans/<slug>.md, steps <n, m, …> (wave <w>). Take only those rows.
```

A wave with several lanes — **one message, one `Agent` call per lane**:

```
Execute the plan harness/plans/<slug>.md, lane <A> of wave <w>: steps <n, m, …>.
You own: <paths from the brief>. You must not touch: <the other lanes' paths, listed>.
Steps <…> from earlier waves are done — build on them, do not redo them.
Other lanes run in parallel on their own paths.
Verify only your paths — the main session runs the full gate after the wave:
<the scoped test command from AGENTS.md → Commands, filtered to the lane's spec files>
<the lint command from AGENTS.md → Commands, on every file you touched>
```

**Check the test filter's path base before you send it.** A filter in a
form the runner does not resolve (relative to the app when the runner
resolves from the workspace root, or the reverse) matches nothing, and the
lane loses a run to "No tests found". With a working scoped line, parallel
lanes share one checkout without worktrees and without gate collisions; the
main session runs `node scripts/verify.mjs --slice <s>` once all reported.
**When two parallel lanes own files in one folder, the filter lists the
lane's exact spec files, never a folder glob** — a folder glob runs the
sibling lane's spec mid-edit and reports failures that are not the lane's
own. A lane never runs the full `verify.mjs` either: lanes share one build
output directory, so concurrent builds collide on locked files and fail
spuriously, and the merged gate repeats the run anyway.

A step that reads an API response carries one more line in its delegation:
"Responses are untrusted — every helper that reads an API field guards its
type (`typeof`, `Array.isArray`, optional chaining, or the stack's
equivalent) in the first pass, **including the guards themselves**
(`x.trim()` needs `typeof x === 'string'`)." Without the line, findings of
this one class keep returning loop after loop.

The integration step (the last wave, when the plan has one) is its own
delegation once every lane before it reported.

**At most 3 agents in flight at once, and scope each so it finishes inside
~5 minutes.** Two waves of three beat one wave of five; a lane that cannot be
cut below ~5 minutes is a lane the plan should have split.

**Settle "is this failure pre-existing?" once, here, and write the answer into
the run file.** The first lane report that comes back red on a test nobody
touched gets ONE check — a worktree at the merge base, the same lane command,
the verdict recorded as a line in `harness/sdd/<slug>.md`:

```bash
git worktree add /tmp/<slug>-base $(git merge-base origin/<base-branch> HEAD)
# run the failing lane there, then: git worktree remove --force /tmp/<slug>-base
```

Every later delegation then carries "known pre-existing: <names> (verified on
<sha>)". Without it the same failure gets re-investigated by every agent that
runs a lane.

Read each report's first line. `Steps: 5/7` → the same delegation again with:

```
Your previous report follows. Finish steps <n, m>; do not redo the rest.
<report verbatim>
```

**One lane, consecutive waves — continue, do not respawn.** When the lane
that finished wave *w* owns the same paths in wave *w+1*, send the next wave
to the **same** `implementer` run via `SendMessage` ("Wave <w+1>: steps <…>.
Your wave-<w> report stands; build on it, do not redo it.") instead of a
fresh `Agent` call. A continuation keeps the plan, the brief and the files
it already read; a fresh spawn re-reads all three — on a large plan that is
a full re-read every wave before the first edit. Respawn only when the
lane's ownership changes, the previous run ended in error, or its context
has visibly degraded (a report that contradicts the brief). Write `fresh` or
`cont.` into the run
file's stage row either way. **What a continuation saves is tool calls and
wall clock, not `subagent_tokens`:** per-turn tokens track the context the
agent carries, so a continued turn can cost more than a fresh one with far
fewer tool calls. Continue for the context, and do not cite it in a
retrospective as a token saving. **When the host has no `SendMessage` tool**
(check with one `ToolSearch` before wave 2; some hosts lack it), the lane is
respawned, the stage row says `fresh (no SendMessage)`, and the delegation
carries the previous wave's report summary in place of the continuation —
never a silent respawn that a retrospective later reads as a choice.

**A step that tests or integrates the previous wave's files continues that
wave's agent.** Ownership changes between a component step and its spec
step, but the context does not: the agent that just wrote the component is
the cheapest one to test it. Continue it via `SendMessage` unless its
context has visibly degraded, and when you respawn, say why in the stage
row. A respawned agent re-reads everything its predecessor already held, at
several times the tool calls of a continued turn.

**A checkpoint commit is proven, not announced.** After every between-stage
commit run `git status --porcelain -- <the lane's owned paths>`; it must be
empty before the next delegation is sent, and the delegation may say
"committed" only when it was. A commit whose message holds non-ASCII text
goes through a file (`git commit -F <scratch file>`), never an inline `-m`
inside a quoted shell string — a quote character in the message kills the
commit, and the next delegation then asserts a commit that never happened.
Stage explicit paths (`git add <owned paths>`, or `git add -u` for tracked
files), never a directory, while `git status --porcelain` shows untracked
files that are not this run's — `git add <directory>` sweeps another task's
file into the commit, and it has to be amended out before the push.

**After any formatter run, diffstat before you report.** A formatter's write
mode on an existing file reformats code the step never touched when the repo
is not formatter-clean (check the root `INSIGHTS.md`). Before a wave's gate:
`git diff --stat <base> -- <touched files>`; a file whose change exceeds
the intended edit is reverted and the edit re-applied by hand. In
single-agent mode this is your own check; in multi-agent mode it is the
first thing you do with a lane's report. Stray reformatting passes every
gate and reaches the review as noise.

**The conventions sweep closes stage 2.** When the last wave reported and
its gate is green, run the conventions subagent pass from `/mr-self-review`
stage 3b (one subagent per touched code slice, loading `AGENTS.md → Harness
profile → conventions-skill`, hunks only, JSON findings, the gate's severity
scale) on `git diff <base>` — here, on the fresh diff, not at stage 6 on the
final one. Its findings join the stage-3 list and are fixed in the loop that
runs anyway. The sweep's delegation names the spec path and says: "a finding
that contradicts the spec's **Decisions taken** or an Open-question default
is not a finding — skip it" (otherwise the sweep re-argues settled
decisions, and its findings enter the list only to be disputed). Run at
stage 6 on the whole diff, the same sweep costs a full pass and its own gate
for what a fix loop absorbs in a line; at stage 6 it re-runs on the delta
only.

## Stage 3 — find (one turn, two reviews)

Invoke `/code-review` and `/security-review` in the same turn, on the branch
diff.

**On a stacked branch the diff is `<Base>..HEAD`, stated explicitly.** When
the brief's `Base` is not `origin/<base-branch>` (the branch builds on an
unmerged MR/PR), every review invocation and every finder sub-task names
`git diff <Base>..HEAD` in its prompt. The built-in `/security-review` prompt
otherwise carries the diff against the default branch — the whole parent
branch included — and its findings would belong to the parent MR/PR.

**The sweep goes in first, and the cleanup angles collapse into one.** Hand
`/code-review` the stage-2 conventions sweep's findings as *already
reported — do not re-report*, and run its four cleanup angles (reuse,
simplification, efficiency, altitude) as **one** finder per ≤1000-line
chunk, not four. The three correctness angles (A, B, C) stay separate — they
are where confirmed bugs come from, while separate cleanup finders mostly
re-list what the sweep already found. Every finder pays a flat cost because
each re-reads the same files; one cleanup finder that starts from the sweep's
list reads them once.

**Small diff, fewer correctness angles.** On a run diff of **≤ 600 changed
lines** run angle A plus **one** of B/C — B when the diff deletes or replaces
≥ 20 lines, C otherwise — plus the single cleanup finder; all three
correctness angles only above that. Each angle costs the same flat amount
regardless of what it finds, and on a small diff angle A carries nearly all
of the unique candidates. The stage-3 row names the shape that ran
(`A+B+cleanup` / `A+B+C+cleanup`), so a later retrospective of a ≤ 600-line
run can check the recall side of this rule.

**Security runs HERE, not only before the MR/PR.** A security finding sends
work back to `implementer` exactly like a bug does, so it belongs in the stage
where everything that can send work back runs together — found late, it lands
after the tests were already written against the unsafe shape, and the fix
costs double.

**Small diff, no new surface: security and cleanup share one agent.** On a
diff of **≤ 600 production lines** that adds no new endpoint class and
touches no request interceptor or middleware, auth, storage or HTML sink, run
`/security-review` and the single cleanup finder as two passes of one agent,
two result blocks. On such a diff a separate security pass rarely finds
anything actionable, and the merged agent costs well under two separate
ones. The moment the diff touches one of the surfaces named above, security
runs alone again: the saving is modest, the recall risk sits entirely on the
security side.

**Diff budget.** On a feature diff over ~1000 changed lines, invoke
`/code-review medium` here rather than `high`, and spend the difference on the
security pass. Under ~1000 lines, `high` is the default.

**Multi-agent runs over three waves: review by wave, not by diff.** The
budget rule above is per review prompt. When the run had more than three
waves, do not hand the whole diff to one `medium` pass: split it by wave
(`git diff <wave n-1 commit>..<wave n commit>`) and run `/code-review high`
on each chunk under ~1000 lines — the security pass stays one, on the whole
diff. A single `medium` pass over a diff of several thousand lines lets
runtime-ordering bugs through (an event handler that runs on every firing of
an event that fires more than once); they surface only later, in
`plan-verifier`'s *Noted, not graded* or a hand re-read at stage 6. This
roughly doubles the stage-3 tokens; it is the one stage-3 setting that
trades tokens for coverage, and the run file names which form ran.

**Verify runtime-fact candidates by hand, not by agent.** `/code-review`'s
default is one verifier agent per candidate, each paying a full spawn floor.
When a candidate's claim is a runtime fact — "throws in state X", "`new
Date(null)` is 0", "`obj['constructor']` resolves through the prototype",
a library behaviour with a cited line — the main session verifies it in one
Bash call: read the cited library lines and run a one-line probe in the
stack's runtime (`node -e` for a JS stack). Spawn a verifier only for a claim
that needs a code trace across files (a caller that breaks, an ordering
dependency). One call settles several such candidates that would otherwise
cost one verifier agent each.

Findings list = every `/code-review` finding you judge real, plus every
`/security-review` finding at WARNING or above, plus the stage-2
conventions sweep's findings. Note the SHA of the tree the reviews saw
(`git rev-parse HEAD` + whether the tree was dirty) — the re-check is
scoped to what changed after it, and stage 6 reviews the delta since it.

## Stage 3b — the review fix loop

A fix can clear one finding and open another. Loop,
`loop = 1..--max-review-loops`:

1. **Fix pass** — `implementer`, the findings list is its step list:

   ```
   Fix pass <loop> on harness/plans/<slug>.md. Address exactly these items and nothing else:
   1. <finding — file:line — source — what would clear it>
   2. …
   Run scripts/verify.mjs on the touched slices before reporting.
   ```

   Criticals and real bugs always go in. Warnings go in on loop 1 when they
   are cheap and obviously right; the rest wait for the gate.

   **A fix that changes a pattern lists every site.** When the fix changes a
   handler, an event binding, a guard or a marker that the code repeats, the
   item names every sibling site — `rg` the pattern, the command and its count
   in the item — not only the line the finding cited; the same holds when the
   main session applies the fix itself. A fix applied to the cited line alone
   leaves the sibling sites on the old pattern until a later review finds
   them.

2. **Re-check** — run `node scripts/verify.mjs --slice <touched>` yourself and
   read the lines, then the formatter's check mode (`AGENTS.md → Commands`,
   when the project has one) on the files the loop touched, and fix what it
   lists with its write mode on those files only (diffstat after, per
   stage 2) — formatting is deterministic and takes seconds here, a full
   subagent pass and a gate when stage 6 finds it instead.

   **A fix pass that adds a code path gets its own review, here.** When the
   loop added a branch, a guard, a subscription or an effect — anything
   beyond one-line corrections — run the single combined delta reviewer
   (correctness · conventions · security, one agent) on
   `git diff <stage-3 sha>..` **before leaving 3b**, and feed its findings
   into the next loop. A hand read of the diff is not a substitute: a fix
   pass opens defects of its own — guards that throw on hostile shapes, a
   dialog that closes on the page's own navigation, an error-state reset
   that runs before its guard — that a hand read of a short diff passes.
   Caught only by the stage-6 delta review, they land after 3c,
   `plan-verifier` and `doc-writer` already ran on the older tree, and the
   docs have to be re-patched. No extra agent: the stage-6 reviewer moves
   earlier, and stage 6 then reviews
   only what changed after this pass.

3. Exit when verify is green **and** every listed item is cleared or accepted.
   Gate: `AskUserQuestion` with the warnings still standing — *accept* (record
   in the run file, note in the MR/PR body) or *fix* (another loop). Cap
   reached with items open → the same question plus "N more loops / stop and
   take it to the MR/PR as is".

Record each loop's tokens — this is the stage most likely to surprise.

## Stage 3c — browser verify

The only stage that sees a rendered screen. It runs after the fix loop
settles and before `plan-verifier`, so the tree it tests is the tree that
gets graded.

**When `AGENTS.md → Harness profile → browser-qa` is `none`, the stage
does not run:** the run file records `3c skipped: browser-qa is none` and
stage 4 receives that line in place of the verdict table.

**Whether it runs is a rule, not a question.** Run it iff the diff is
UI-touching: `git diff --name-only $(git merge-base origin/<base-branch>
HEAD)` matches the patterns in `AGENTS.md → Harness profile → ui-paths`
(markup and style files, the `i18n` catalogue), **or** a changed hunk holds
one of the in-file UI markers that key lists (inline templates or styles),
**or** the spec carries any `verify: … manual` lane or a design link. Write
the applied rule and its outcome to the run file either way — a skipped 3c
must be visible as `skipped: no UI in the diff`, not absent.

Invocations:

- `/spec-verify <spec path>` — pass the known pre-existing failures from the
  brief, and the run slug for screenshot naming.
- `/ui-verify <design link> --routes … --spec <spec path>` — only when
  `AGENTS.md → Harness profile → design-source` is not `none` and the spec's
  Inputs / Design review carries a design link; it compares against the
  spec's `### Design values` first. No link → run-file note
  `ui-verify skipped: no design link`; `design-source` is `none` → note
  `ui-verify skipped: design-source is none` — never an error.

**Feedback loop.** spec-verify `FAIL`s plus ui-verify CRITICAL/WARNING
discrepancies form a findings list in the stage-3b delegation format →
**one** implementer fix pass → re-walk only the failed checks, not the whole
matrix. A ui-verify fix delegation carries one more line: "Design values are
fixed — write them as literal values, not as steps of the theme's scale; a
theme scale can be responsive and shrink at narrower breakpoints." **A fix
delegation never prescribes a value the reference did not give** — where the
design was not read for an element or a width (a metered design-tool plan,
a frame that does not exist), the item says "not in the reference: leave as
is", never a number from the current app or from memory — a guessed value is
re-touched by another fix pass once the design is actually read. **A 3c fix
pass that changes markup or styles gets the single combined delta reviewer**
on `git diff <pre-pass sha>..` before stage 4 — the same rule as a 3b pass
that adds a code path. A styling pass that passes its own re-measure at one
width can still open defects elsewhere (a theme step that shrinks at narrow
widths, theme tokens inlined in markup), and found at stage 6 they land after
`plan-verifier` and `doc-writer` have run on that tree. `BLOCKED` never
loops — it is environment, not product; record it
for stage 4 context and the MR/PR body. Anything left standing after the pass
→ gate: `AskUserQuestion` — *accept* (run file + MR/PR body, like accepted
warnings) / *one more pass* / *stop*.

**A finding owned outside the run's diff gets its history at the gate.**
When a ui-verify discrepancy sits in a shared component, a layout wrapper
or the global theme that this diff does not touch, `rg` the element in
`harness/sdd/*.md` before the gate question. If an earlier run already
measured it and accepted it, the question says so (run slug and its
verdict) and offers "separate ticket" as one of the options, next to
*accept* and *fix here*. The human may still fix it in this MR/PR — the point
is that they decide with the history in view. Without it, a feature run
re-finds what an earlier run measured and accepted, and fixes a shared
component inside a feature MR/PR at the cost of extra passes and their delta
reviews.

**Every width the plan names is walked before stage 4, and walked again
after a later style commit.** The 3c evidence covers each width in the
plan's Verification row — including a narrow one such as 320px that no
design frame draws — and any commit that changes styles after a walk
re-walks those widths before `plan-verifier` runs. A walk older than the
last style commit is stale evidence: the verifier returns `INCOMPLETE` with
no product gap — once for a width never walked, again for a walk that
predates a style commit — and every re-verify is a full pass.

**Run file:** one stage row per skill (`3c spec-verify`, `3c ui-verify`),
both reports verbatim under `## Reports` — the screenshot paths live there
because the screenshot directories are local to this checkout; the run file
is what travels.

**The 3c verdict table carries one row per AC the plan names** — every id
in the plan's **Satisfies** column, including the ones settled by a unit
test or by the diff rather than by a screen. A row settled outside the
browser says how: `PASS (unit: <spec file>)`, `PASS (diff: <path:line>)`,
`BLOCKED (<environment reason, verbatim>)`. `plan-verifier` reads this
table as its runtime evidence; an AC missing from it is graded from the
diff alone, and an AC whose evidence sits only in stage-2 prose comes back
`UNVERIFIABLE`. Misplaced evidence alone produces `INCOMPLETE` verdicts with
no defect behind them.

**A row the stand is known not to serve is not walked.** When the spec, an
interview decision or an earlier run already states that the stand cannot
produce the state (a permission the account lacks, a customer decision not
to write data), 3c confirms it with **one** probe, walks only the rows that
do not need that state, and grades the rest `BLOCKED (<reason, verbatim>)`
from the unit lane in one line. Walking them anyway spends the pass on rows
whose outcome is known before it starts.

**A skipped check quotes its probe.** Every `skipped:` and `BLOCKED` line
in the run file carries the command or MCP call that failed and its output
verbatim (`curl -sf … → exit 7`, `get_metadata → 401 …`), never a
paraphrase. An unprobed reason such as "design MCP not authenticated" can be
false (a second, working design MCP server may exist), and the row then
reaches `plan-verifier` as `UNVERIFIABLE` and the pass is redone later.

**A stacked base is re-checked before stage 4.** When the brief's base
branch is not `origin/<base-branch>`, run `git fetch` and compare
`git rev-parse origin/<parent>` with the sha the brief recorded; if the
parent moved, rebase now and re-run the full `verify.mjs` before
`plan-verifier`, so the verifier and the 3c evidence grade the tree that
ships. Otherwise a parent that moves mid-run forces a rebase after the
`COMPLETE` verdict, and the verdict no longer describes the tree.

## Stage 4 — verify (once)

```
Verify harness/plans/<slug>.md against this branch. Stage: final.
Implementer report:
<the last one — after the fix loop>
Browser verification (stage 3c) verdict table:
<the spec-verify verdict table, or "stage 3c skipped: <rule outcome>">
```

The verdict table is evidence, not vocabulary: `plan-verifier` keeps its own
MET/PARTIAL/NOT MET grades and may cite a runtime row as "observed in
browser, stage 3c" instead of `UNVERIFIABLE`.

`INCOMPLETE` → fix-pass delegation with the **Gaps** section as the list, then:

```
Re-verify harness/plans/<slug>.md. Stage: final. Previous verification report follows — regrade only what was not MET, redo unrequested changes and the lane table.
<previous plan-verifier report verbatim — the WHOLE report, including the full per-requirement table>
<implementer fix-pass report verbatim>
```

**The whole previous report, table included — never just the open rows.**
A re-verify carries a `MET` row forward only after one `Read` confirms its
locator; handed the open rows and no table, it cannot do that check, must
say so, and its verdict then covers less than its numbers claim.

**A delta plan names its scope.** When the plan header carries
`**Scope:** AC-… · delta of harness/plans/<earlier>.md`, both delegations
above add the earlier run's final verification report
(`harness/sdd/<earlier-slug>.md` § Reports — the path is enough) so the
verifier points its out-of-scope rows at it instead of regrading the whole
spec.

`DEVIATED` → gate: the human accepts the deviation or sends it back.

## Stage 5 — docs

```
Document the behaviour that landed on this branch for harness/plans/<slug>.md / <spec path>. The reviews are settled; nothing is still moving.
```

Delegate to `doc-writer`. Usually the spec's **Architecture impact** named
nothing — the report says so; write "not affected" into the run file. Commit
what changed.

## Stage 6 — MR/PR

Invoke `/mr-self-review` **in delta mode**: hand it the SHA the stage-3
reviews saw. Its slicing, deterministic gates and tripwires run on the
whole branch diff as always, but `/code-review`, `/security-review` and the
conventions subagents receive `git diff <stage-3 sha>..HEAD` only
(`.claude/skills/mr-self-review/routing.md` § Delegation). Stage 3 was the
discovery pass over the full diff; what is new since then is the fix loop,
the 3c fixes and the docs — a few hundred lines no reviewer has seen. A full
re-review repeats the discovery pass at full cost, while the delta is where
the new findings are. The skill applies waivers and composes the MR/PR body
per the template in `AGENTS.md → Harness profile → review-template` —
directly, never as a repo file (`review-template` is `none` → a short body:
what changed, why, how it was verified). Accepted warnings from stage 3b and
any `DEVIATED` verdict go into the body under their own line; the body's
screenshots line names the stage-3c screenshot paths from the run file for
the human to attach. Flip the spec's `Status:` by hand in the same commit per
`harness/specs/README.md` § Status lifecycle — `implemented` when every AC
outside the spec's `Deferred:` line is closed; a spec with backend-blocked
ACs and no `Deferred:` line stays `approved`, and that is a spec edit to
request, not a status to fake.

**A small delta takes one reviewer.** When the delta since the last review
(stage 3, or the 3b delta pass) holds **≤ 150 production lines**, the three
delta passes run as one combined reviewer agent, not three — and this is
the shape, not a deviation to apologise for in the run file. Three agents on
a small delta mostly return `[]` at three times the cost; one combined
reviewer still finds the real defects.

⛔ Gate: the human approves opening the MR/PR. On approval, push the branch
and create the draft with the create command in `AGENTS.md → Harness profile
→ vcs-cli` (or its update command when the MR/PR already exists) with the
composed body — composed directly, never a repo file. CLI auth broken → fall
back to the branch name and the drafted body in chat.

## Stage 7 — wrap-up

Run `/engineering-insights` with the **Insight candidates** from every report;
finish the run-file table (every stage, every token count); commit the run
file. `/workflow-retro` is **not** part of this stage — the human runs it by
hand when they want a retrospective of the run; do not invoke it from here.

## Resuming (`--from`)

Read `harness/sdd/<slug>.md`, take the latest reports from it, start at the
named stage. Never re-run a finished stage to "refresh" it. Run file missing →
say so and start at stage 2.

## What you must not do

- Run stage 3 or 4 while stage 2 is incomplete.
- Skip the re-check after a fix pass.
- Run `plan-verifier` before the fix loop and stage 3c closed, or twice
  without its previous report.
- Delegate without the plan name, or hand `plan-verifier` no implementer
  report — every declared deviation would grade `NOT MET`.
- Let a subagent write `INSIGHTS.md` or flip a spec status; both are yours —
  and you commit between stages, agents never do.
- Describe the tree after an interrupted agent before running
  `git status --porcelain` (`.claude/agents/README.md`, relay rules).
- Record a `skipped:` stage or a `BLOCKED` row without the probe's output
  verbatim.
- Run `spec-creator` or `implementation-planner` from here. They are manual.
- Run `/workflow-retro` from here. It is manual too.
