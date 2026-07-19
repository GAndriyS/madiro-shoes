# Deployment (Railway)

Madiro runs as **three services** in one Railway project plus a managed Postgres:

| Service     | Source                      | Public domain (example)           |
| ----------- | --------------------------- | --------------------------------- |
| `api`       | `apps/api/Dockerfile`       | `madiro-api.up.railway.app`       |
| `scanner`   | `apps/scanner/Dockerfile`   | `madiro-scanner.up.railway.app`   |
| `dashboard` | `apps/dashboard/Dockerfile` | `madiro-dashboard.up.railway.app` |
| Postgres    | Railway plugin              | (internal)                        |

The frontends and API live on separate origins. Each frontend is built with
`VITE_API_URL` pointing at the API; the API allows those origins via
`CORS_ORIGINS`. **Continuous deployment is native:** once a service is connected
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

| Variable             | Value                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`       | Reference the Postgres variable (`${{Postgres.DATABASE_URL}}`)        |
| `JWT_ACCESS_SECRET`  | 32+ chars — `openssl rand -hex 32`                                    |
| `JWT_REFRESH_SECRET` | a **different** 32+ char value                                        |
| `CORS_ORIGINS`       | `https://<scanner-domain>,https://<dashboard-domain>` (no trailing /) |
| `GEMINI_API_KEY`     | your Google AI Studio key (label recognition)                         |
| `ADMIN_PASSWORD`     | the admin login password (used once to seed the admin)                |
| `NODE_ENV`           | `production`                                                          |

`ADMIN_LOGIN` (default `admin`) and `ADMIN_NAME` are optional. `PORT` is set by
Railway automatically.

**scanner** and **dashboard** services — one build-time variable each:

| Variable       | Value                                               |
| -------------- | --------------------------------------------------- |
| `VITE_API_URL` | `https://<api-domain>` (no `/api`, no trailing `/`) |

> `VITE_API_URL` is read at **build** time (Vite inlines it). After changing it,
> redeploy the frontend so the new value is baked in.

### 4. First deploy order

Deploy **api** first (it runs `prisma migrate deploy` and seeds the admin on
boot — see `apps/api/docker-entrypoint.sh`), then the two frontends. Once the
api domain is known, set `VITE_API_URL` on the frontends and `CORS_ORIGINS` on
the api, then redeploy.

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
docker build -f apps/scanner/Dockerfile --build-arg VITE_API_URL=https://your-api . -t madiro-scanner
```

## Admin & seller accounts

- The **admin** is seeded on the api's first boot from `ADMIN_LOGIN` /
  `ADMIN_PASSWORD`. To change the password later, run
  `pnpm --filter @madiro/api admin:reset-password` in a Railway shell.
- **Sellers** are created from the dashboard (admin → users), not by seeding.
