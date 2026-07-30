import { z } from 'zod';

import { ROLES } from '../enums.js';

export const loginRequestSchema = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The two browser clients. Both talk to the same API origin, so they must not
 * share one refresh cookie: with a single name, signing into the dashboard
 * silently reissues the scanner's session as the admin on its next reload.
 * Each app names itself and gets its own cookie.
 */
export const CLIENT_IDS = ['scanner', 'dashboard'] as const;
export type ClientId = (typeof CLIENT_IDS)[number];

/**
 * Name of the httpOnly cookie carrying the refresh token, per client app. The
 * refresh token is never part of a response body and never reaches JavaScript
 * (audit S-H3), so `/auth/refresh` takes no request body either — the browser
 * attaches the cookie.
 */
export function refreshCookieName(client: ClientId): string {
  return `madiro_refresh_${client}`;
}

/** Every cookie the API may have issued — logout clears whichever it finds. */
export const REFRESH_COOKIE_NAMES = CLIENT_IDS.map(refreshCookieName);

/**
 * Header every browser client sends on the cookie-authenticated auth routes
 * (refresh / logout), carrying its {@link ClientId}. A cross-site form or
 * image cannot set a custom header without a CORS preflight that the
 * attacker's origin fails, so requiring it is what keeps the refresh cookie
 * from being usable in a CSRF — and its value tells the API which app's
 * session to renew.
 */
export const CLIENT_HEADER = 'x-madiro-client';

/** Reads the client id from a request header; unknown values are refused. */
export function parseClientId(value: unknown): ClientId | null {
  return typeof value === 'string' && (CLIENT_IDS as readonly string[]).includes(value)
    ? (value as ClientId)
    : null;
}

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  login: z.string(),
  role: z.enum(ROLES),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * Login / refresh response. It deliberately carries only the short-lived access
 * token (kept in memory by the client) — the long-lived refresh token travels
 * as an httpOnly cookie, out of reach of any XSS.
 */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
