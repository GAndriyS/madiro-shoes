# Skill & agent authoring — distilled best practices

Checklist for designing any new piece of the harness. Sources: the
official skill-creator plugin, https://code.claude.com/docs/en/skills,
and the house conventions this harness's skills were built with.

Contents: Choosing the component type · Naming · Description · Body ·
Frontmatter fields · House style · Placement · Porting a skill between
repos · Verifying a new skill.

## Choosing the component type

| Type | Loaded | Choose it when |
|------|--------|----------------|
| **Skill** | On-demand, when Claude judges it relevant (or `/name`) | Domain knowledge or a workflow the main session should follow |
| **Agent** (`.claude/agents/*.md`) | Via the Agent tool, isolated context | Work that should not pollute the main context, or needs its own tool/model policy |
| **Command-style skill** | On `/name <args>` only | A user-initiated pipeline with arguments; add `disable-model-invocation: true` if it has side effects |
| **Rule / AGENTS.md** | Always | A convention that must apply to every turn, not a capability |

A skill that mostly says "launch these subagents" is an orchestrator —
keep it a skill (main session drives, human gates work) and put the
heavy lifting in agents.

## Naming

- kebab-case, ≤64 chars, letters/digits/hyphens only; no "claude" or
  "anthropic"; no leading/trailing/double hyphens.
- Directory name = skill name = the `/command` the user types. Pick a
  name the user would naturally type.
- When updating an existing skill, never rename it — versions live in
  `metadata.version`, not the name.

## Description — the triggering mechanism

The description is the only thing Claude sees before deciding to load
the skill. It competes with every other skill for attention.

- ≤1024 characters (hard limit, truncated beyond), no `<` or `>`.
- Formula: one sentence on **what it does** → **"Use when"** with
  literal user phrases in quotes (in English and in the chat language
  from `AGENTS.md → Harness profile → languages` when that is not
  English — the user types in it) → **negative routing**: "Not for X —
  use Y instead", naming the sibling skill or the cheaper tool.
- Focus on the user's *intent*, not the implementation. Generalize
  failures into intent categories; don't grow an ever-longer list of
  example queries.
- Be a little pushy — Claude undertriggers skills by default. But note:
  simple one-step queries may not trigger any skill even with a perfect
  description; skills reliably fire on complex, multi-step intent.
- Command-style skills open with the invocation signature:
  `/name <arg> [--flag]` — followed by what it drives.

## Body

- Under 500 lines. If it grows, add hierarchy: keep SKILL.md as the map
  and move detail into `references/*.md` with explicit pointers on when
  to read each file (Claude doesn't know a reference exists unless the
  body names it).
- Explain *why* behind each instruction instead of ALL-CAPS MUSTs — a
  rule with a reason generalizes; a bare rule gets pattern-matched and
  misapplied. Capslock and rigid structure are a yellow flag.
- Assume the model is smart: don't explain what a PDF or an HTTP request is;
  spend the lines on what's non-obvious about *this* repo or workflow.
- Set the right degree of freedom: freeform guidance for judgment tasks
  (review, analysis), pseudocode for preferred patterns, an exact
  script in `scripts/` for fragile mechanical steps (if every test run
  writes the same helper script, bundle it).
- Give an output template when the result must be scannable; pair it
  with "do not pad to fill the template".
- One place per fact: SKILL.md *or* a reference file, never both.

## Frontmatter fields worth knowing

| Field | Effect |
|-------|--------|
| `allowed-tools` | Tools usable without permission prompts while the skill runs |
| `disable-model-invocation: true` | Only the user can invoke (`/name`) — for side-effectful pipelines |
| `user-invocable: false` | Only Claude invokes — background knowledge, no slash command |
| `context: fork` + `agent:` | Body runs as the prompt of an isolated subagent |
| `model`, `effort` | Override model/effort while the skill is active |
| `metadata:` | Free-form — house style keeps `version` and `tags` here |
| `when_to_use` | Appended to the description in the skill listing (the pair shares a 1,536-char cap there) |
| `paths` | Glob patterns that auto-activate the skill when matching files are in play |
| `background` | With `context: fork` — the forked skill runs in the background |

Agents use `tools:`, `model:`, `effort:` instead of `metadata`.

Two facts beyond the table. `skillOverrides` in `.claude/settings.json`
can change any skill's visibility (`on` / `name-only` /
`user-invocable-only` / `off`) without touching its files — the only way to
restrict vendored skills whose files are hash-locked. And packaging for
claude.ai/API upload survives only `name`, `description`, `license`,
`compatibility`, `metadata`, `allowed-tools` — a skill relying on
`disable-model-invocation`, `user-invocable` or `context` is
Claude-Code-only (fine for this harness; the house
`metadata: {version, tags}` pattern survives packaging).

## House style

- `metadata: { version: N.N.N, tags: comma, separated }`; tag `command`
  for command-style skills.
- Once a skill declares a version, a `CHANGELOG.md` is required — a rule
  change is an architecture decision and needs a paper trail.
- Folder anatomy: `SKILL.md` (required), `references/`, `examples.md`,
  `README.md` (maintainer notes), `evals/` (`evals.json` + `fixtures/`)
  so a skill travels with its tests. Fixtures must never name their own
  planted bug in a comment.
- Bodies in English; reports in the language of the request; trigger
  phrases in the description in English and the project's chat language
  (`AGENTS.md → Harness profile → languages`).

## Placement

- **Project** (`.claude/skills/<name>/` — some projects keep the
  canonical copy in `.agents/skills/<name>/` with a `.claude/skills/<name>`
  symlink) — in git, travels with the repo, available to teammates and
  cloud sessions. Default for harness skills.
- **Personal** (`~/.claude/skills/<name>/`) — every project on this
  machine, but not version-controlled. For cross-project skills, prefer
  a dotfiles repo symlinked here.
- **Plugin** — only when distributing a bundle (skills + agents + hooks)
  to others; names become `/plugin:skill`.

## Porting a skill between repos

Moving a skill from one repo to another reliably produces these defect
classes:

- **CHANGELOG entries appended at the bottom** instead of newest-first —
  the most frequent defect.
- **Satellite files silently dropped** (an examples.md, a maintainer
  README) — and, with them, undocumented losses of whole mechanisms the
  original had (a cache, a baseline). When an omission is deliberate, record
  it in a README "Deliberate omissions" section — otherwise the next audit
  re-derives the intent from scratch.
- **Single tokens lost from enumerations** (a verdict name dropped from a
  list) — invisible until each enumeration is checked item-by-item against
  its consumers.

The audit that catches all three: diff the copy against the original file
by file; grep every factual claim against the current `AGENTS.md` and the
configs it describes; walk each contract with neighbouring skills in both
directions (what this skill promises them, what they expect of it).

## Verifying a new skill

1. Validate: kebab-case name, description length, no stray frontmatter
   fields, body < 500 lines.
2. Trigger test: 3-5 realistic should-trigger prompts (messy, specific,
   both languages) and 3-5 genuinely tricky should-NOT-trigger prompts —
   obviously-irrelevant negatives test nothing.
3. Output test: run the skill on a real task and compare against a
   baseline run without it; the skill must change the outcome, not just
   the tone. If it doesn't, cut it down or delete it.
