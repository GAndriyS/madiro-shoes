#!/usr/bin/env bash
#
# One entry point for a manual/agent test run: bring the stack to a known state
# and refuse to pretend it worked.
#
#   pnpm test:reset
#
# Covers the three traps the 30.07.2026 run hit (docs/test-run-2026-07-30.md):
#   1. a stale packages/shared/dist renders a BLANK page with an empty console;
#   2. a leftover API process on :3000 serves an old build — login works but
#      /auth/refresh always 403s, so sessions silently die on reload;
#   3. the demo data has to be reseeded, or expected figures drift.
set -euo pipefail

cd "$(dirname "$0")/.."

# Port overrides live in the root .env — the same file docker compose reads —
# so a machine whose 5432/3000 belong to another project configures them once.
# Real environment variables still win.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

api_url="${API_URL:-http://localhost:${API_PORT:-3000}/api}"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

step 'Збірка пакетів (shared — обов’язково, інакше чорний екран)'
pnpm build

step 'PostgreSQL'
docker compose up -d
# Prisma cannot connect to a container that is up but still starting.
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U madiro >/dev/null 2>&1 && break
  sleep 1
done
docker compose exec -T postgres pg_isready -U madiro >/dev/null 2>&1 ||
  fail 'PostgreSQL не піднявся за 30 с'

step 'Міграції та дані'
pnpm --filter @madiro/api db:deploy
pnpm --filter @madiro/api db:seed
pnpm --filter @madiro/api db:seed:demo

step 'Перевірка API'
if health=$(curl -fsS --max-time 5 "$api_url/health" 2>/dev/null); then
  case "$health" in
    *'"database":"up"'*) printf '  health: %s\n' "$health" ;;
    *) fail "API відповідає, але БД недоступна: $health" ;;
  esac
  # A process that predates the current build is the trap: it answers /health
  # yet rejects /auth/refresh with 403 «Запит без клієнтського заголовка».
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api_url/auth/refresh" \
    -H 'x-madiro-client: 1' --max-time 5 || true)
  [ "$code" = "403" ] &&
    fail "API на $api_url — застарілий процес (refresh віддає 403). Зупиніть його і запустіть заново: pnpm --filter @madiro/api dev"
  printf '  refresh guard: %s (очікувано 401 без куки)\n' "$code"
else
  printf '  API не запущено — стартуйте: pnpm --filter @madiro/api dev\n'
fi

cat <<'DONE'

▸ Готово. Далі:
    pnpm --filter @madiro/api dev          # API (порт із apps/api/.env PORT)
    pnpm --filter @madiro/dashboard dev    # http://localhost:5173
    pnpm --filter @madiro/scanner dev      # http://localhost:5174

  Сканер і дашборд — у РІЗНИХ браузерних профілях: вони ділять одну
  refresh-куку, тож в одному профілі живе лише одна сесія.
DONE
