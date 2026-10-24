---
name: project-conventions
description: >-
  Madiro's own conventions — the lint and Prettier contract, packages imported by name
  and relative imports inside an app, what goes in @madiro/shared vs @madiro/web-core vs an
  app (and rebuilding shared after changing it), Ukrainian-first i18n catalogues with the
  EN parity test, data-testid naming, Zod-validated API bodies, append-only migrations, and
  where each kind of test lives. Use when writing or reviewing any code in this repo, when
  lint errors mention no-unused-vars or Prettier, or when the user asks "how do we do X
  here", "conventions", "why is lint failing", "where does this component / service /
  schema live", "як у нас прийнято", "конвенції". Not for framework questions (React,
  TanStack, NestJS, Prisma APIs) — the framework docs own those.
metadata:
  version: 1.0.0
  tags: conventions, lint, architecture, project
---

# Madiro conventions

What this repo demands beyond the framework defaults. The enforcing layer is
`eslint.config.mjs`, `.prettierrc.json` + `.prettierignore`, `.editorconfig`, the
`tsconfig*.json` files and the tests named below; this file explains the rules in words.
When the two disagree, the config wins and the disagreement is worth reporting. A rule
change lands as prose + config in one pull request.

Keep every rule here with its **why**: a prohibition without a reason is one the next
model talks itself out of. Do not copy values a config enforces — name the file and the
command that checks it.

## The lint contract

`pnpm lint` (`eslint .`, config `eslint.config.mjs`): `@eslint/js` recommended +
`typescript-eslint` recommended, with `eslint-config-prettier` last so lint never argues
with the formatter. Fails the build (CI step "Lint"):

- `@typescript-eslint/no-unused-vars` — an unused binding is an error; prefix it with `_`
  when it must exist (a destructured field you drop, an unused callback argument).
- Node scripts under `**/scripts/**/*.mjs` get only the globals that block declares — a
  new global (`fetch`, `URL` …) goes into that list, not an `eslint-disable`.
- Generated files (`routeTree.gen.ts`, `mockServiceWorker.js`) and the sdd-harness
  framework scripts are ignored on purpose; do not lint or hand-edit them.

`pnpm typecheck` runs `tsc --noEmit` per package (TypeScript `strict` +
`noUncheckedIndexedAccess`, `tsconfig.base.json`): an indexed read is `T | undefined`, so
handle the miss instead of asserting it away.

## Formatting

Prettier (`.prettierrc.json`), checked by `pnpm format:check` in CI and by the pre-commit
hook `.githooks/pre-commit` (installed by `pnpm install` through `prepare`). Fix with
`pnpm format`. `.editorconfig`: LF, 2 spaces, final newline. `docs/`, migrations,
generated files and the sdd-harness framework files are excluded in `.prettierignore` —
don't reformat them by hand either. The hook's own escape hatch is
`git commit --no-verify`.

## Imports

- Workspace packages are imported by name: `@madiro/shared`, `@madiro/web-core`. There
  are no TypeScript path aliases (no `paths` in any tsconfig) — inside an app or package,
  imports are relative (`../../lib/attempt`).
- Order, by habit rather than a lint rule: external packages (alphabetical, `@madiro/*`
  among them), a blank line, then relative imports.
- `@madiro/shared` is consumed **from its build** (`packages/shared/package.json` →
  `exports` → `dist/`). After changing anything in `packages/shared/src`, run
  `pnpm --filter @madiro/shared build` before testing an app — a stale `dist` renders a
  blank page with an empty console (ENV-1, `docs/test-run-2026-07-30.md`).
  `@madiro/web-core` is consumed from `src/` and needs no build.

## Architecture — where code lives

