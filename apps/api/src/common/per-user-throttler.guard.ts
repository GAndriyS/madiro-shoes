import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { REFRESH_COOKIE_NAMES } from '@madiro/shared';

/**
 * Rate-limit buckets keyed by who is asking, not by where the packet came from.
 *
 * In production every request reaches the API through the frontend's Caddy
 * proxy over Railway's private network, so `req.ip` is the proxy container —
 * one address for the whole shop. Keyed by IP, the login limit (10/min), the
 * refresh limit (20/min) and the recognition limit (10/min) would be shared by
 * every seller on the floor: two people scanning a delivery would lock the
 * third one out, and the shop would read it as the app being broken.
 *
 * `trust proxy` is not the fix. The API also has a public domain (for health
 * checks), and trusting X-Forwarded-For there lets anyone pick their own
 * bucket by setting the header. Identity is the key that cannot be spoofed
 * into someone else's bucket:
 *
 * - an authenticated request → the token's `sub`. Read without verifying —
 *   a forged `sub` only moves a request the JWT guard is about to reject
 *   (401) into a bucket nobody uses, and a valid token's `sub` is immutable.
 *   This also makes the guard independent of its position among the global
 *   guards: it runs before `JwtAuthGuard`, so `req.user` is not set yet.
 * - a login → the login name, normalised. This is what a credential limit is
 *   for: it caps attempts against *an account*, which an IP never did behind
 *   the proxy. The trade is that attempts spread across many accounts are no
 *   longer capped as one stream; argon2 keeps each attempt expensive.
 * - a refresh → a hash of the refresh cookie, i.e. the session itself.
 * - anything else → the IP, as before.
 */
@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return trackerFor(req);
  }
}

/** Exported for the unit test; the guard itself needs Nest's DI to construct. */
export function trackerFor(req: Record<string, unknown>): string {
  const sub = subjectOf(req.headers);
  if (sub) {
    return `user:${sub}`;
  }
  const login = loginOf(req.body);
  if (login) {
    return `login:${login}`;
  }
  const session = sessionOf(req.cookies);
  if (session) {
    return `session:${session}`;
  }
  return `ip:${String(req.ip ?? 'unknown')}`;
}

/** The `sub` claim of a Bearer JWT, or null when there is no well-formed token. */
function subjectOf(headers: unknown): string | null {
  const header = (headers as Record<string, unknown> | undefined)?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const segments = header.slice('Bearer '.length).split('.');
  if (segments.length !== 3) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(Buffer.from(segments[1]!, 'base64url').toString('utf8'));
    const sub = (payload as { sub?: unknown } | null)?.sub;
    return typeof sub === 'string' && sub.length > 0 && sub.length <= 64 ? sub : null;
  } catch {
    return null;
  }
}

/**
 * The login from a credentials body, normalised the way the account lookup
 * should see it. Capped so a hostile body cannot mint unbounded bucket names.
 */
function loginOf(body: unknown): string | null {
  const login = (body as { login?: unknown } | null)?.login;
  if (typeof login !== 'string') {
    return null;
  }
  const normalised = login.trim().toLowerCase();
  return normalised.length > 0 ? normalised.slice(0, 64) : null;
}

/** A stable, non-reversible id for whichever refresh cookie the request carries. */
function sessionOf(cookies: unknown): string | null {
  const jar = cookies as Record<string, unknown> | undefined;
  for (const name of REFRESH_COOKIE_NAMES) {
    const value = jar?.[name];
    if (typeof value === 'string' && value.length > 0) {
      return createHash('sha256').update(value).digest('hex').slice(0, 16);
    }
  }
  return null;
}
