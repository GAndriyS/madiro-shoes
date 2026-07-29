import { z } from 'zod';

import { ROLES } from '../enums.js';

export const loginRequestSchema = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Name of the httpOnly cookie carrying the refresh token. The refresh token is
 * never part of a response body and never reaches JavaScript (audit S-H3), so
 * `/auth/refresh` takes no request body either — the browser attaches the
 * cookie.
 */
export const REFRESH_COOKIE = 'madiro_refresh';

/**
 * Header every browser client sends on the cookie-authenticated auth routes
 * (refresh / logout). A cross-site form or image cannot set a custom header
 * without a CORS preflight that the attacker's origin fails, so requiring it
 * is what keeps the refresh cookie from being usable in a CSRF.
 */
export const CLIENT_HEADER = 'x-madiro-client';

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
