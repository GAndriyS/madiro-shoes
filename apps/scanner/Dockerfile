# Build context is the repo ROOT (pnpm workspace). On Railway set
# RAILWAY_DOCKERFILE_PATH to apps/scanner/Dockerfile and add a VITE_API_URL
# service variable pointing at the deployed API (Railway passes it as a build
# arg matching the ARG below; Vite inlines it at build time).

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @madiro/shared build \
 && pnpm --filter @madiro/scanner build

# Serve the static PWA. `-s` sends unknown paths to index.html (SPA routing);
# the PWA lives at the domain root, matching its manifest start_url.
FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/apps/scanner/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
