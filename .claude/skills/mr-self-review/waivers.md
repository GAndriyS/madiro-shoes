# Waivers

A gate with no way to disagree with it gets deleted the first time it is wrong
at an inconvenient hour. This is the escape valve — deliberately narrow, and
deliberately visible.

## The rule

**A waiver needs a reason. A waiver without a reason does not count**, and is
itself reported as a finding. The reason is the entire point: it turns "I
silenced this" into "I considered this and here is why it is fine", and it puts
that sentence in front of the reviewer.

Every applied waiver appears in the run report **and** in the drafted MR/PR
body. Waivers are never silent.

## Inline waiver

For a one-off, within two lines of the finding:

```ts
// mr-gate-ignore: no-alert — the URL is collected via window.prompt; replacing it with a dialog is a separate task
const url = window.prompt('Enter an HTTPS link');
```

Format: `mr-gate-ignore: <rule> — <reason>`, in the file's own comment
syntax. The rule name is whatever the finding reported. Reasons like "false
positive", "not applicable" or "fine" do not count — say what makes it fine.
(Note: a linter's own suppression comment that carries a reason — e.g.
`eslint-disable-next-line <rule> -- <reason>` — serves the same purpose for
lint-rule findings and is honoured the same way.)

## Standing waiver

For something cross-cutting that will not be fixed this week, add a row here.
Standing waivers cost more than inline ones on purpose: they outlive the person
who added them, so they carry a date and get reviewed.

| Rule | Path glob | Reason | Added |
|---|---|---|---|
| _(none yet)_ | | | |

## Three strikes

A rule waived three or more times across runs is flagged in the report.

That is not a nag — it is a signal that the rule is probably wrong. At that
point the fix is one of two things, never a fourth waiver:

- **The rule is wrong** → change it in the skill that owns it (or the lint
  config named in `AGENTS.md → Commands` for a lint rule), bump that skill's
  `metadata.version`, note it in its CHANGELOG.
- **The code is wrong** → fix the code and drop the waivers.

An exception list is a ratchet that shrinks, not a place to put things.
