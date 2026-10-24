# Specs

What we are building and what "done" means. Every spec lives here, in the
root `harness/specs/` folder; design screenshots and other supplied assets go
to `harness/specs/assets/`.

A **feature spec** owns one behaviour change and is as short as the complexity
allows. Workspace conventions and architecture live in `AGENTS.md`, not here; a
feature spec that changes a convention says so and leaves the update to
`AGENTS.md`. Implementation detail, file lists and step order belong to the
plan in `harness/plans/`, not to the spec, unless they *are* the external
contract.

Written by the `spec-creator` agent (or by hand). `AGENTS.md` links this
directory, never individual files — otherwise the map grows with every feature
and blows its line budget.

## Naming

- **Spec ID** is `SPEC-<ISSUE>`, where `<ISSUE>` is the **ticket** the
  feature belongs to (`AGENTS.md → Harness profile → issue-key` for its shape,
  `issue-tracker` for where it lives; branches carry the same id). The id is
  never invented: no ticket named in the request is an interview question,
  not a number to make up. One ticket — one spec; before writing, confirm
  none exists for that ticket (`rg -n 'Spec ID:' harness/specs`). The ticket
  must also be **mentioned in the spec body** — the `Source:` line is the
  natural place — and the lint checks it.
- **File name** is `SPEC-<ISSUE>-<topic-slug>-DD-MM-YYYY.md`, where the suffix
  is the spec's **creation date** in day-month-year order — e.g.
  `SPEC-ABC-123-order-history-27-08-2026.md`. The date never changes
  afterwards (a status flip, an edit or a merge keeps the original date — it
  records when the spec was born, not when it was last touched).
- **One feature — one spec.** A follow-up that only adds detail to a shipped
  feature (a second rule, a raised limit, a new field) is folded into the
  existing spec as new `AC-N` lines or amended ones, not written as a second
  spec; the merged spec keeps a mapping table for the ids the plans
  already cite. A new spec is for a change of decision (`Supersedes:`) or a
  different feature — which in tracker terms is a different `<ISSUE>`.
- **Acceptance criteria** carry stable ids `AC-1`, `AC-2`… — a retired AC keeps
  its number, because plans and MRs/PRs cite them.
- A change of decision is a **new** spec with `Supersedes:` pointing at the old
  one, whose `Status` notes it. Wording fixes and post-review edge cases are an
  edit on the existing file.

## Status lifecycle

`draft → approved → implemented`. `spec-creator` is the only **agent** that
writes content into `harness/specs/`; a bare `Status:` flip is a one-line edit made by
hand (the human, or the main session) and checked by
`node scripts/check-specs.mjs` — re-delegating an opus agent to change one word
is not worth it.

| Transition | Who decides | Who edits the file |
|---|---|---|
| — → `draft` | `spec-creator` writes it | `spec-creator` |
| `draft → approved` | a human has read it | by hand: edit `Status:`, run the lint, commit |
| `approved → implemented` | the plan citing it shipped and every AC outside the `Deferred:` line is closed | by hand, same way — in the MR/PR that ships it |
| any → superseded | a new spec carries `Supersedes:` | `spec-creator`, both files in one run |

