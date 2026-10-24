# Agents

Subagents the main session delegates to. They live in `.claude/agents/`. A
project may keep the canonical files in `.agents/agents/` with `.claude/agents`
as a symlink to that directory (the same scheme as `.agents/skills/`), or keep
plain files in `.claude/` — `AGENTS.md` says which layout this project uses
and, for the symlink layout, how to repair a checkout where the links arrived
as text files. Each agent is an isolated context with an explicit tools
allowlist and a prompt shaped as *hard constraints → method → report format →
output discipline*.

## Catalog

| Agent | Model | Tools | Owns | May not |
|---|---|---|---|---|
| [spec-creator](spec-creator.md) | opus | Read, Grep, Glob, Bash, Write, Edit | Feature specs in `harness/specs/` — EARS ACs, edge cases, design review, interview/research gates | Write anywhere else; specify implementation; load skills |
| [researcher](researcher.md) | opus | Read, Grep, Glob, Bash, WebSearch, WebFetch | Cited facts with locators — repo behaviour and external docs | Change anything; enforce rules it quotes |
| [implementation-planner](implementation-planner.md) | opus | Read, Grep, Glob, Bash, Write, Skill | Plans in `harness/plans/` — requirements review, interview, Steps table with DAG and skills routing | Write specs or code; `Edit`; run tests; invent acceptance criteria |
| [implementer](implementer.md) | sonnet | Read, Edit, Write, Grep, Glob, Bash, Skill | Executing a named plan wave by wave; verification via `verify.mjs`; deviations reported | Commit, push, open an MR/PR; do-not-touch paths; architecture/security verdicts |
| [plan-verifier](plan-verifier.md) | opus | Read, Grep, Glob, Bash | One verdict per plan requirement with a locator; unrequested changes; conformance verdict | Edit anything; style findings; load skills (deliberately no `Skill`) |
| [doc-writer](doc-writer.md) | opus | Read, Edit, Write, Grep, Glob, Bash, Skill | Docs of implemented behaviour in the docs directory (`AGENTS.md → Harness profile → docs-dir`) / READMEs; grounded diagrams | `AGENTS.md` rules and `INSIGHTS.md` entries (proposes only); specs; commit |
| [test-writer](test-writer.md) | sonnet | Read, Edit, Write, Grep, Glob, Bash, Skill | Tests placed per the project's stack and conventions skill, against spec `AC-N`; real exit codes | Production code; weakening tests; new dependencies; commit. **Off the default `/implement` chain** — delegated by hand |

The chain is orchestrated by the `/implement` skill
(`.claude/skills/implement/`); run state lives in `harness/sdd/`. The final
gate before an MR/PR is `/mr-self-review`; the knowledge loop is
`/engineering-insights` (the `INSIGHTS.md` files in `AGENTS.md → Harness
profile → insights`) and `/workflow-retro` (`harness/retro/ledger/`).

## Design rules

These are the rules that make the system predictable. Each carries its "why",
because a prohibition without one is a prohibition the next model talks itself
out of.

### Nobody calls anybody

No agent holds the `Agent` tool, so no agent can delegate to the next one.
This is a deliberate choice, not a platform guarantee: every agent returns a
report and the decision "what happens next" always sits in the main session,
where the human can see it. `AskUserQuestion` is unavailable to subagents in
principle, so interviews are a **two-pass handshake**: the agent returns an
`## Interview required` / `## Research required` block, the main session asks
the human or fans out `researcher` runs in parallel, and continues the same
run via `SendMessage` with the answers.

### Every delegation carries four parts

`/implement` bakes these into its briefs; ad-hoc delegations (a researcher
fan-out, a one-off run) must carry them by hand, because a delegation missing
one is how agents duplicate work or wander: an **objective**, the **output
format expected back** (usually the agent's own report template — name any
deltas), **source/tool guidance** (where to look first, what to prefer), and
**boundaries** (what *not* to do because a sibling owns it). Size the fan-out
to the question: a single locatable fact is one `researcher` and a few tool
calls; parallel runs are for genuinely independent questions, never for one
question asked three ways.

Eight relay rules:

- **A delegation from a feature branch states how the work relates to it.**
  One line — «builds on `<branch>`, unmerged MR/PR <n>» or «independent of
  `<branch>`» — never a guess like "unrelated". A brief that calls a parent
  feature unrelated while the plan's seams live on it produces a plan that
  branches from the wrong base, and every later gate re-asks about the base.

- **An `Agent` call that dies on a 5xx/529 is re-issued once on another
  model with the same prompt before the human hears about it**, and the
  prompt carries the spec/plan *path*, never the ACs pasted in. API errors
  are transient and often model-specific; each "Try again" round handed to
  the human costs a turn, and an inlined prompt makes every retry re-read
  everything it pasted.

