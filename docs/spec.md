# Madiro — product specification (as built)

> The system as it is, as of October 2026. The historical requirements
> analysis lives in [requirements-analysis.md](requirements-analysis.md); this
> document describes what was built, including every decision taken along the
> way. Operational matters — environments, deployment, releases — are in
> [DEPLOYMENT.md](../DEPLOYMENT.md) and [release-process.md](release-process.md).

---

## 1. Product

**Madiro** is inventory for a single shoe shop in Lviv. Two apps over one
backend:

| App               | User                           | Form factor                        |
| ----------------- | ------------------------------ | ---------------------------------- |
| **Scanner** (PWA) | sellers and the admin, in-shop | phone, installed to the home screen |
| **Dashboard**     | administrator                  | web (desktop + mobile)             |

The core idea: every shoe box carries a label with three handwritten stickers,
**SIZE / COLOR / STYLE**. A seller photographs it with their phone, a vision
model reads the digits, and every daily operation — intake, sale, return — is
a few taps with no typing.

### 1.1 Roles

- **SELLER** — daily operations in the scanner. Never sees purchase prices,
  margins or other sellers' sales; the API guarantees that, not just the UI
  (see §6).
- **ADMIN** — everything a seller can do, plus purchase prices, the dashboard
  (statistics, stock, intake queue) and seller management. There is one admin;
  the account is seeded on first boot.

---

## 2. Domain model

### 2.1 Entities

- **Variant** — a shoe model: `style · color · material? · season`. Unique by
  those four fields. **Insulation is required**: "no insulation" is the value
  `NONE`, not an absence, so the same pair cannot split into two variants
  depending on which screen created it. Material stays optional — "not
  specified" is a real state there. Postgres treats NULL materials as
  distinct, so deduplication happens in the service layer through
  find-or-create under an advisory lock. There is no catalogue of models:
  variants are created automatically on intake.
- **Pair** — a physical pair on the shelf: `variant + size`, status
  `IN_STOCK | SOLD | WRITTEN_OFF`, the `awaitingPrice` flag (a draft), intake
  date, who created it.
- **Operation** — the immutable movement journal: `INTAKE | SALE | RETURN |
  WRITEOFF`, sale price, payment method (`CASH | CARD`), comment,
  **`purchasePriceAtTime`** (the purchase price frozen at the moment of the
  operation — the margin basis), `cancelledAt` (set when the admin cancels a
  sale or write-off, §4.2), and `attributedToId` (whose figures the operation
  moves when that is not the actor, §2.2 item 7).
- **User** — seller or admin; deletion is soft (`deletedAt`) and the operation
  history stays; `tokenVersion` invalidates sessions on a password change.

### 2.2 Key rules

1. **Pair identity** is five fields: `size · color · style` (from the label,
   required) plus `material` (optional) and `season` (required, default
   `NONE`) — both entered by hand.
2. **One purchase price per variant**, not per pair. A change applies to every
   pair; history keeps `purchasePriceAtTime`.
3. **Draft (awaitingPrice)** — an intake by a seller, without a price. The pair
   is in stock immediately and **can be sold**; the admin confirms the price
   later (or marks "no price"). On confirmation the price is **backfilled**
   into the basis of **every** operation on those pairs that lacked one — the
   INTAKE and the sale of a pair sold before confirmation alike, otherwise its
   margin would never be computed. Operations with a basis already set are not
   touched.
4. **"No price — old stock"** is a deliberate admin decision: price `0` (as
   opposed to `null` = not entered yet). No margin is computed. Both paths — the
   dashboard queue and intake in the scanner — write exactly `0`.
