# Madiro — облік взуття магазину

Застосунок обліку взуття для одного магазину: PWA-сканер (vision-LLM читає рукописні бірки SIZE / COLOR / STYLE) + веб-дашборд адміністратора на спільному бекенді.

Повний аналіз вимог: [docs/requirements-analysis.md](docs/requirements-analysis.md).

## Стек

React 19 · TypeScript · TanStack (Router / Query / Table) · Zustand · NestJS · Prisma · PostgreSQL · Socket.io · PWA · AI vision pipeline · Turborepo · Docker · GitHub Actions

## Структура монорепо

| Шлях                | Призначення                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `apps/api`          | NestJS API: Prisma + PostgreSQL, JWT-auth (ролі admin/seller)           |
| `apps/dashboard`    | Веб-дашборд адміністратора (Vite + React 19 + TanStack), порт 5173      |
| `apps/scanner`      | PWA-сканер для персоналу (installable, offline-банер), порт 5174        |
| `packages/shared`   | Спільні TypeScript-типи, Zod-схеми та константи (контракти фронт ↔ бек) |
| `packages/web-core` | Спільний фронтенд-код: api-клієнт, auth, i18n, токени, UI-примітиви     |
| `docs/`             | Документація проєкту                                                    |

## Запуск локально

Потрібні: Node 22 (`nvm use`), pnpm (`corepack enable pnpm`), Docker.

```bash
pnpm install

# PostgreSQL
docker compose up -d

# Конфігурація
cp .env.example .env        # заповніть ADMIN_PASSWORD і JWT-секрети
cp .env apps/api/.env

# База: міграції + початковий адміністратор
pnpm --filter @madiro/api db:migrate
pnpm --filter @madiro/api db:seed

# (опційно) демо-дані: продавці, варіанти, пари, операції
pnpm --filter @madiro/api db:seed:demo

# API в режимі розробки (http://localhost:3000/api)
pnpm --filter @madiro/api dev

# Дашборд адміна (http://localhost:5173) і PWA-сканер (http://localhost:5174)
pnpm --filter @madiro/dashboard dev
pnpm --filter @madiro/scanner dev
```

Демо-логіни після `db:seed:demo`: продавці `olia` / `olia-2026` та `iryna` / `iryna-2026` (сканер), адмін — із вашого `.env`.

## Команди

```bash
pnpm build        # збірка всіх пакетів (turbo)
pnpm typecheck    # перевірка типів
pnpm test         # юніт-тести (vitest + jest)
pnpm lint         # eslint
pnpm format       # prettier

# Скидання пароля адміністратора (з доступом до сервера/БД)
pnpm --filter @madiro/api admin:reset-password
```
