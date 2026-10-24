# Routing — slices, skills, severity

The single source of truth for what runs against what. `SKILL.md` describes the
workflow; this file holds the tables it reads.

Contents: Mode · Severity scale (with the confidence floor) · Slices ·
Skill map · Delegation (effort by diff size) · Cost ceiling.

## Mode

```
mode: report-only
```

`report-only` — findings are reported, the stamp is written with
`verdict: PASS` regardless. This is the adoption setting.
`blocking` — a critical finding writes `verdict: BLOCKED`.

Nothing enforces a `BLOCKED` verdict today — the framework ships no hook and
no stamp validator — so in either mode the verdict is a loud report.
Flip to `blocking` once a few real MRs/PRs have gone through and the finding
quality is known; change it here **and** note it in the skill's
`metadata.version` bump.

The mode is copied into the stamp on every run, so flipping it never
retroactively re-judges a review produced under the other one.

## Severity scale — the gate owns this

Skills supply rules; the gate supplies the scale. Every subagent classifies
against this table, whatever the routed skill calls its levels.

| Severity | Definition | Effect |
|---|---|---|
| **CRITICAL** | Will break production, lose or corrupt data, or open a security hole. A reviewer would say "do not merge this." | Blocks (in `blocking` mode) |
| **WARNING** | Wrong per a project convention or skill rule, but it ships safely. Convention and layout violations belong here. | Advisory |
| **SUGGESTION** | Style, polish, opportunistic cleanup. | Advisory |

**To raise CRITICAL, a finding must state the production consequence in
`rationale`.** Without one it is a WARNING. This is the whole defence against a
gate that cries wolf: "violates the naming convention" is not a reason to stop
a merge, and a gate that behaves as if it were will be switched off within a
week.

**Confidence floor.** Subagent findings carry `confidence` 0–1; anything
below **0.7** is dropped before scoring and listed in the report as dropped
(precedent: Anthropic's own security-review reports nothing under 0.7). The
floor filters noise, not severity — a confident WARNING stays a WARNING.

Deterministic failures — a failing lint, test or build gate from
`scripts/verify.mjs` — are CRITICAL by construction. They already fail the
CI file named in `AGENTS.md → Harness profile → ci-config`, so the local gate
must not disagree with it.

## Slices

The same vocabulary as `scripts/verify.mjs` and the specs' `· verify:` hints.
Slice names and their paths live in `harness/config.json` → `slices`
(`node scripts/verify.mjs --list` prints them) — read them there, never copy
them into this file.

| Path | Slice | Notes |
|---|---|---|
| a code slice's paths in `harness/config.json` | that slice | includes colocated tests and the slice's i18n catalogue, if any |
| `harness/specs/**` | `specs` | `check-specs.mjs` via the `specs` lane; no skill review |
| `.claude/**`, `.agents/**`, `scripts/**`, `*.md`, the CI file (`ci-config`) | `meta` | no skill review; listed in the report |
| a path in `do-not-touch` | — | **tripwire**, not a review target (below) |
| anything else | `meta` | listed in the report so nothing is silently ignored |

**Excluded from review entirely** (`AGENTS.md → Harness profile →
do-not-touch`). A diff that *modifies* one of those paths is itself a
CRITICAL finding — they are not review targets, they are tripwires.

**One exception — a declared vendor update.** A vendored skill on the
`do-not-touch` list may change when the MR/PR body carries a line naming the
update and the vendoring lock file (e.g. `skills-lock.json`, whose hash the
vendoring flow recomputes) moves in the same diff:

```
Vendor-update: .claude/skills/<vendored-skill>
```

Then it is not a finding; instead list the declared paths in the report so
they reach the reviewer's eye. An **undeclared** edit, or one without the
matching lock-file change, stays CRITICAL. Infra and deployment files on the
list have no such exception — their owners change them, not a feature branch.

## Skill map

| Slice | Skills | Condition |
|---|---|---|
| every code slice | `AGENTS.md → Harness profile → conventions-skill` (`project-conventions`) | always |
| a code slice | a skill from `framework-skills` | only where that key says the skill applies to *reviewing* this slice; by default never (below) |
| `specs`, `meta` | — | deterministic gates / spec lint only |

**Never routed**, and why — this list matters as much as the one above:

| Skill | Why not |
|---|---|
| framework rulebooks (`framework-skills`) by default | A large framework rulebook routed onto a diff produces framework tutoring, not findings; `/code-review` already owns correctness. Executors load it while *writing* code, which is where it pays. Route one only when the profile names a review use for it. |
| scaffolding skills | Nothing to review. |
| `brainstorm`, `implement` | Workflow skills — loading a workflow invites running it. |
| `spec-verify`, `ui-verify` | Browser workflow skills — routed onto a diff they would try to launch the app; their reports reach this gate through the run file, not through routing. |

## Delegation

Bug-hunting and security are **not** reimplemented here. Stage 3a runs the
built-ins and ingests their findings:

| Concern | Owner |
|---|---|
| General correctness, bugs | `/code-review` |
| Security | `/security-review` |
| Project-specific conventions | the subagents above |
| Slicing, routing, verdict, stamp, MR/PR body | this skill |

If a built-in's output cannot be parsed, record `delegate step skipped:
<which>` in the report and continue. A broken delegation must not take the
gate down with it — but it must never pass silently either.

**Effort by diff size.** `/code-review` and `/security-review` go out in **one
message**, and the level depends on how big the diff is:

| Changed lines in the reviewed diff | `/code-review` level |
|---|---|
| ≤ 1000 | `high` |
| > 1000 | `medium` — and say so in the report |

Above the threshold the budget buys more by going to the security pass than to
another correctness angle. Never drop `/security-review` to pay for
`/code-review` — the ratio only ever moves the other way.

**Delta mode — inside `/implement` (stage 6).** Stage 3 already ran both
built-ins and the conventions subagents on the tree at a recorded SHA. When
the invoker names that SHA, stage 0's slicing, the deterministic gates and
the tripwires still run on the **whole** branch diff, but `/code-review`,
`/security-review` and the 3b subagents receive `git diff <stage-3 sha>..HEAD`
only — the fix loop, the 3c fixes and the docs, which no reviewer has seen.
The effort level is set by the delta's size. The report names the mode and
the SHA (`reviewed: delta since <sha>`), and a finding here is a finding
about the fixes. Without a SHA the pass is the full one. The delta is where
the new findings are — fixes are written fast and introduce their own bugs —
while a full re-run pays a second time for the part already reviewed.

## Cost ceiling

| Limit | Default |
|---|---|
| concurrent subagents | 3 |
| files per subagent | 40 |
| diff lines per subagent prompt | 4000 |

Anything dropped by a cap is listed verbatim in the report. A gate that
silently reviews half a diff is worse than no gate, because it reads as a
pass.
