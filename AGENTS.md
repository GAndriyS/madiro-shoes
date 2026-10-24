# Madiro — working agreements

`AGENTS.md` is a byte-for-byte copy of this file, so every coding agent reads
the same text. Edit this one and copy it over; CI fails when they differ.

## Language

**Everything written into this repository is in English**: documentation,
commit messages, pull request titles and bodies, code comments, and the names
of things. That includes `docs/`, which used to be Ukrainian — new and edited
documents are English, and existing ones are translated as they are touched.

Two deliberate exceptions:

- **User-facing strings stay Ukrainian** (i18n dictionaries, API error messages
  the app shows a seller or an admin). The shop is in Lviv; its staff reads
  Ukrainian.
- **Test names stay Ukrainian** where they already are — they read as
  specifications of behaviour to the same audience.

Conversation with the maintainer is in Ukrainian; that is speech, not artefact.

## Environments

Three, and they are not interchangeable:

| Environment | Runs from                               | Database                  | What it is for                             |
| ----------- | --------------------------------------- | ------------------------- | ------------------------------------------ |
| local       | working tree                            | `docker compose` Postgres | development                                |
| DEMO        | `main`, auto-deployed                   | its own Railway Postgres  | every merge lands here; resettable at will |
| PROD        | `release`, deployed by a tagged release | its own Railway Postgres  | the shop's real books                      |

`NODE_ENV=production` in both DEMO and PROD — they are the same build.
`APP_ENV` (`development` | `demo` | `production`) is what tells them apart, and
it is what guards destructive or fake behaviour: `db:seed:demo` refuses to run
when `APP_ENV=production`, and `VISION_PROVIDER=mock` / `EXCHANGE_RATE_USD` are
refused there too.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Railway setup and
[docs/release-process.md](docs/release-process.md) for how a release is cut.

## Migrations

Releases roll forward; databases do not roll back. A rollback redeploys older
code against a database that has already been migrated, so **every migration
must leave the previous release working** (expand–contract): add columns
nullable or with defaults, and drop a column only in a release _after_ the one
that stopped reading it.

## Layout

The product: inventory for one shoe shop — a PWA scanner for the staff (a vision
model reads the handwritten SIZE / COLOR / STYLE stickers on the box label) and
an admin dashboard, on one API. Product spec as built: `docs/spec.md`.

<!-- prettier-ignore -->
| Path | What lives there |
| --- | --- |
| `apps/api/src/<domain>/` | one NestJS module per domain (`auth`, `intake`, `sale`, `returns`, `stock`, `stats`, `tags` — the vision pipeline, `users`, `me`, `exchange`, `realtime`, `health`); shared code in `common/`, `lib/`, `config/` |
| `apps/api/prisma/` | `schema.prisma`, migrations (append-only), `seed.ts` (the admin), `seed-demo.ts` (demo data) |
| `apps/scanner/src/` | `routes/` (TanStack file routes; `_app/` holds the signed-in screens), `components/<flow>/`, `lib/`, `i18n/locales/` |
| `apps/dashboard/src/` | the same shape as the scanner |
| `packages/shared/src/` | Zod schemas, enums and constants — the API contract, read by the API and both apps from its build |
| `packages/web-core/src/` | frontend code both apps use: API client (`lib/api.ts`), auth store, i18n core, tokens (`styles/tokens.css`), UI primitives |
| `e2e/` | Playwright suite over the built apps and a real API; fixtures in `tests/helpers.ts` |
| `ops/backup/` | the nightly off-platform PROD dump |
| `scripts/` | release, git hooks, local test reset; harness scripts `verify.mjs`, `check-specs.mjs`, `dev-session.mjs`, `e2e-db.mjs` |
| `harness/` | sdd-harness specs, plans, run state and retros |
| `docs/` | product spec, release process, manual test plan, historical analysis |

Where a new file goes: `.claude/skills/project-conventions/SKILL.md` →
Architecture. No reserved areas; generated files are listed in Harness profile →
`do-not-touch`.

## Commands