- **A repo claim in a brief carries a locator or the prefix `unverified:`.**
  An unlocated premise ("feature X exists") fails the receiving agent's repo
  check and costs a sweep; a marked claim gets a targeted check instead.
- **Before delegating a structural spec operation** (split, supersede, new
  id), grep `harness/specs/README.md` for the governing rule and quote it in
  the brief — or do not delegate. A delegation that contradicts a rule such
  as "one ticket — one spec" burns a whole round on work the rule forbids.
- **When relaying a planner interview, the execution-mode question rides in
  the first `AskUserQuestion` round** — drop the weakest requirement question
  to Open questions instead. The 4-question UI cap otherwise pushes the mode
  into an extra round.
- **A rate-limited or truncating source belongs to one researcher**; parallel
  siblings cite its findings as external input. Siblings that each hit the
  same truncated source duplicate the same workaround and pay for it twice.
- **An interview option that names an API endpoint or field is checked
  against the contract in `AGENTS.md → Harness profile → api-contract`
  before the question reaches the human**, and the question says what that
  endpoint returns today. An option checked only after the human picks it
  can turn out not to carry the needed field; the spec then ships with a
  `Deferred:` line, the human reverses the decision, and a spec run plus a
  gate are spent on a fact one query over the contract had. When
  `api-contract` is `none` for the slice, the question says the option is
  unchecked.
- **After an interrupted agent that holds `Write`/`Edit`, the first thing
  you run is `git status --porcelain`** — before any sentence about the
  tree. An interrupt lands *after* the writes that already happened: an
  agent cut off mid-report may already have changed files, and a claim that
  nothing was left half-written is a guess until the tree says so.

### Skills are not preloaded

The frontmatter `skills:` field exists, but no agent here uses it. Preloading
is paid on every invocation whether or not the run needs the rulebook —
standing context that mostly buys distraction. Loading via the `Skill` tool
happens at the moment the model is about to apply a rule, which is exactly
when it is worth the tokens. Two agents (`researcher` and `plan-verifier`) do
not hold `Skill` at all — that is also a lever: a verifier holding a rulebook
becomes a second code-reviewer, and a researcher holding one starts enforcing
what it should be citing.

### Read-only is an allowlist, not a list of tricks

Reading agents hold no `Edit`/`Write`, and their `Bash` section names the
commands that *are* allowed (inspection only). A list of banned workarounds —
redirects, `tee`, `sed -i`, `node -e` — is never finished; the allowlist
closes all of them at once. The **Files touched** section of each report is
how a reviewer audits that the scope held.

### Never copy an enforceable fact into a prompt

Rule names, script flags, config paths — everything machine-checked drifts
silently the day someone edits the config. A prompt names the file the agent
can read (the lint config named in `AGENTS.md → Commands`,
`harness/specs/README.md`, `harness/config.json`, `scripts/verify.mjs`) and
the command to check it, never the fact itself. The corollary: when prose and
a check disagree, the check wins, and the disagreement is a finding.

### `description` is a trigger, not a summary

The frontmatter description sits in the main session's context permanently.
Its job is routing: what the agent does, when to use it, and — just as
important — a "Not for X" clause naming the cheaper alternative, because bad
delegations cost more than under-specified ones.

### Permissions philosophy

Machine-denied (`.claude/settings.json`): the do-not-touch paths in
`AGENTS.md → Harness profile → do-not-touch` — deployment-owned files,
vendored skills and the like. Those are project-wide because they hold for
the human's session too. Prompt-enforced: `git commit`, `git push` bans in
agent prompts — a project-wide deny would block the main session's own
commits. Since the prompt is the only guard there, the ban always states its
reason, and reports carry a **Files touched** audit trail. Hooks are
deliberately absent: a hook is a third moving part (script, trust prompt,
invisible failure). If prompts stop sufficing, the answer is one hook, not a
longer list of banned tricks.

## Writing a new agent

Frontmatter: `name`, `description` (with the "Not for" clause), `tools`
(minimal allowlist), `model` (opus only where judgement is the product and
nothing downstream catches a bad call — otherwise sonnet). The platform
offers more fields — `skills` (preload), `memory`, `permissionMode`,
`maxTurns`, `effort` — and this house uses none of them **on purpose**:
preloading conflicts with "Skills are not preloaded" above, per-agent memory
is an uncurated third knowledge channel next to `INSIGHTS.md` and the retro
ledger, and the rest add machinery no observed failure has asked for. A new
agent that wants one of these fields is a design-rule change, not a
frontmatter tweak. Body: hard
constraints first, then the method as numbered steps, then the exact report
format as a fenced template, then output discipline ("the report is your
return value"). Explain the why behind each constraint. Before adding an
agent, check the task is not already covered by a skill (knowledge the main
session applies) or a one-off delegation.
