#!/bin/sh
# Runtime boot: apply migrations, ensure the admin exists (idempotent), then
# start the API. Build context is the repo root, so filters run from /app.
set -e

pnpm --filter @madiro/api exec prisma migrate deploy
pnpm --filter @madiro/api run db:seed || echo "Admin seed skipped (set ADMIN_PASSWORD to enable)."

exec node apps/api/dist/main.js
