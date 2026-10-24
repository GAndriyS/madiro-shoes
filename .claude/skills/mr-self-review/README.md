# mr-self-review — maintainer notes

What the gate does is in [SKILL.md](SKILL.md); this file records why it is
shaped the way it is, so the next audit does not have to re-derive it.

## The two design decisions worth defending

**The gate owns the severity scale.** Sub-reviewers classify against the one
table in [routing.md](routing.md), whatever their routed skill calls its
levels. The load-bearing part is that a CRITICAL must state a production
consequence — without that rule, "violates the naming convention" would
block merges, and the gate would be switched off within a week.

**It delegates rather than reimplements.** `/code-review` and
`/security-review` find bugs; this skill slices, routes, subtracts waivers
and decides. Anything it reimplemented would drift from the tool it copied.

## Invocation — manual, on purpose

The framework ships no hooks at all — deliberately: a prompt-level rule
carries its "why", and a hook is a third moving part. Not even a ready-made
hook example ships with this skill — a framework-wide rule is stronger than
a skill-local one. Run `/mr-self-review` by hand before opening an MR/PR.

## Turning blocking on

Flip `mode:` in [routing.md](routing.md) to `blocking`, bump
`metadata.version`, note it in [CHANGELOG.md](CHANGELOG.md). Nothing reads
the stamp (`.git/mr-self-review.json`) today; it exists so a future CI job
or stamp validator can hold a merge on a fresh passing stamp without
changing this skill. Flip only after a few real MRs/PRs have shown the
finding quality.

## Deliberate omissions

- **No findings cache** — no need at typical diff sizes. Revisit if
  reviews get slow or expensive; the invalidation rule (any routed skill's
  version or routing.md changing) comes with it.
- **No baseline file** — grounding (SKILL.md, stage 3b) already keeps
  pre-existing findings from blocking; a baseline would be a second
  mechanism for the same guarantee, plus a file that rots.
- **No enforcement layer** (hook, gate-check script, CI gate) — the
  framework-wide no-hooks rule; the stamp is the extension point.
- **No auto-fix.** Applying fixes and gating the same change in one pass
  makes the verdict untrustworthy. Fix, then re-run.
- **No LLM review in CI.** Local, on-purpose invocation only — the same
  reasoning as manual invocation, applied to the pipeline.
