---
name: harness-setup
description: >-
  /harness-setup — one-time (and re-runnable) fitting of the sdd-harness to this
  project after `install.mjs` copied it in: derives the stack, slices, gates, CI file,
  VCS host, review template, languages and issue-key shape from the repo, asks the human
  only what the repo cannot answer, then fills AGENTS.md → Harness profile (merging
  AGENTS.harness.md when the project already had an AGENTS.md), harness/config.json, the
  project-conventions skill, .claude/settings.json, .mcp.json and the scripts/dev-session.mjs
  adapter, and proves the result with `node scripts/verify.mjs`. Use right after installing
  the harness, when the user says "set up the harness", "налаштуй харнес", "заповни профіль",
  or when `<TODO` markers remain in AGENTS.md or harness/config.json. Not for updating the
  framework files themselves — that is `node <sdd-harness>/install.mjs <project> --update`.
metadata:
  version: 1.0.0
  tags: harness, setup, onboarding, profile, meta, command
---

# harness-setup

The installer copied two kinds of files (`harness/.sdd-harness.json` lists the first):

- **framework files** — agents, process skills, `harness/*/README.md`, `scripts/verify.mjs`,
  `scripts/check-specs.mjs`. They carry no project fact and get refreshed by `--update`.
  **Do not edit them here**; a local edit becomes an update conflict.
- **project files** — `AGENTS.md` (or `AGENTS.harness.md`), `harness/config.json`,
  `harness/specs/BACKLOG.md`, `.claude/skills/project-conventions/`, `.claude/settings.json`,
  `.mcp.json`, `.env.example`, `scripts/dev-session.mjs`, `INSIGHTS.md`. Every `<TODO …>`
  marker in them is yours to replace.

Every framework file reads project facts from `AGENTS.md → Harness profile` and
`harness/config.json`. A wrong value there misroutes every agent, so a value is either
**derived from a file you can cite** or **answered by the human** — never guessed.

## Step 1 — Inventory

```bash
git ls-files | head -200
rg -n "<TODO" AGENTS.md AGENTS.harness.md harness/config.json .claude/skills/project-conventions scripts/dev-session.mjs
git remote -v
git log --format=%s -30
git branch -a --format='%(refname:short)' | head -30
```

Then read what exists among: the package manifest(s) and their scripts (`package.json`,
`pyproject.toml`, `go.mod`, `*.csproj`, …), workspace config (`angular.json`, `nx.json`,
`pnpm-workspace.yaml`, `turbo.json`, …), the CI file (`.github/workflows/*.yml`,
`.gitlab-ci.yml`, …), lint/format configs, the test runner config, `.claude/launch.json`,
review templates (`.github/pull_request_template.md`, `.gitlab/merge_request_templates/`),
i18n catalogues, OpenAPI/Swagger files or URLs in env config, the existing `AGENTS.md` /
`CLAUDE.md` / `README.md`.

## Step 2 — Derive the profile

Fill a draft of every key from the evidence, each with its locator:

| Key | Derive from |
|---|---|
| `stack` | manifests, workspace config, test runner config |
| slices (`harness/config.json`) | workspace projects / packages that CI checks; one slice per independently linted-tested-built unit |
| gates per slice | **the CI file's commands**, verbatim, in CI order — not what you think a gate should be. Test gates get `"test": true` |
| `ci-config` | the CI file you mirrored |
| `issue-key` + `issueKey` regex | ticket ids in branch names and commit subjects (`ABC-123`) |
| `branch-naming`, `base-branch` | branches, `git symbolic-ref refs/remotes/origin/HEAD` |
| `vcs-host`, `review-unit`, `vcs-cli` | the remote host: github.com → PR + `gh`; a GitLab host → MR + `glab`. Check the CLI is installed and authed (`gh auth status` / `glab auth status`) |
| `review-template` | the template file, or `none` |
| `languages` | commit subjects, existing docs and UI catalogue language |
| `docs-dir`, `insights` | existing `docs/`; one `INSIGHTS.md` per app slice plus the root |
| `api-contract` | OpenAPI files, Swagger URLs in env config or README |
| `i18n` | catalogue files and the i18n library |
| `browser-qa` | dev-server scripts and ports (`.claude/launch.json`, manifest scripts) |
| `do-not-touch` | deployment-owned paths (Helm charts, Dockerfiles, infra), vendored code, generated code |