<!-- prettier-ignore -->
| Code | Lives in | Test for it |
| --- | --- | --- |
| A shape that crosses the wire (request/response Zod schema, enum, shared constant) | `packages/shared/src/` (`schemas/`, `enums.ts`, `constants.ts`) | the API and an app both read it — it is the API contract |
| Frontend code both apps use (API client, auth store, i18n core, tokens, UI primitives) | `packages/web-core/src/` | used by scanner **and** dashboard |
| A screen | `apps/<app>/src/routes/` (TanStack file routes; `_app` is the signed-in layout) | one route per URL |
| A flow's components | `apps/<app>/src/components/<flow>/` (`intake`, `sale`, `return`, `scan` …) | used by one app |
| App helpers and hooks | `apps/<app>/src/lib/` | used by one app |
| An API domain | `apps/api/src/<domain>/` — `*.module.ts`, `*.controller.ts`, `*.service.ts`, colocated `*.spec.ts` | one Nest module per domain |
| Cross-cutting API code | `apps/api/src/common/` (guards, idempotency, validation errors), `apps/api/src/lib/` | used by several domains |
| Data model | `apps/api/prisma/schema.prisma` + a new folder in `apps/api/prisma/migrations/` | — |

Code used by one app stays in that app; it moves to `web-core` when the second app needs
it, never speculatively.

## API rules

- A controller takes the body as `unknown` and parses it with the shared Zod schema
  (`schema.safeParse(body)` → `throw validationError(parsed.error)`,
  `apps/api/src/common/validation-error.ts`) — so the API and the apps validate the same
  shape from one definition.
- Messages the app shows a seller or an admin are Ukrainian (CLAUDE.md → Language).
- A write the scanner may retry (intake, sale, write-off, return) is idempotent by key
  (`apps/api/src/common/idempotency.ts`): a retry is answered, not repeated.
- Migrations are expand–contract and append-only (CLAUDE.md → Migrations): never edit an
  applied migration — Prisma checksums it and `migrate deploy` on DEMO/PROD refuses —
  write a new one; `db:drift` must stay clean.
- `APP_ENV`, not `NODE_ENV`, guards fake or destructive behaviour (CLAUDE.md →
  Environments).

## i18n

- Each app owns its catalogues: `apps/<app>/src/i18n/locales/uk.ts` (default and source)
  and `en.ts`. No hardcoded user-facing strings in components.
- `en` must cover every `uk` key (plural suffixes aside) —
  `apps/<app>/test/i18n.test.ts` fails otherwise.
- Shared web-core components read `common.*` keys, which every app's catalogue must
  carry (`packages/web-core/src/i18n/core.ts`).

## Test ids

UI elements that tests or agents act on carry `data-testid`: `<area>-<element>`, and
`<group>-<ENUM>` for a group of variants (`payment-CARD`, `season-BAIKA`). They are
stable across copy and language changes — Playwright and browser walks select by them
(`docs/manual-test-plan.md` §0.2); keep them when restyling.

## Styles

Tailwind v4 through `@tailwindcss/vite`. Design tokens live in
`packages/web-core/src/styles/tokens.css`, imported by each app's `src/styles.css`, whose
`@source` line makes Tailwind see classes used inside web-core.

## Testing

<!-- prettier-ignore -->
| Kind | Where | Runner |
| --- | --- | --- |
| App and package unit/component tests | `apps/<app>/test/*.test.ts(x)`, `packages/<pkg>/test/` | Vitest + jsdom + Testing Library (`test/setup.ts`) |
| API unit | colocated `apps/api/src/**/*.spec.ts` | Jest |
| API integration | `apps/api/test/*.e2e-spec.ts`, real Postgres | Jest (`test:e2e`), locally via `scripts/e2e-db.mjs` |
| Browser e2e | `e2e/tests/*.spec.ts` over the built apps and a real API | Playwright (`pnpm e2e:pw`) |

- Test names stay Ukrainian where they already are (CLAUDE.md → Language).
- Request shapes for Playwright fixtures live only in `e2e/tests/helpers.ts`, so a
  contract change breaks one place, not five specs.
- Money is entered in USD and stored in UAH; tests pin `EXCHANGE_RATE_USD=40` so stored
  hryvnia are assertable.
