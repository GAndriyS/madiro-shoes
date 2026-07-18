import { authResponseSchema } from '@madiro/shared';

import { useAuthStore } from '../stores/auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Abort a request that hangs past this budget so queries never stay pending forever. */
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers, signal: controller.signal });
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
      return request<T>(path, init, false);
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
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    return false;
  }
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
