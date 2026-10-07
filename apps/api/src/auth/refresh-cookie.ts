import type { CookieOptions } from 'express';

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** `30d` / `12h` / `15m` → milliseconds; anything unparseable falls back to 30 days. */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) {
    return DEFAULT_MAX_AGE_MS;
  }
  return Number(match[1]) * (UNIT_MS[match[2]!] ?? 0) || DEFAULT_MAX_AGE_MS;
}

/**
 * Options for the refresh cookie (audit S-H3).
 *
 * - `httpOnly` is the whole point: script cannot read the token, so an XSS or a
 *   compromised dependency can no longer walk off with 30 days of access.
 * - `path` scopes it to the auth routes, so it is not attached to every API
 *   call that already carries a Bearer token.
 * - `SameSite=Lax` everywhere. Each frontend reaches the API through its own
 *   proxy — Vite in development, Caddy in production — so the cookie is always
 *   first-party and never needs to travel cross-site. It was `None` while the
 *   apps and the API sat on separate up.railway.app hosts; keeping that after
 *   the proxy would only have let a cross-site request carry the cookie for
 *   no benefit. The client header remains the CSRF guard regardless.
 * - `Secure` only in production: it would break plain-http localhost.
 */
export function refreshCookieOptions(env: {
  NODE_ENV: string;
  JWT_REFRESH_TTL: string;
}): CookieOptions {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: ttlToMs(env.JWT_REFRESH_TTL),
  };
}
