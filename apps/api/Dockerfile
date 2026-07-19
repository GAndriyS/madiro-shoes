# Build context is the repo ROOT (the API needs the whole pnpm workspace so
# @madiro/shared builds first). On Railway set RAILWAY_DOCKERFILE_PATH to
# apps/api/Dockerfile and leave the service root at the repo root.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @madiro/api prisma:generate \
 && pnpm --filter @madiro/shared build \
 && pnpm --filter @madiro/api build

# Runtime reuses the built workspace: node_modules carries the Prisma CLI and
# ts-node the entrypoint needs for migrate deploy + the admin seed.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "apps/api/docker-entrypoint.sh"]