5. **Purchases are in dollars; the books are in hryvnia.** The shop buys in
   USD, so the purchase price is **entered in USD** (the intake form in the
   scanner and the price modal in the dashboard). The API converts it at the
   **cash rate** (the mid of PrivatBank's USD buy/sell) and stores a **whole
   hryvnia** — rounding happens once, on entry. From then on no screen, report
   or margin knows about dollars. The sale price stays in hryvnia: the customer
   pays hryvnia.
   - The rate is cached for 15 minutes, so the preview in the form ("Will be
     saved as 1 400 ₴") is the exact number that will be written, not an
     estimate.
   - If the provider is down, the **last known** rate is used (it is stored in
     the database and survives a restart) and the UI marks it as stale. There
     is no rate at all only on a fresh deployment whose first fetch failed: then
     saving refuses, because a made-up rate is worse than an error.
   - The price hint returns dollars — the stored hryvnia converted at the
     current rate. There is no exact round trip (rates move), which is why it is
     a hint the admin confirms.
6. **FIFO on sale** — of several identical pairs, the oldest sells. Selection
   and sale happen in one transaction with a row lock (`SELECT … FOR UPDATE`):
   two sellers cannot sell the last pair twice; the one who is late gets 409.
7. **Returns** — of several identical sold pairs, the **latest** sale is
   reversed (the mirror of FIFO). ≈14 days is a guideline, **not a block**: the
   UI shows how many days have passed but does not refuse. The sale is netted
   out of statistics. Returning a draft sale restores the "awaiting price"
   state (awaitingPrice survives SOLD). **The money comes off the author of the
   sale**, not whoever processed the return: the operation stores both the
   actor (`userId`) and whose figures it moves (`attributedToId`) — otherwise a
   seller who helped a colleague would watch their own day go negative.
8. **Signs**: a RETURN operation is stored with a **positive** price; every
   read (KPIs, lists, summaries) subtracts it. Margin is computed only over
   operations with a basis.
9. **Shop time zone** is `Europe/Kyiv`: the "today / week / month" boundaries
   in statistics and the day counts are computed on the backend by the shop's
   clock, regardless of the server's zone.

---

## 3. Scanner (PWA)

The seller's mobile app. Every screen is implemented; dev port 5174.

### 3.1 Shell

- **Sign-in** — login/password (accounts are created by the admin), a UK/EN
  switch, both roles.
- **Home hub** — greeting, date, large action cards: Sale / out · Intake ·
  Return · Manual entry · Stock search; a "My sales today" card (N pairs ·
  amount, real data from `/me/summary`).
- **Profile** (bottom sheet) — name/role, "My sales", "My drafts" (with the
  queue badge; seller only), sign out.
- **PWA** — manifest (standalone, 192/512/maskable icons), service worker: the
  app shell is precached, `/api` is NetworkOnly (there is no offline queue — a
  sticky "No connection" banner instead). Updates install silently on the next
  launch.

### 3.2 Label recognition (the step shared by every scanning flow)

- Camera: dark screen, a viewfinder with gold corners, torch (Android Chrome),
  a 72 px shutter; fallback — pick a photo as a file (desktop / permission
  denied). The photo is normalised to JPEG on the client (Safari decodes HEIC
  itself).
- Backend `POST /tags/recognize`: multipart ≤10 MB → sharp (EXIF rotation,
  resize ≤768 px, JPEG) → **OpenRouter** with structured output → Zod
  validation → `{size, color, style, confidence}`. Photos are **not stored**
  (processed in memory). The provider sits behind the `VisionProvider` DI
  interface: `auto` prefers OpenRouter, then Gemini; without a key dev/CI use
  the mock, production answers 503. Limit: 10 requests per minute **per
  seller** (§6).
- **Latency target ~1 s** per scan. Two models (`openai/gpt-5.6-luna` and
  `qwen/qwen3-vl-32b-instruct`) run **in parallel** and the first valid answer
  wins: measurements showed they swap places depending on OpenRouter load
  (luna 488 ms vs qwen 687 ms in one window; luna 2339 ms vs qwen 964 ms in
  another), so ranking them would make every scan hostage to the unlucky
  model. 768 px was chosen by measurement: the same accuracy as 1024 px at
  ~405 ms instead of ~1350 ms; at 512 px the model starts confusing digits. The
  client already uploads a downsized image — the server-side resize stays as a
  guard against gallery photos and old clients.
- A human always confirms the result; at `confidence < 0.8` a yellow "check
  the digits" hint appears. A recognition failure → "Could not read the label"
  with "Try again" / "Enter manually".

### 3.3 Intake

Scan → a prefilled form: editable COLOR/STYLE, a **size grid with
quantities**, "Insulation" pills (None / Fleece / Sheepskin) and "Material"
(Leather / Suede).

- **The size grid** replaced a separate SIZE field. A label carries one size,
  but a delivery of the same model never does: one scan takes in the whole
  size run. The default grid is **35–41** (what the shop actually receives;
  these are not the valid-size bounds, which stay 16–50). The recognised size
  gets **1**, the rest are empty and typed by hand. A recognised size
  **outside** the grid (42, 34) is added as its own cell in sorted position, not
  lost. An empty cell is not part of the payload at all — "this size was not
  delivered".
  - Consequence: **manual entry is limited to the 35–41 grid**, because there
    is no free-text size field any more.
- **Admin**: a "Purchase price" section or the "No price — old stock" toggle;
  buttons "To stock and scan the next" (batch mode) / "Save and finish".
  - **Price hint**: as soon as the fields form a known variant,
    `GET /intake/price-hint` (ADMIN, because it returns a purchase price —
    FR-B-02) returns its price, which is filled in with the note "Filled with
    this variant's price". Identity is computed by **the same rule** as saving
    (insulation left unselected = `NONE`), so the hint describes exactly the
    variant the pair will land in. Once the admin types anything, the hint no
    longer touches the field. The "no price — old stock" variant (0) selects
    that mode rather than an empty field.
- **Seller**: no price; an explanation about the "Awaiting price" queue;
  buttons "To drafts and scan the next" / "Save and finish".
- The server (`POST /intake`) accepts `sizes: [{size, qty}]` and **branches
  by role**: a price from a seller is ignored even if sent. The price belongs
  to the variant, so it applies to the whole batch. The variant is
  find-or-created by identity; **all** pairs + their INTAKE operations are
  written in one transaction, under one advisory lock, with one realtime
  event. Quantities expand into separate `Pair` rows: a pair is the unit that
  is sold, written off and returned, so 3 × size 38 is three pairs, not one row
  with a counter. A repeated size in the body → 400 (summing it would mean
  accepting pairs nobody ordered), an empty list → 400, and a cap of 99 per
  size guards against a stray digit.
- **Manual intake** (`/intake-manual`) is the same flow without the camera — a
  separate entry point from manual checkout (§3.6), because one "enter
  manually" cannot mean both receiving and selling.

### 3.4 Sale / out

Scan → "Confirm scan": the label photo, editable fields, narrowed to the
insulation/material combinations **actually in stock**, available sizes (tap
to fill), the FIFO candidate. "Pair not found" → a red card + "Similar in
stock" (tap prefills) + "Search stock manually".

"Out details": the pair card (… · in stock since dd.mm), a **Sale /
Write-off** toggle; sale — price (prefilled with the variant's last sale price,
editable) + Cash/Card, CTA "Confirm sale · N ₴"; write-off — no price, an
optional comment. Success → home with a green toast; a conflict (the pair was
just sold) → 409 → back to confirmation with fresh stock.

### 3.5 Customer return

Scan → the system narrows to the insulation/material combinations that
actually have sold pairs with that label (as in a sale, rule §2.2 item 7: if
there are several, the seller chooses — otherwise a return could cancel
someone else's sale) → finds the **latest sale** of exactly that pair → a
card: "Sold dd.mm — N days ago · payment · seller" + price; past 14 days a
yellow guideline (not blocking); the note "The pair returns to stock, the sale
is cancelled in statistics"; CTA "Return to stock · −N ₴". The pair is
IN_STOCK again (a draft regains "awaiting price").

### 3.6 Manual entry

The same out flow without the camera: empty SIZE/COLOR/STYLE fields → live
stock search → the usual out details (the shared `CheckoutFlow` component).

### 3.7 Stock search

Reference only (read-only): type a style (from 2 digits) → variants in stock
with sizes and counts (×N). No prices.

### 3.8 My sales

A "Today / month" switch, a summary (pairs sold · amount), the list of
operations; returns in terracotta with "−amount" and "pair back in stock".
Informational — no bonuses, no cancellations.

In month mode, paging "‹ July 2026 ›" through any past month; it does not go
past the current month (one cannot sell in the future), and returning to the
tab always opens the current month. A chosen month is bounded on **both**
sides (`?month=YYYY-MM`), unlike "today" and "this month", which need no upper
bound. Boundaries follow the shop's clock on both the client and the backend.

### 3.9 My drafts

The seller's own pairs: chips "AWAITING PRICE" (yellow) / "IN STOCK" (green).
A draft awaiting a price can be **edited** (bottom sheet, 5 fields — the pair
moves between variants through find-or-create) or **deleted** (dialog "This
cannot be undone"; transactional: operation → pair). Others', confirmed and
sold pairs → 404 from the server.

---

## 4. Admin dashboard

A web app (dev port 5173), entirely on real data.

### 4.1 Overview

- Period switch: Today / Week / Month / Custom range (date picker; the chosen
  period in the heading).
- KPIs: Revenue (with a "% vs yesterday" delta for "today"), Sold (sales ·
  returns · net pairs), Margin (amount + % of revenue; only over operations
  with a basis), the dark "Awaiting price" card (pairs / from N sellers → link
  to the queue).
- Revenue chart: hourly for "today", daily otherwise (net, shop time zone).
- The "Awaiting price" queue widget (latest drafts, sold-before-priced marked)
  + the "Recent operations" feed (time, pair, type, seller, payment, amount,
  margin).
- **Live updates**: a seller's scan on the floor (draft, sale, return,
  write-off) moves the queue, the badge, the feed and the KPIs immediately,
  without a reload (see §5.1).

### 4.2 Stock

- Table: a row is a variant with pairs **in stock**; columns Style / Color /
  Material·Insulation / Sizes (chips; a yellow "N awaiting price" chip) / Pairs
  / Purchase ("set" if missing; "No price" if 0) / Last sale.
- Search (style/color/size), filter chips (material, insulation, "Awaiting
  price", "Stock ≤ 2", size), sorting, pagination by 8 — all **server-side**.
- Variant details (drawer): mini-KPIs (purchase / last sale / sold in 30
  days), the pair list (with deletion — confirmation, irreversible), movement
  history with historical prices.
- **Cancelling an operation** (FR-D-07): in a history row, a "cancel" action
  for a sale or write-off that currently keeps the pair out of stock. The modal
  explains the consequences; the pair returns to stock, the operation is marked
  `cancelledAt` (not deleted — the trace stays), revenue and margin are
  recomputed. A sale that was already returned, as well as intakes and returns,
  cannot be cancelled — the amount would be subtracted twice.
- Price editing is per variant (one price for all sizes), including "No price
  — old stock".

### 4.3 Intake (queue + history)

- **"Awaiting price" queue**: variant cards (grouped), size chips; a pair sold
  before pricing has a yellow frame, a "size N · sold" chip and the sale
  price. Actions: "Set price" (modal: variant card, a large field, "applies to
  all N pairs", a hint with the variant's previous price) / "No price — old
  stock" (confirmation of consequences). An empty queue is a green state "A new
  draft from the scanner will appear here automatically". New intakes come
  **only from the scanner**.
- **History**: confirmed intakes, pagination by 6, a 30-day summary (pairs ·
  amount · no price).
- The queue badge (number of variants) is in the navigation of the whole
  dashboard.

### 4.4 People

Seller CRUD: create (login/password), edit (a new password invalidates active
sessions through tokenVersion), soft delete (sign-in is blocked, history
stays). The admin is not listed.

---

## 5. API (as implemented)

Everything under `/api`, JWT Bearer; `@Roles` is fail-closed (an endpoint
without explicit roles = 403).

| Endpoint                                              | Roles                                          | Purpose                                                                            |
| ----------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /auth/login`                                    | public (throttled per account) + client header | sign-in: the access token in the body, the refresh token as the app's httpOnly cookie |
| `POST /auth/refresh`, `POST /auth/logout`             | public + cookie + client header                | renew the access token / sign out (the cookie is cleared)                          |
| `GET /auth/me`                                        | all                                            | the current user                                                                   |
| `GET/POST/PATCH/DELETE /users…`                       | ADMIN                                          | sellers                                                                            |
| `GET /me/summary`                                     | all                                            | the "my sales today" card + the drafts badge                                       |
| `GET /me/sales?period=today\|month&month=YYYY-MM`     | all                                            | own sales (no margin); `month` picks a calendar month                              |
| `GET /me/drafts`                                      | all                                            | own pairs/drafts                                                                   |
| `POST /tags/recognize`                                | all, 10/min per user                           | label recognition (OpenRouter)                                                     |
| `POST /intake`                                        | all (the role branches the price)              | intake: one variant, N pairs by the size grid                                      |
| `PATCH/DELETE /intake/:pairId`                        | all (own drafts only)                          | edit/delete a draft                                                                |
| `GET /intake/queue`, `GET /intake/history`            | ADMIN                                          | the dashboard queue/history                                                        |
| `GET /intake/price-hint`                              | ADMIN                                          | purchase-price hint (in USD) by variant identity                                   |
| `GET /exchange/rate`                                  | ADMIN                                          | the USD→UAH rate for the price-form preview                                        |
| `POST /sale/lookup`                                   | all                                            | scan-lookup of a pair in stock                                                     |
| `GET /sale/search?style=`                             | all                                            | reference search (no prices)                                                       |
| `POST /sale`, `POST /sale/writeoff`                   | all                                            | sale / write-off (row lock, 409)                                                   |
| `POST /returns/lookup`, `POST /returns`               | all                                            | return (the latest sale)                                                           |
| `GET /stock/variants`, `GET /stock/variants/:id`      | ADMIN                                          | stock                                                                              |
| `PATCH /stock/variants/:id/price`, `POST …/no-price`  | ADMIN                                          | price confirmation (+ basis backfill)                                              |
| `DELETE /stock/pairs/:id`                             | ADMIN                                          | delete a pair                                                                      |
| `POST /stock/operations/:id/cancel`                   | ADMIN                                          | cancel a sale/write-off (FR-D-07)                                                  |
| `GET /stats/overview?period&from&to`                  | ADMIN                                          | KPIs/chart/queue/feed                                                              |
| `GET /health`                                         | public                                         | health check with a database query (503 if the DB is down); reports `version`, `env` (APP_ENV) and the built `commit` |

Contracts are Zod schemas in `@madiro/shared`; every response is parsed by
the frontend with the same schema. A failed request-body parse answers 400
with `{ message, errors: [{ path, message }] }` — which field and why, never the
schema's internals.

### 5.1 Realtime (Socket.io)

Namespace `/realtime`, one event `changed` with a `topic` field (`intake-draft ·
intake-priced · sale · return · writeoff · operation-cancelled`) and a
timestamp. **The event carries no data** — the dashboard refetches the
ordinary authorised endpoints in response, so prices and margins never flow
through the socket and the channel cannot become a way around FR-B-02.

Authentication mirrors HTTP: the handshake carries the same access token,
verified with the same secret, and the user is re-read from the database
(`tokenVersion`, `deletedAt`). Only an admin is let into the room; a seller or
an anonymous socket is disconnected. The socket's CORS allowlist is the same
`CORS_ORIGINS`, applied when the server is created.

---

## 6. Security

- **JWT**: a 15-minute access token (**memory only** on the client) + a
  30-day refresh token in an **httpOnly cookie** with `Path=/api/auth` — script
  cannot read it, so an XSS no longer walks off with a month of access. The
  cookie is **per app** (`madiro_refresh_scanner` / `madiro_refresh_dashboard`),
  so a seller in the scanner and the admin in the dashboard coexist in one
  browser. A page reload restores the session from the cookie (silent refresh
  before the app mounts); single-flight refresh; `tokenVersion` revokes issued
  tokens on a password change. The signing algorithm is pinned to HS256 on
  every verification.
- **Same origin.** In production each frontend's Caddy container proxies
  `/api` (and `/socket.io`) to the API over the private network, so the browser
  talks to one origin per app and the refresh cookie is first-party with
  `SameSite=Lax`. (It used to be `None` while the apps and the API sat on
  separate `up.railway.app` hosts — WebKit dropped the third-party cookie and
  the installed PWA asked for a login on every launch.)
- **CSRF**: every `/auth/*` route requires the client's own header
  `x-madiro-client` with the value `scanner` | `dashboard` (it also selects the
  cookie; an unknown value is 403). A cross-site form or `<img>` cannot set a
  custom header, and the preflight it triggers only succeeds for allowlisted
  origins. Sign-out clears the cookie on the server.
- **Passwords** — argon2.
- **RBAC fail-closed** — global guards; a route without `@Roles` = 403.
- **FR-B-02 (prices are private)**: purchase prices, margins and other
  sellers' sales are returned to a seller by **no** endpoint (checked by e2e:
  403 on admin paths, no price fields in responses).
- **Rate limits are keyed by identity, not IP.** Behind the frontend proxies
  every request reaches the API from one address, so an IP-keyed limit would
  cap the whole shop together. Login attempts are limited per account (10/min),
  refreshes per session (20/min), everything else per user (300/min globally,
  recognition 10/min). The scanner and the dashboard tell a throttled sign-in
  apart from a wrong password.
- helmet, a CORS allowlist from env, env validation at startup (Zod), a 10 MB
  photo limit.
- **Structured logs** (pino): every request is a JSON line with a correlation
  id (`x-request-id` if one came in), 5xx → `error`, 4xx → `warn`; tokens,
  cookies and passwords are redacted, health probes are not logged.

---

## 7. Technical architecture

- **Monorepo**: Turborepo + pnpm, Node 22, strict TypeScript.
  - `apps/api` — NestJS 11, Prisma 6, PostgreSQL 16, a Socket.io gateway, pino
    logging.
  - `apps/scanner`, `apps/dashboard` — Vite 7, React 19, TanStack
    Router/Query, Tailwind 4; the scanner uses vite-plugin-pwa.
  - `packages/shared` — Zod contracts, enums, constants (built).
  - `packages/web-core` — shared frontend code (API client with refresh, auth
    store, i18n core, design tokens, UI components, icons; source-only).
- **i18n** — Ukrainian (primary) + English; key completeness is enforced by
  types and a test.
- **Concurrency**: sale, write-off, return and cancellation take
  `SELECT … FOR UPDATE` on the pair; variant find-or-create is serialised by a
  transaction-scoped advisory lock over the 5-field identity (the unique
  constraint cannot cover a NULL material).
- **Tests**: unit (Jest/Vitest) + component (Testing Library) + API
  integration against a real Postgres (supertest + a real socket.io client; 9
  suites) + browser e2e (Playwright over the built scanner and dashboard and
  the real API; 13 spec files). CI on every PR and on every push to `main` and
  `release`: dependency audit, lint, format, typecheck, unit, build,
  migrations, a schema-drift gate, API e2e, Playwright.
- **Environments and deployment** — Railway, twice: **DEMO** deploys from
  `main` on every merge, **PROD** deploys from `release` when a release is cut
  (`pnpm release` → tag → fast-forward). Each environment has its own Postgres,
  domains and secrets; `APP_ENV` tells them apart and guards what each may do.
  Three services per environment (api / scanner / dashboard) from their own
  Dockerfiles + managed Postgres. On boot the API applies migrations and seeds
  the admin idempotently (`docker-entrypoint.sh`). The frontends are served by
  Caddy, which proxies `/api` to the api over the private network on the same
  origin. Railway's HTTPS domains give the secure context the camera and PWA
  installation need. Details: [DEPLOYMENT.md](../DEPLOYMENT.md),
  [release-process.md](release-process.md).
- **Migrations** roll forward only; a rollback redeploys older code against a
  newer database, so every migration must leave the previous release working
  (expand–contract).

---

## 8. Deliberately deferred (backlog)

1. **Scanner offline mode** — a deliberate "no offline queue": a banner only;
   operations need the network.
2. **Rotation and revocation of individual refresh tokens** — every refresh
   issues a new cookie, but the old token lives until its TTL expires; targeted
   revocation needs a `jti` registry (today there is only the bulk revocation
   via `tokenVersion`).
3. **External error tracking** (Sentry/OTel over pino) — needs an account and
   a DSN from the owner; the logs are already structured.
4. **CSV export** of stock and sales (requirements analysis §7.8).
5. **SonarCloud** quality gate.
6. **Login normalisation** — logins are case-sensitive (`Admin` ≠ `admin`);
   normalising to lowercase needs a data migration for any existing mixed-case
   login.
7. **Stricter password policy** — sellers' passwords are 6+ characters and the
   admin seed accepts any `ADMIN_PASSWORD`.
8. Minor: `:id` route parameters are not format-validated (a malformed id is a
   404, not a 400); real sales counters in the seller list; a Redis store for
   rate limiting and a socket.io adapter if the API ever scales out.