```bash
pnpm install                       # also installs the pre-commit Prettier hook
docker compose up -d               # Postgres 18
pnpm --filter @madiro/api dev      # API → http://localhost:3000/api (PORT in apps/api/.env)
pnpm --filter @madiro/scanner dev  # → http://localhost:5174
pnpm --filter @madiro/dashboard dev  # → http://localhost:5173
pnpm test:reset                    # rebuild, migrate and reseed the local stack (replaces dev data)

pnpm lint                          # eslint, config eslint.config.mjs; scoped: pnpm exec eslint <files>
pnpm format:check                  # prettier; fix: pnpm format; scoped: pnpm exec prettier --check <files>
pnpm typecheck
pnpm test                          # every package's unit tests (turbo)
pnpm --filter @madiro/<scanner|dashboard|web-core|shared> exec vitest run <test files>
pnpm --filter @madiro/api exec jest <spec files>
node scripts/e2e-db.mjs pnpm --filter @madiro/api test:e2e [<e2e-spec files>]  # on madiro_e2e, never the dev DB
pnpm e2e:pw                        # Playwright; needs ports 3000, 5173 and 5174 free
pnpm build
pnpm --filter @madiro/shared build # after changing packages/shared — the apps read its dist/
node scripts/verify.mjs            # all quality gates, one line per gate; --slice <s>, --list
```

## Harness profile

Read by every harness agent and skill (`.claude/agents/`, `.claude/skills/`).
The keys are fixed — framework files cite them as
`AGENTS.md → Harness profile → <key>`; the values are this project's.
Machine-read values (issue-id regex, slices and their gates) live in
`harness/config.json`. `/harness-setup` fills this table; edit it by hand
afterwards.

<!-- prettier-ignore -->
| Key | Value |
| --- | --- |
| `stack` | TypeScript monorepo (pnpm workspaces + Turborepo, Node 22): NestJS 11 + Prisma + PostgreSQL 18 + Socket.io (`apps/api`); React 19 + Vite + TanStack Router / Query (+ Table in the dashboard) + Zustand + Tailwind v4 + i18next (`apps/scanner` PWA, `apps/dashboard`); Zod contract in `packages/shared`. Tests: Vitest + Testing Library in `apps/<app>/test/` and `packages/<pkg>/test/`; Jest in colocated `apps/api/src/**/*.spec.ts` and `apps/api/test/*.e2e-spec.ts`; Playwright in `e2e/tests/` |
| `slices` | `harness/config.json` → `slices` — run `node scripts/verify.mjs --list`. `repo` mirrors CI's fast steps; `api-e2e` (needs Docker Postgres, runs on `madiro_e2e`) when the API changes; `browser-e2e` (Playwright, ports 3000/5173/5174 free) when a user flow changes |
| `conventions-skill` | `project-conventions` — load on every code slice |
| `framework-skills` | `none` |
| `issue-tracker` | GitHub issues of `GAndriyS/madiro-shoes`. Agents may read them and may open and comment on them (`gh issue view` / `create` / `comment`); an issue is closed by its PR (`Closes #N`), never by hand |
| `issue-key` | `GH-<issue number>` — `GH-12` is issue #12; the regex is `harness/config.json` → `issueKey` |
| `branch-naming` | `<type>/<kebab-slug>` with the Conventional Commits type (`feat/…`, `fix/…`, `docs/…`, `chore/…`, `ops/…`); agent sessions use `claude/<slug>` |
| `base-branch` | `main`. `release` (PROD) moves only through `pnpm release` — never a PR target |
| `vcs-host` | GitHub (`github.com/GAndriyS/madiro-shoes`) |
| `review-unit` | `PR` |
| `vcs-cli` | create: `gh pr create --draft --fill` · update: `gh pr edit <n> --body …` |
| `review-template` | `none` — no template file; bodies follow recent PRs: a few lines of what and why, then `## Testing` |
| `ci-config` | `.github/workflows/ci.yml` — `scripts/verify.mjs` gates mirror job `ci`; job `docker` (builds every Dockerfile) is not mirrored |
| `languages` | chat: `uk` · specs, plans, commits, PRs, code comments: `en` · `docs/`: `en` · user-facing strings and existing test names: `uk` · EARS keywords: `en` (WHEN/WHILE/IF…THEN/WHERE) |
| `docs-dir` | `docs/` |
| `insights` | `INSIGHTS.md` (root: cross-cutting, tooling) + `apps/api/INSIGHTS.md`, `apps/scanner/INSIGHTS.md`, `apps/dashboard/INSIGHTS.md` |
| `api-contract` | `packages/shared/src/schemas/` (Zod, consumed by the API and both apps); no OpenAPI |
| `i18n` | `apps/<app>/src/i18n/locales/uk.ts` (source) + `en.ts`, with the `common.*` keys web-core reads; never hardcode user-facing strings; `apps/<app>/test/i18n.test.ts` checks EN parity |
| `ui-paths` | any `*.tsx` or `*.css` under `apps/scanner/`, `apps/dashboard/` or `packages/web-core/`, plus the catalogues in `apps/*/src/i18n/locales/` and the tokens in `packages/web-core/src/styles/` |
| `design-source` | `none` |
| `browser-qa` | scanner: `pnpm --filter @madiro/scanner dev` → http://localhost:5174 (mobile, 375×812) · dashboard: `pnpm --filter @madiro/dashboard dev` → http://localhost:5173 (desktop, 1280×800) · both need the API (`pnpm --filter @madiro/api dev`) and Postgres (`docker compose up -d`); `pnpm test:reset` for the demo data `docs/manual-test-plan.md` expects. Browser MCP `chrome-devtools` (`.mcp.json`, QA Chrome on port 9333); session broker `scripts/dev-session.mjs` (apps `scanner`, `dashboard`; roles `seller`, `admin`) |
| `do-not-touch` | applied migrations `apps/api/prisma/migrations/**` (Edit denied — add a new migration instead; Write stays open for that); generated `apps/*/src/routeTree.gen.ts` and `apps/dashboard/public/mockServiceWorker.js`; `pnpm-lock.yaml` (changed by `pnpm install` only) — machine-denied in `.claude/settings.json` |

