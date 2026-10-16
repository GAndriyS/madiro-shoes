import { IDEMPOTENCY_HEADER, idempotencyKeySchema } from '@madiro/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, newIdempotencyKey, outcomeUnknown, setClientId } from '../src/lib/api';
import { useAuthStore } from '../src/stores/auth';

const admin = { id: 'u', name: 'A', login: 'admin', role: 'ADMIN' as const };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  beforeEach(() => {
    // Every request names its app; without it the client refuses to call out
    // rather than share a refresh cookie with the other app.
    setClientId('scanner');
    useAuthStore.getState().setSession({ accessToken: 'old', user: admin });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.getState().clearSession();
  });

  it('coalesces concurrent 401s into a single refresh (single-flight)', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/api/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse(200, { accessToken: 'new', user: admin });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer new'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { message: 'unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('new');
  });

  it('clears the session when refresh fails', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      return u.endsWith('/api/auth/refresh')
        ? jsonResponse(401, { message: 'expired' })
        : jsonResponse(401, { message: 'unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/a')).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('maps a network failure to ApiError(0) instead of throwing raw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(api.get('/a')).rejects.toMatchObject({ status: 0 });
  });

  it('postForm keeps the multipart boundary: no forced Content-Type', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
      expect(init?.body).toBeInstanceOf(FormData);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer old');
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const fd = new FormData();
    fd.set('photo', new Blob(['x'], { type: 'image/jpeg' }), 'label.jpg');

    await expect(api.postForm('/tags/recognize', fd)).resolves.toEqual({ ok: true });
  });

  it('postForm honours a per-call timeout longer than the default', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
            // Resolves at 30s — past the default 15s, within the custom 45s.
            setTimeout(() => resolve(jsonResponse(200, { ok: true })), 30_000);
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const slow = api.postForm('/tags/recognize', new FormData(), { timeoutMs: 45_000 });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(slow).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('postForm retries once after a refresh on 401', async () => {
    let refreshed = false;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/api/auth/refresh')) {
        refreshed = true;
        return jsonResponse(200, { accessToken: 'new', user: admin });
      }
      expect(init?.body).toBeInstanceOf(FormData);
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer new'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { message: 'unauthorized' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.postForm('/tags/recognize', new FormData())).resolves.toEqual({ ok: true });
    expect(refreshed).toBe(true);
  });

  it('post передає Idempotency-Key лише коли його дали', async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL, init?: RequestInit) => {
        seen.push(new Headers(init?.headers).get(IDEMPOTENCY_HEADER));
        return jsonResponse(201, { ok: true });
      }),
    );

    await api.post('/sale', {}, { idempotencyKey: 'k-1' });
    await api.post('/sale/lookup', {});

    expect(seen).toEqual(['k-1', null]);
  });

  // The refresh-and-retry is an automatic retry of the same attempt: a new key
  // there would make a sale that already landed look like a different one.
  it('повтор після 401 несе той самий Idempotency-Key', async () => {
    const keys: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('/api/auth/refresh')) {
          return jsonResponse(200, { accessToken: 'new', user: admin });
        }
        const headers = new Headers(init?.headers);
        keys.push(headers.get(IDEMPOTENCY_HEADER));
        return headers.get('Authorization') === 'Bearer new'
          ? jsonResponse(201, { ok: true })
          : jsonResponse(401, { message: 'unauthorized' });
      }),
    );

    await expect(api.post('/sale', {}, { idempotencyKey: 'k-2' })).resolves.toEqual({ ok: true });
    expect(keys).toEqual(['k-2', 'k-2']);
  });
});

describe('outcomeUnknown', () => {
  it('мережа, тайм-аут і 5xx — результат невідомий; 4xx — сервер відмовив', () => {
    expect(outcomeUnknown(new ApiError(0, 'network'))).toBe(true);
    expect(outcomeUnknown(new ApiError(408, 'timeout'))).toBe(true);
    expect(outcomeUnknown(new ApiError(502, 'bad gateway'))).toBe(true);
    expect(outcomeUnknown(new ApiError(409, 'conflict'))).toBe(false);
    expect(outcomeUnknown(new ApiError(400, 'bad request'))).toBe(false);
    expect(outcomeUnknown(new Error('no pair'))).toBe(false);
  });
});

describe('newIdempotencyKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('щоразу новий UUID', () => {
    const a = newIdempotencyKey();
    expect(idempotencyKeySchema.safeParse(a).success).toBe(true);
    expect(newIdempotencyKey()).not.toBe(a);
  });

  // A dev build opened over plain http by LAN address has no randomUUID.
  it('без randomUUID (не secure context) — валідний UUID v4 з getRandomValues', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

    const key = newIdempotencyKey();

    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
    expect(key[14]).toBe('4');
  });
});
