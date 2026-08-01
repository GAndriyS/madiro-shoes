# Deployment (Railway)

Madiro runs as **three services** in the Railway project
`splendid-youthfulness` (environment `production`) plus a managed Postgres:

| Service     | Source                      | Public domain                                |
| ----------- | --------------------------- | -------------------------------------------- |
| `api`       | `apps/api/Dockerfile`       | `madiro-shoes-production.up.railway.app`     |
| `scanner`   | `apps/scanner/Dockerfile`   | `keen-warmth-production-8537.up.railway.app` |
| `dashboard` | `apps/dashboard/Dockerfile` | `dashboard-production-2dab.up.railway.app`   |
| Postgres    | Railway plugin              | (internal)                                   |

Each frontend container serves its static bundle **and reverse-proxies `/api` to
the api service over Railway's private network** (Caddy — see
`apps/scanner/Caddyfile`). The browser therefore talks to a single origin per
app. That is not cosmetic: `up.railway.app` is on the public suffix list, so
separate subdomains are separate _sites_, the httpOnly refresh cookie was
third-party, and WebKit dropped it — the installed PWA asked for a login on
every launch. **Continuous deployment is native:** once a service is connected
to this repo on the `main` branch, every merge to `main` redeploys it — no
GitHub Actions needed.

---

## One-time setup

### 1. Create the project and database

1. Create a new Railway project → **Deploy from GitHub repo** → pick this repo.
2. Add **Postgres** (New → Database → PostgreSQL). Note it exposes
   `DATABASE_URL` as a shared variable.

### 2. Create the three services

For **each** of `api`, `scanner`, `dashboard`, create a service from the same
repo and set:

- **Root Directory:** repo root (leave default `/`) — the Docker build needs the
  whole pnpm workspace.
- Variable **`RAILWAY_DOCKERFILE_PATH`** = the service's Dockerfile:
  - api → `apps/api/Dockerfile`
  - scanner → `apps/scanner/Dockerfile`
  - dashboard → `apps/dashboard/Dockerfile`
- **Branch:** `main` (this is what enables auto-deploy on merge).
- Generate a public domain (Settings → Networking → Generate Domain).

> Optional: set **Watch Paths** so a push only rebuilds affected services —
> api: `apps/api/**`, `packages/**`; scanner: `apps/scanner/**`, `packages/**`;
> dashboard: `apps/dashboard/**`, `packages/**`. Without them every push
> rebuilds all three (harmless, just slower).

### 3. Environment variables

**api** service:

| Variable             | Value                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | Reference the Postgres variable (`${{Postgres.DATABASE_URL}}`)                                                     |
| `JWT_ACCESS_SECRET`  | 32+ chars — `openssl rand -hex 32`                                                                                 |
| `JWT_REFRESH_SECRET` | a **different** 32+ char value                                                                                     |
| `CORS_ORIGINS`       | `https://<scanner-domain>,https://<dashboard-domain>` (no trailing /) — also the allowlist for the realtime socket |
| `OPENROUTER_API_KEY` | your OpenRouter key — the label-recognition backend                                                                |
| `GEMINI_API_KEY`     | optional alternative backend; unused while an OpenRouter key is set                                                |
| `ADMIN_PASSWORD`     | the admin login password (used once to seed the admin)                                                             |
| `NODE_ENV`           | `production`                                                                                                       |

`ADMIN_LOGIN` (default `admin`) and `ADMIN_NAME` are optional, as is
`LOG_LEVEL` (defaults to `info` in production) and `OPENROUTER_MODEL` (the
provider ships a benchmarked default; set it only to adopt a different model
without a redeploy).

> Recognition needs credit on the OpenRouter account — an exhausted balance
> surfaces as HTTP 402 from OpenRouter and a 502 to the scanner. The API logs
> every call as `vision recognizeTag: sharp Nms, model Nms, N → N bytes`
> followed by which model won the race, which is the quickest way
> to tell a slow model from a failing one.

> Set `PORT` **explicitly to `3000`** on the api service. Railway injects a
> `PORT` of its own, but the frontends reference `${{api.PORT}}` to build their
> upstream URL, and an auto-injected value is not reliably referenceable from
> another service.

> With the proxy in place the browser never makes a cross-origin API call, so
> CORS is largely inert — but keep `CORS_ORIGINS` accurate: the realtime socket
> handshake still sends an `Origin` header, which `CorsIoAdapter` checks.

**scanner** and **dashboard** services — one runtime variable each:

| Variable       | Value                                                  |
| -------------- | ------------------------------------------------------ |
| `API_UPSTREAM` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |

> `API_UPSTREAM` is read at **runtime** by Caddy, so changing it needs only a
> restart, not a rebuild. It stays on the private network — plain `http` and no
> public egress. There is no `VITE_API_URL` any more: the bundle calls a
> relative `/api`.

### 4. First deploy order

Deploy **api** first (it runs `prisma migrate deploy` and seeds the admin on
boot — see `apps/api/docker-entrypoint.sh`), then the two frontends. Set
`API_UPSTREAM` on the frontends and `CORS_ORIGINS` on the api once the domains
are known.

---

## Verifying from a phone

The scanner needs a **secure context** for the camera (`getUserMedia`) and
service worker — Railway domains are HTTPS, so this works out of the box:

1. Open the scanner domain on the phone, log in (`admin` / your
   `ADMIN_PASSWORD`, or a seller created in the dashboard).
2. Add to Home Screen to install the PWA.
3. Intake → the camera opens (grant permission); scan a box label.

---

## Continuous deployment

Merging a PR into `main` pushes to `main`, which Railway auto-deploys. CI
(`.github/workflows/ci.yml`) still gates PRs (lint, typecheck, tests, e2e,
migration drift) before merge; Railway builds the same Dockerfiles you can build
locally:

```sh
docker build -f apps/api/Dockerfile -t madiro-api .
docker build -f apps/scanner/Dockerfile -t madiro-scanner .
docker build -f apps/dashboard/Dockerfile -t madiro-dashboard .
```

The frontends take no build args now; point them at an API when you run them:

```sh
docker run -p 8080:8080 -e API_UPSTREAM=http://host.docker.internal:3000 madiro-scanner
```

## Admin & seller accounts

- The **admin** is seeded on the api's first boot from `ADMIN_LOGIN` /
  `ADMIN_PASSWORD`. The seed is idempotent: once the admin exists it never
  rewrites the password, so `ADMIN_PASSWORD` only matters on a fresh database.
  To change the password later, open a shell on the running api and run the
  reset CLI there (it prompts for the new password):

  ```sh
  railway ssh --service api --environment production
  pnpm --filter @madiro/api admin:reset-password
  ```

  It bumps `tokenVersion`, so every existing admin session is revoked at once.

- **Sellers** are created from the dashboard (admin → users), not by seeding.
