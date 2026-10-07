# Madiro — shoe inventory for one shop

Inventory for a single shoe shop in Lviv: a **PWA scanner** (a vision LLM reads
the handwritten SIZE / COLOR / STYLE stickers on the box label) and an **admin
dashboard**, on one backend.

- Product spec, as built: [docs/spec.md](docs/spec.md)
- Original requirements analysis (historical, Ukrainian):
  [docs/requirements-analysis.md](docs/requirements-analysis.md)
- Deployment and environments: [DEPLOYMENT.md](DEPLOYMENT.md)
- How a release is cut: [docs/release-process.md](docs/release-process.md)
- Manual / agent-driven test plan: [docs/manual-test-plan.md](docs/manual-test-plan.md)
- Working agreements for contributors and agents: [CLAUDE.md](CLAUDE.md)

## Stack

React 19 · TypeScript · TanStack (Router / Query / Table) · Zustand · NestJS ·
Prisma · PostgreSQL · Socket.io · PWA · vision pipeline (OpenRouter / Gemini) ·
Turborepo · Docker · GitHub Actions · Playwright

## Monorepo layout

| Path                | What it is                                                                  |
| ------------------- | --------------------------------------------------------------------------- |
| `apps/api`          | NestJS API: Prisma + PostgreSQL, JWT auth (admin / seller roles), Socket.io |
| `apps/dashboard`    | Admin web dashboard (Vite + React 19 + TanStack), dev port 5173             |
| `apps/scanner`      | Staff PWA scanner (installable, offline banner), dev port 5174              |
| `packages/shared`   | Shared TypeScript types, Zod schemas and constants — the API contract       |
| `packages/web-core` | Shared frontend code: API client, auth store, i18n, tokens, UI primitives   |
| `e2e`               | Playwright suite over the built apps and a real API                         |
| `docs/`             | Project documentation                                                       |

## Environments

| Environment | Runs from                               | Database                  |
| ----------- | --------------------------------------- | ------------------------- |
| local       | your working tree                       | `docker compose` Postgres |
| DEMO        | `main`, deployed on every merge         | its own Railway Postgres  |
| PROD        | `release`, deployed by a tagged release | its own Railway Postgres  |

DEMO is disposable and may be reseeded; PROD holds the shop's real books. The
login screen shows the running version and a **DEMO** badge where applicable.
See [DEPLOYMENT.md](DEPLOYMENT.md) for the Railway setup.

## Running locally

Requires Node 22 (`nvm use`), pnpm (`corepack enable pnpm`) and Docker.

```bash
pnpm install

# PostgreSQL
docker compose up -d

# Configuration
cp .env.example .env        # fill in ADMIN_PASSWORD and the JWT secrets (LOG_LEVEL is optional)
cp .env apps/api/.env

# Database: migrations + the initial administrator
pnpm --filter @madiro/api db:migrate
pnpm --filter @madiro/api db:seed

# Optional demo data: sellers, variants, pairs, operations
pnpm --filter @madiro/api db:seed:demo

# API in watch mode (http://localhost:3000/api)
pnpm --filter @madiro/api dev

# Admin dashboard (http://localhost:5173) and the PWA scanner (http://localhost:5174)
pnpm --filter @madiro/dashboard dev
pnpm --filter @madiro/scanner dev
```

> Purchase prices are entered **in US dollars** and stored in hryvnia at the
> PrivatBank cash rate; test runs pin the rate with `EXCHANGE_RATE_USD` so the
> stored figures are reproducible.

Demo logins after `db:seed:demo`: sellers `olia` / `olia-2026` and `iryna` /
`iryna-2026` (scanner); the admin comes from your `.env`.

## Commands

```bash
pnpm build          # build every package (turbo)
pnpm typecheck      # type check
pnpm test           # unit tests (vitest + jest)
pnpm lint           # eslint
pnpm format         # prettier (a pre-commit hook runs the check for you)

pnpm --filter @madiro/api test:e2e   # API integration tests against a real Postgres
pnpm e2e:pw                          # Playwright: built scanner + dashboard over the real API
pnpm test:reset                      # rebuild, migrate and reseed a local stack for manual testing

pnpm release [patch|minor|major]     # cut a release to PROD (see docs/release-process.md)

# Reset the administrator password (needs access to the server / database)
pnpm --filter @madiro/api admin:reset-password
```

## License

[MIT](LICENSE).
