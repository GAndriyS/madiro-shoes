# Custom domains — the plan

**Status: agreed, not yet implemented.** Nothing below is live; the apps still
run on the generated `.up.railway.app` domains listed in
[DEPLOYMENT.md](../DEPLOYMENT.md). This document is what we execute once a
domain is registered, and the placeholder `madiro.com.ua` stands in for whatever
we actually buy.

We stay on Railway. It is already real hosting — managed Postgres with backups,
TLS, a private network, automatic deploys — and the two-environment setup is
documented and working. The only thing missing is a domain of our own.

## The scheme

Environment is a **nested zone**, not a suffix. Production omits it:

| Service     | `production`    | `demo`               |
| ----------- | --------------- | -------------------- |
| `dashboard` | `app.madiro.com.ua`  | `app.demo.madiro.com.ua`  |
| `scanner`   | `scan.madiro.com.ua` | `scan.demo.madiro.com.ua` |
| `api`       | `api.madiro.com.ua`  | `api.demo.madiro.com.ua`  |

The rule in one line: **`<app>.<environment>.<domain>`, with the environment
dropped in production.**

A third app becomes `shop.madiro.com.ua` / `shop.demo.madiro.com.ua`; a third
environment becomes `*.staging.madiro.com.ua`. The scheme does not break in
either direction, which is the whole reason to nest rather than to write
`app-demo.`: nesting makes "everything under `demo.` is disposable" a
structural fact instead of a naming convention. One rule can then cover the
whole zone — indexing, an access policy, a banner — and a new app is covered by
it automatically instead of having to be remembered.

The apex `madiro.com.ua` redirects to `app.madiro.com.ua`. Do not serve an app
from the apex: Railway hands out a CNAME target, and a CNAME at the apex only
works through provider flattening.

## One host per app — not one host with paths

`app.madiro.com.ua/scan` is not an option, and the reason is in the Caddyfiles.
Each frontend serves its SPA from `/` and reverse-proxies `/api` **on the same
origin** ([apps/scanner/Caddyfile](../apps/scanner/Caddyfile)), which is what
keeps the httpOnly refresh cookie first-party and the installed PWA logged in.
The scanner's service worker also takes its scope from the root. Sharing a host
would mean rewriting both Caddyfiles, the Vite `base`, and the worker scope, and
breaking every installed PWA to save the price of a DNS record.

## Guardrail: the refresh cookie stays host-only

`refreshCookieOptions` sets **no `domain` attribute**
([apps/api/src/auth/refresh-cookie.ts](../apps/api/src/auth/refresh-cookie.ts)),
so the refresh cookie is host-only. Keep it that way.

Adding `domain: '.madiro.com.ua'` — the kind of thing that looks like a
convenience — would send the production session cookie to
`app.demo.madiro.com.ua` as well. Today that mistake is physically impossible,
because two `.up.railway.app` hosts are not relatives (the domain is on the
public suffix list). Moving to a domain we own is exactly what makes it
possible. It is the one genuinely new risk this migration introduces.

## DEMO stays public, but unindexed

DEMO keeps working without a login wall — being able to show it to someone is
the point. It gets `noindex` and a disallowing `robots.txt`, so the demo does
not surface in search next to the real shop.

## Migration

The scanner is **installed as a PWA on staff phones**, and an installed PWA
stays bound to the origin it was installed from. So nothing gets switched off:
Railway serves several domains per service, and the old ones keep working
alongside the new for as long as we want.

Because the frontends take no build arguments and call a relative `/api`, none
of this needs a rebuild. The images already running will serve the new domains.

1. Register the domain. Note that a second-level `.ua` requires a Ukrainian
   trademark — `.com.ua`, `.shop` or `.store` are the realistic options. Confirm
   with the registrar.
2. Put DNS on Cloudflare (free, and it flattens CNAMEs at the apex). Start
   DNS-only, no proxying, so Railway can issue certificates without a second TLS
   layer in the way.
3. Add the custom domain to each of the six services (Settings → Networking →
   Custom Domain) and create the CNAMEs it asks for.
4. Extend `CORS_ORIGINS` with the new hosts, keeping the old ones for now. The
   same-origin proxy means CORS is not in the hot path for the apps themselves,
   but leaving it inconsistent would be a trap for the next person.
5. Redirect the apex to `app.madiro.com.ua`.
6. Have staff reinstall the scanner PWA from the new domain and delete the old
   icon. There is no hurry — the old install keeps working.
7. After about a month, remove the old domains from Railway.

## What changes in the repo

- [scripts/release.sh](../scripts/release.sh) — `PROD_HEALTH_URL` hardcodes
  `api-production-bfcf.up.railway.app`. This is the only domain in the code.
- [DEPLOYMENT.md](../DEPLOYMENT.md) — the domain table, and the paragraph
  explaining why the demo domains read as `-production`. That paragraph stops
  being needed, which is its own small reward.
- `README.md` and [docs/manual-test-plan.md](manual-test-plan.md) — any links.
- `noindex` / `robots.txt` for the demo zone (see above).

## Not part of this, but adjacent

`sameSite: 'none'` in production
([apps/api/src/auth/refresh-cookie.ts](../apps/api/src/auth/refresh-cookie.ts))
was a leftover from before the same-origin proxy existed; it weakened CSRF
protection for no benefit. **Done** — the cookie is `Lax` everywhere since PR
#45, in its own PR on purpose: a domain change and a cookie-policy change
failing together would have been miserable to diagnose.
