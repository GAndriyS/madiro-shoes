# Build context is the repo ROOT (pnpm workspace). On Railway set
# RAILWAY_DOCKERFILE_PATH to apps/dashboard/Dockerfile and add an API_UPSTREAM
# service variable pointing at the API over the private network. There is no
# VITE_API_URL any more: the bundle calls a relative /api, which Caddy proxies
# from this same origin (see Caddyfile).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @madiro/shared build \
 && pnpm --filter @madiro/dashboard build

FROM caddy:2-alpine
COPY apps/dashboard/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/dashboard/dist /srv
ENV PORT=8080
EXPOSE 8080