## Step 3 — Ask what the repo cannot answer

One `AskUserQuestion` round (≤ 4 questions), each with your derived default as the
first, `(Recommended)` option and the evidence in its description. Typical gaps:

1. Issue tracker and whether agents may write to it (default: read-only).
2. Languages for chat/specs/plans/commits vs docs, and the EARS keyword set.
3. Design source (Figma or none) and browser QA (none · local dev server only · dev backend
   with QA accounts → session broker).
4. `do-not-touch` paths beyond the ones you found.

Skip a question the evidence already settles. A second round only if an answer opens a
new gap.

## Step 4 — Write the project files

1. **AGENTS.md.** If `AGENTS.harness.md` exists, the project already had an `AGENTS.md`:
   keep every line of it and add, from the template, the sections it lacks — `## Harness
   profile`, `## Invariants`, `## Before answering`, the harness bullets of `## Conventions`
   and `## Use when` — rewording nothing of the project's own text; then delete
   `AGENTS.harness.md`. Otherwise fill the template in place. Replace every `<TODO …>`;
   delete a line whose capability is `none` rather than leaving it vague. Make sure
   `CLAUDE.md` contains `@AGENTS.md`.
2. **harness/config.json** — `issueKey` and `slices` with `path` and `gates`.
3. **project-conventions** — fill from the lint/format configs and the code layout, every
   rule with its why and the config that enforces it. Thin is fine; invented is not.
   If the project vendors framework skills (e.g. from `skills-lock.json`), name them in
   `framework-skills`.
4. **.claude/settings.json** — add `Edit(./<path>/**)` and `Write(./<path>/**)` deny pairs
   for every `do-not-touch` path; allow the gate commands agents run often. Keep
   `Read(./.env)` denied.
5. **Browser QA.** `none` → remove `chrome-devtools` from `.mcp.json`, delete
   `scripts/dev-session.mjs`, `.env.example` and their allow rule. Dev server only → keep the
   MCP, delete the broker. With QA accounts → fill the `APPS` adapter in
   `scripts/dev-session.mjs` from the app's real auth flow (read its login code and the API
   contract; pick `tokenInLocalStorage` or `cookieSession`, or write a third strategy), and
   list the `QA_<APP>_<ROLE>_*` keys in `.env.example`. **Never read `.env` or ask for a
   password** — the human fills `.env` themselves.
6. **INSIGHTS.md** — copy the root skeleton to each app slice listed in `insights`.

## Step 5 — Prove it

```bash
node scripts/verify.mjs --list
node scripts/check-specs.mjs
node scripts/verify.mjs
rg -n "<TODO" AGENTS.md harness/config.json .claude/skills/project-conventions scripts .env.example .mcp.json
```

A failing gate is not a setup failure if it fails the same way in CI — record it as a known
pre-existing failure in the report. A gate that fails because its command is wrong is
yours to fix.

## Report

```
## Harness setup — <project>
Profile: <key> = <value> (← <locator> | human-answered) … one line per key
Slices: <name> (<path>): <gates>
Verify: <the verify.mjs summary line> · pre-existing failures: <list or none>
Asked: <questions and answers, or "none — the repo answered everything">
Left: <remaining <TODO markers or none>
Next: review `git diff`, commit ("harness: install sdd-harness <version>"), restart Claude Code
so it loads the new agents, skills and MCP servers (MCP args are read at session start),
then fill `.env` with QA accounts if browser QA uses them.
```

Do not commit — the human reviews the diff first.
