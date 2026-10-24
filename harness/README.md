# Harness

The process layer of the SDD (spec-driven development) harness — the committed
artifacts through which stages hand work to each other without retelling it in
chat. The *knowledge* layer lives in `.claude/skills/`, the *executors* in
`.claude/agents/`; this folder holds what they produce and read.

| Folder | What lives here | Written by |
|---|---|---|
| [specs/](specs/README.md) | Feature specs — `SPEC-<ISSUE>` (id = the ticket, `AGENTS.md → Harness profile → issue-key`), EARS acceptance criteria, lifecycle `draft → approved → implemented`; the index is `specs/BACKLOG.md` | `spec-creator` (linted by `scripts/check-specs.mjs`) |
| [plans/](plans/README.md) | Implementation Plans — requirements review, Steps table with DAG, never overwritten | `implementation-planner` |
| [sdd/](sdd/README.md) | `/implement` run state — stage table with token costs, handoff brief; read by `--from` to resume | the main session |
| [retro/](retro/README.md) | Workflow retrospectives ledger | `/workflow-retro` |

Three files here belong to the project, not the framework, and a framework
update never overwrites them: `config.json` (the `issueKey` regex and the
`slices` with their gates, read by `scripts/verify.mjs` and
`scripts/check-specs.mjs`), `specs/BACKLOG.md` and `retro/README.md` (its
ledger table grows with every retro). So does everything a run writes:
specs, plans, `sdd/` run files, `retro/ledger/` entries.

Everything here is committed on purpose: a reviewer compares what the branch
set out to do (spec, plan) against what the diff does, and a new chat resumes
from the run files instead of the scrollback.
