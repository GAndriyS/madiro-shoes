import { CLIENT_HEADER, authResponseSchema, type ClientId } from '@madiro/shared';

import { useAuthStore } from '../stores/auth';

/**
 * Which app this bundle is. The API issues a separate refresh cookie per
 * client, so the scanner and the dashboard hold independent sessions in one
 * browser — without this they share a cookie, and signing into one silently
 * re-authenticates the other as the wrong user on its next reload.
 *
 * Each app calls `setClientId` once, before anything can make a request.
 */
let clientId: ClientId | null = null;

export function setClientId(id: ClientId): void {
  clientId = id;
}

function requireClientId(): ClientId {
  if (!clientId) {
    throw new Error('setClientId() не викликано — застосунок не назвав себе API');
  }
  return clientId;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * API origin. Normally empty, so requests stay relative to `/api`: in dev the
 * Vite proxy handles them, in production the app's own Caddy container proxies
 * them to the API. Same-origin is deliberate — the refresh cookie used to be
 * third-party and WebKit dropped it, logging the PWA out on every launch.
 * VITE_API_URL stays as an escape hatch for topologies without that proxy.
 */
const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';

/** Abort a request that hangs past this budget so queries never stay pending forever. */
const REQUEST_TIMEOUT_MS = 15_000;

interface RequestOptions {
  /** Per-call override for slow endpoints (e.g. vision recognition). */
  timeoutMs?: number;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
  options: RequestOptions = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  // FormData bodies set their own multipart boundary — forcing a Content-Type
  // here would break the upload.
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  // Names the calling app: the API requires this header on the
  // cookie-authenticated auth routes, where it is both the CSRF guard and the
  // choice of which client's refresh cookie to issue.
  headers.set(CLIENT_HEADER, requireClientId());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      headers,
      // The refresh cookie is httpOnly, so it only travels when credentials are
      // included — and it still must, even now that the API is same-origin.
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    throw err instanceof DOMException && err.name === 'AbortError'
      ? new ApiError(408, `${init.method ?? 'GET'} ${path} → timeout`)
      : new ApiError(0, `${init.method ?? 'GET'} ${path} → network error`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 && retry && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, init, false, options);
    }
    useAuthStore.getState().clearSession();
  }

  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? 'GET'} ${path} → ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Single-flight refresh: the dashboard fires several queries at once, so a burst
 * of 401s must share ONE refresh call — otherwise parallel /auth/refresh requests
 * race and (with rotating tokens) invalidate each other into spurious logouts.
 */
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  try {
    // No body: the refresh token rides along as an httpOnly cookie (S-H3).
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CLIENT_HEADER]: requireClientId() },
      credentials: 'include',
    });
    if (!response.ok) {
      return false;
    }
    // A malformed body must degrade to a clean re-login, not an unhandled throw.
    const session = authResponseSchema.parse(await response.json());
    useAuthStore.getState().setSession(session);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restores a session on app start. The access token is memory-only now, so a
 * reload arrives with no token — but with the refresh cookie, if the session is
 * still alive. Resolves to false when there is nothing to restore, which simply
 * means "show the login screen".
 */
export function restoreSession(): Promise<boolean> {
  return tryRefresh();
}

/**
 * Ends the session on both sides: the API drops the refresh cookie (so it
 * cannot be replayed), the client forgets the access token. Network failures
 * are ignored — a logout must never leave the user stuck logged in.
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { [CLIENT_HEADER]: requireClientId() },
      credentials: 'include',
    });
  } catch {
    // ignored on purpose
  }
  useAuthStore.getState().clearSession();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body }, true, options),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