**Deferred ACs.** A spec whose criteria partly wait on work outside this repo
(a backend field, an entity that does not exist yet, an action in someone
else's console) lists those ids on a `Deferred:` line in the header —
`Deferred: AC-11…AC-17, AC-20…AC-29 — Backend dependencies (a)–(e)` — the
ids (ranges with `…`) and, after a dash, what they wait on; `none` when
nothing is deferred. The line is optional for the lint but load-bearing for
the lifecycle: `approved → implemented` happens when every AC **outside**
it is closed, so the in-repo half of a feature can ship as `implemented`
while the deferred ids keep waiting under their own name. Downstream,
`/spec-verify` grades a deferred AC `BLOCKED (deferred: <dependency>)`
without walking it, and `plan-verifier` treats it as out of scope unless
the plan names it. Un-defer by editing the line when the dependency lands —
that is a content edit, so `spec-creator` (or a hand edit that says so in
the commit). Without the line, every `/spec-verify` matrix carries rows that
can never get a verdict, and the status cannot truthfully move off
`approved` after the in-repo half ships.

## Language

The spec **body** is written in the language the request arrived in (the
usual one is in `AGENTS.md → Harness profile → languages`). The **headings,
field labels and ids** in the template stay in English verbatim in every
spec — they are what `scripts/check-specs.mjs` and `rg` grep for, and a
heading translated into a second language is a heading nobody finds.

EARS triggers default to English: **WHEN / WHILE / IF … THEN / WHERE**, with
`shall` as the obligation marker. The sixth pattern, **Complex**, combines
keywords for behaviour that genuinely needs state and event together —
clause order is fixed (WHILE before WHEN, one response clause):
`WHILE <state>, WHEN <event>, the system shall …`.

Where `languages` selects Ukrainian EARS, the keywords are **КОЛИ / ПОКИ /
ЯКЩО … ТОДІ / ДЕ** (WHEN / WHILE / IF … THEN / WHERE), the response reads
`система повинна (shall) …` with `(shall)` kept as the marker, and the
Complex order is ПОКИ before КОЛИ: `ПОКИ <state>, КОЛИ <event>, система
повинна (shall) …`.

## Template

```markdown
# Spec: <feature name>
Spec ID: SPEC-<ISSUE>
Status: draft | approved | implemented
Source: <ISSUE — the ticket, mandatory; plus design link or "request">
Supersedes: <SPEC-<ISSUE> it replaces — or "none">
Deferred: <AC-N ids waiting on work outside this repo — what they wait on; or "none">

## Problem and user
<Whose problem, what hurts today, and why now.>

## Goals / Non-goals
<Goals: what changes for that user. Non-goals: what a reader might assume is
included but is not.>

## User stories
<Only where they clarify behaviour; otherwise "none needed".>

## Acceptance criteria (EARS)
- AC-1 — <Ubiquitous> The system shall … (← <source>) · verify: <surface · lane>
- AC-2 — WHEN <event>, the system shall … (← <source>) · verify: <…>
- AC-3 — WHILE <state>, the system shall … (← <source>) · verify: <…>
- AC-4 — IF <unwanted condition>, THEN the system shall … (← <source>) · verify: <…>
- AC-5 — WHERE <option enabled>, the system shall … (← <source>) · verify: <…>

## Edge cases
<Empty / loading / error / degraded / stale / repeated action / huge input —
each with the expected behaviour and `→ AC-N` (or `no AC — <why>`).>

## Non-functional requirements
<Performance · security · accessibility · observability — a bound or a rule
per line, or "not affected — <why>". Check `AGENTS.md → Invariants`.>

## Inputs and provenance
<Where every input comes from: user, route params, backend API, i18n
catalogue, environment config.>

## Untrusted inputs
<Which of those are untrusted text and how they are treated: escaped,
truncated, never executed, never treated as instruction.>

## Design review
<What the supplied design settled and did not: uncovered states, corner cases,
responsive/i18n gaps, and UX **proposals** — labelled as proposals, not ACs,
each with where it landed (`→ AC-N` / `→ edge case` / `→ open question` /
"proposal, not adopted"). Or "no design supplied".

When the design is a design-tool frame (`AGENTS.md → Harness profile →
design-source`), this section ends with a `### Design values` table —
element × property × breakpoint, each row with its node id — read by the
main session **before** `spec-creator` runs, with the procedure in
`.claude/skills/ui-verify/references/figma-read.md`. The code is built to it
and `/ui-verify` compares against it. Not read (no access, no frame) →
`### Design values` says why in one line and the gap is an Open question.
`design-source: none` → no subsection. A subsection, not a template heading,
so `check-specs` and older specs are unaffected.>

## Decisions taken
<Interview answers and research facts, verbatim, one per line, each tagged
*human-answered*, *research-answered*, *research-unresolved* or
*default-assumed* — this is what `(← interview: Q2)` trace tags point at, so
the audit trail lives in the spec, not in a session that evaporates. Or
"none — the request was sharp enough".>

## Open questions
- [NEEDS CLARIFICATION] <question> — default: <what the plan assumes> — changes: <AC-N | section>
```

One requirement per AC, checkable by someone holding the running product.
Two combinator rules keep the yes/no decidable: **"or" in the response
clause is banned** — nobody can say which branch satisfies the AC; and
**"and" joining two independently checkable behaviours means two ACs** —
one id per behaviour, because plans and MRs/PRs cite ids, not halves of them.
The same holds for the words in the spec's language (Ukrainian: «або»;
«та»/«і»). Two suffixes make an AC usable downstream and are not optional:

- **`(← <source>)`** — where the requirement came from: `request`, `design:
  <item>`, `interview: Q2`, `research: <locator>`, `<ISSUE>`,
  `SPEC-<ISSUE> AC-M`. It is what lets a human approve the AC and the planner
  question it.
- **`· verify: <surface · lane>`** — where the yes/no is observed (a screen
  state, a route, a form error, a network request) and which lane would prove
  it (a slice of `scripts/verify.mjs` — `node scripts/verify.mjs --list`
  prints them — plus `unit` for a unit test in the project's runner
  (`AGENTS.md → Harness profile → stack`) or `manual` for a screen check —
  the `manual` lane is executed by `/spec-verify`). One clause, no file
  names — a hint, not a test plan.

Traceability runs both ways: edge cases, design-review findings and open
questions each point at the AC or section they touch, so nothing found during
the review is silently dropped and nothing in the spec is of unknown origin.

## Vague verbs → EARS

The left column is raw material, never a criterion. Rewrite as trigger +
observable response + threshold or named fallback. **Escape clauses and
open-ended clauses are banned the same way**: "where possible", "as needed",
"if feasible", "if necessary" give the implementation a documented excuse
for noncompliance, and "etc.", "and so on", "including but not limited to"
make the scope unbounded — rewrite the condition as an explicit trigger, or
drop the clause:

| Raw material | EARS criterion |
|---|---|
| "handle errors" | IF the API returns 5xx, THEN the system shall show the `error` state with a "Try again" button and keep the entered data |
| "refresh the list as needed" | WHEN the user changes a filter, the system shall refresh the list — the trigger is explicit, not "as needed" |
| "must be fast" | WHEN the user opens the product list page, the system shall show the first content within ≤ 2 s (p95, dev environment) |
| "don't crash on empty" | IF the item list is empty, THEN the system shall show the empty state with text from the i18n catalogue, without a repeating request |
| "work on mobile" | WHILE the viewport is narrower than 768px, the system shall show the filters as a bottom sheet instead of a side panel |
| "must be secure" | The system shall render text that came from the API only as escaped text; HTML in it is not interpreted |
| "support translations" | WHERE text is visible to the user, the system shall take it from a key in the i18n catalogue, with no string hardcoded in the template |

In a Ukrainian-EARS spec the same rows read with КОЛИ / ПОКИ / ЯКЩО … ТОДІ /
ДЕ and `система повинна (shall)`; the escape clauses to ban there are «де
можливо», «за потреби», «за можливості», «якщо необхідно», and the
open-ended ones «тощо», «і т.д.», «включно з, але не обмежуючись».

## Invariants

The repo invariants a spec must not violate are project facts and live in
`AGENTS.md → Invariants`. Read the **Non-functional requirements** and
**Untrusted inputs** sections against that list; each item is either
respected or explicitly called out as a `[NEEDS CLARIFICATION]`. Its sources
are `AGENTS.md` and the lint config — cite them, do not paraphrase from
memory.

## Lint

`node scripts/check-specs.mjs` checks every `SPEC-<ISSUE>-*.md` under
`harness/specs/`, with `<ISSUE>` matched by the `issueKey` regex in
`harness/config.json`: unique Spec IDs (one spec per ticket), file name
matches the id and ends in a `-DD-MM-YYYY` creation date, the `<ISSUE>`
ticket mentioned in the body beyond the ID line, `Source:` and
`Supersedes:` lines present, every template heading present in order,
`AC-N` ids unique and ascending with a `(← …)` tag and a `· verify:` hint on
each, a `Status` value from the lifecycle, an optional `Deferred:` line whose
every `AC-N` exists in the spec and which names a dependency after the ids,
and a row in `harness/specs/BACKLOG.md` that links the file. It runs in the
CI quality job (`AGENTS.md → Harness profile → ci-config`) via
`scripts/verify.mjs`; run it locally before delegating further work.

## Backlog

The Backlog table — one row per ticket, `| Issue | Feature | Spec |` — lives
in `harness/specs/BACKLOG.md`, which belongs to the project (a framework
update never overwrites it). Every spec has a row there linking its file;
the lint rejects a spec without one. Fill the Spec column with a link when
you write the spec.