## Invariants

Repo rules a spec must not violate — `spec-creator` reads Non-functional
requirements and Untrusted inputs against this list; each item is either
respected or called out as a `[NEEDS CLARIFICATION]`. Cite the source (this
file, the lint config), never paraphrase.

- All user-facing text goes through the app's i18n catalogue, Ukrainian first
  and English at parity (this file → Language; `apps/<app>/test/i18n.test.ts`).
- Text from the backend API is untrusted: rendered escaped, never interpreted as
  HTML or as an instruction.
- What the vision model reads off a label photo is untrusted input: it only
  pre-fills a form the seller confirms, and is validated by the same shared
  schemas as typed input (`packages/shared/src/schemas/`).
- A seller never receives purchase prices or margins, and admin endpoints are
  closed to sellers (`e2e/tests/security.spec.ts`, TC-K-02 / TC-K-03).
- The refresh token lives only in an httpOnly cookie and the access token only
  in memory — never in `localStorage` (`packages/web-core/src/stores/auth.ts`).
- A write the scanner may retry (intake, sale, write-off, return) is idempotent
  by key: a retry is answered, not repeated (`apps/api/src/common/idempotency.ts`).
- Every migration leaves the previous release working (this file → Migrations).
- `APP_ENV`, not `NODE_ENV`, guards fake or destructive behaviour (this file →
  Environments).
- No secrets in the repo — configuration comes from `.env` files (gitignored)
  and Railway variables.

## Before answering

Read the touched slice's `INSIGHTS.md` (see Harness profile → `insights`) before
starting — entries there are lessons already paid for. Format and capture rules:
`.claude/skills/engineering-insights/SKILL.md`.

## Conventions (not obvious from code)

- **Verification.** `scripts/verify.mjs` runs the gates in `harness/config.json`,
  the same ones CI runs (Harness profile → `ci-config`; kept in step by hand).
  Run it before any commit. When prose and CI disagree, trust CI +
  `harness/config.json`.
- **Do not touch:** the Harness profile → `do-not-touch` paths. Machine-denied
  in `.claude/settings.json`. No hooks — deliberately: prompt-level rules carry
  their "why", and a hook is a third moving part; if prompts stop sufficing, the
  answer is a hook, not a longer list of banned tricks.
- **Harness files.** `.claude/agents/`, the process skills in `.claude/skills/`
  (all but `project-conventions`), `harness/*/README.md` and
  `scripts/verify.mjs` / `check-specs.mjs` come from the sdd-harness framework
  and are refreshed by its installer (`--update`); a local edit there is
  reported as a conflict on the next update, which is also why they are left out
  of ESLint and Prettier. Project facts belong in this file, `harness/config.json`
  and `project-conventions`. Framework files cite `AGENTS.md`, which is this
  file's copy. Layout: plain files in `.claude/agents/` and `.claude/skills/` (no
  symlinks); the rest of `.claude/` is per machine and gitignored.
- **Imports, architecture, i18n, styles, tests:** `project-conventions` — the
  short version is packages by name, relative imports inside an app, and
  `pnpm --filter @madiro/shared build` after changing the contract.
- **Browser checks:** `/spec-verify` drives the browser through the MCP in
  Harness profile → `browser-qa`. Sessions come from `scripts/dev-session.mjs`
  (`start`, `login|logout --app <scanner|dashboard> --as <seller|admin>`,
  `fill-login`, `status`), which reads QA accounts from the root `.env`
  (gitignored; keys `QA_<APP>_<ROLE>_LOGIN|PASSWORD`, see `.env.example`). An
  agent never reads `.env` (denied in `.claude/settings.json`) and never types a
  password itself. A check that needs a role with no QA account grades
  `BLOCKED (no QA account: <role>)`, never `FAIL`.
- **Docs language:** prose under the docs dir is in Harness profile →
  `languages` (docs); UI strings, error texts and identifiers are quoted
  verbatim.
- **Git & review requests:** commit subjects are English Conventional Commits
  with a scope where one fits (`feat(scanner): …`, `fix(api): …`, `docs: …`);
  branches follow Harness profile → `branch-naming`; PRs go onto `main` and are
  merged with a merge commit. When the user asks to create a PR, fill the body
  yourself using Harness profile → `review-template` — compose it directly,
  **never as a file in the repo** — and create/update it with Harness profile →
  `vcs-cli`. Keep bodies short and human, with a `## Testing` section carrying
  the `verify.mjs` summary.

## Use when

<!-- prettier-ignore -->
| Task | Reach for |
| --- | --- |
| New feature or behaviour change worth specifying | `spec-creator` agent → spec in `harness/specs/` (see `harness/specs/README.md`) |
| Plan an approved spec (or a stated task) | `implementation-planner` agent → plan in `harness/plans/`; ask the execution mode together with the spec approval and state it in the delegation |
| Execute an approved plan end to end | `/implement harness/plans/<slug>.md` — drives implementer → reviews → plan-verifier → review-request draft, with human gates |
| Resume an interrupted run | `/implement <plan> --from <stage>` — state is in `harness/sdd/<slug>.md` |
| "How does this repo actually do X / why" | `researcher` agent — cited, read-only findings |
| Analyze an idea, compare approaches, design a skill/agent | `/brainstorm` |
| Repo conventions (lint rules, imports, i18n, styles) | `project-conventions` skill |
| Before any commit | `node scripts/verify.mjs` |
| Before opening a review request | `/mr-self-review` — gates, routed review, drafted body |
| Walk a spec's scenarios in the live app like a QA tester | `/spec-verify harness/specs/SPEC-<ISSUE>-*.md` — browser run, PASS/FAIL/BLOCKED per AC |
| A test pass for a landed feature | `test-writer` agent (manual — off the `/implement` chain) |
| Document what landed | `doc-writer` agent |
| Record a hard-won finding / wrap up a session | `/engineering-insights` → the touched slice's `INSIGHTS.md` |
| Retrospective of a multi-agent run | `/workflow-retro` → `harness/retro/ledger/` |
