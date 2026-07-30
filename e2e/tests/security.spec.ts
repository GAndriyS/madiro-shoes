import { expect, request, test, type APIRequestContext } from '@playwright/test';

import { ADMIN } from './helpers';

/**
 * Suite K of docs/manual-test-plan.md as executable checks — the part a human
 * cannot eyeball, since «продавець не бачить цін» is a claim about JSON, not
 * about screens. Runs against the API directly; no browser involved.
 *
 * The seller is created through the admin API so the suite owns its fixtures
 * and never depends on the demo seed.
 */

const API = 'http://localhost:3000/api';

const SELLER = { name: 'Тест-Продавець', login: 'e2e-seller', password: 'e2e-seller-2026' };

/** Fields that must never reach a seller, at any depth (FR-B-02). */
const FORBIDDEN = ['purchasePrice', 'purchasePriceAtTime', 'margin', 'purchaseValue'];

function findForbidden(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => findForbidden(item, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) => [
      ...(FORBIDDEN.includes(key) ? [`${path}.${key}`] : []),
      ...findForbidden(nested, `${path}.${key}`),
    ]);
  }
  return [];
}

async function login(ctx: APIRequestContext, login: string, password: string): Promise<string> {
  // Every auth route requires the client id: it is the CSRF guard and it names
  // whose refresh cookie is issued.
  const response = await ctx.post(`${API}/auth/login`, {
    headers: { 'x-madiro-client': 'scanner' },
    data: { login, password },
  });
  expect(response.ok(), `login ${login}: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { accessToken: string }).accessToken;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('безпека API', () => {
  let ctx: APIRequestContext;
  let adminToken: string;
  let sellerToken: string;

  test.beforeAll(async () => {
    ctx = await request.newContext();
    adminToken = await login(ctx, ADMIN.login, ADMIN.password);

    // Recreate the seller idempotently: a re-run must not fail on 409.
    const existing = await ctx.get(`${API}/users`, { headers: auth(adminToken) });
    const found = ((await existing.json()) as { id: string; login: string }[]).find(
      (u) => u.login === SELLER.login,
    );
    if (found) {
      await ctx.patch(`${API}/users/${found.id}`, {
        headers: auth(adminToken),
        data: { name: SELLER.name, password: SELLER.password },
      });
    } else {
      await ctx.post(`${API}/users`, { headers: auth(adminToken), data: SELLER });
    }
    sellerToken = await login(ctx, SELLER.login, SELLER.password);
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  test('без токена — 401 (TC-K-01)', async () => {
    expect((await ctx.get(`${API}/me/summary`)).status()).toBe(401);
  });

  test('продавцю закриті всі адмін-ендпоінти (TC-K-02)', async () => {
    const adminOnly = [
      '/stock/variants',
      '/intake/queue',
      '/intake/history',
      '/intake/price-hint?size=38&color=36&style=7645&season=NONE',
      '/stats/overview?period=today',
      '/users',
    ];

    for (const path of adminOnly) {
      const response = await ctx.get(`${API}${path}`, { headers: auth(sellerToken) });
      expect(response.status(), `GET ${path}`).toBe(403);
    }
  });

  test('у відповідях продавцю немає цін закупки й маржі (TC-K-03)', async () => {
    // Give the seller something of their own to read back.
    const tag = { size: 38, color: '36', style: '7645', season: 'NONE' as const };
    await ctx.post(`${API}/intake`, { headers: auth(sellerToken), data: tag });

    const responses = [
      await ctx.post(`${API}/sale/lookup`, { headers: auth(sellerToken), data: tag }),
      await ctx.get(`${API}/sale/search?style=${tag.style}`, { headers: auth(sellerToken) }),
      await ctx.get(`${API}/me/drafts`, { headers: auth(sellerToken) }),
      await ctx.get(`${API}/me/sales?period=today`, { headers: auth(sellerToken) }),
      await ctx.get(`${API}/me/summary`, { headers: auth(sellerToken) }),
    ];

    for (const response of responses) {
      expect(response.ok(), `${response.url()} → ${response.status()}`).toBeTruthy();
      expect(findForbidden(await response.json()), response.url()).toEqual([]);
    }
  });

  test('чужа чернетка не існує для іншого продавця (TC-K-04)', async () => {
    // A draft owned by a DIFFERENT seller: use the admin to mint a second one.
    const other = { name: 'Інша', login: 'e2e-seller-2', password: 'e2e-seller-2-2026' };
    const users = await ctx.get(`${API}/users`, { headers: auth(adminToken) });
    const existing = ((await users.json()) as { id: string; login: string }[]).find(
      (u) => u.login === other.login,
    );
    if (existing) {
      await ctx.patch(`${API}/users/${existing.id}`, {
        headers: auth(adminToken),
        data: { name: other.name, password: other.password },
      });
    } else {
      await ctx.post(`${API}/users`, { headers: auth(adminToken), data: other });
    }
    const otherToken = await login(ctx, other.login, other.password);

    const created = await ctx.post(`${API}/intake`, {
      headers: auth(otherToken),
      data: { size: 41, color: '77', style: '7777', season: 'NONE' },
    });
    const { pairId } = (await created.json()) as { pairId: string };

    const patched = await ctx.patch(`${API}/intake/${pairId}`, {
      headers: auth(sellerToken),
      data: { size: 41, color: '77', style: '9999', season: 'NONE' },
    });
    const deleted = await ctx.delete(`${API}/intake/${pairId}`, { headers: auth(sellerToken) });

    expect(patched.status()).toBe(404);
    expect(deleted.status()).toBe(404);
  });

  test('скасування операції — не для продавця (TC-K-04)', async () => {
    const response = await ctx.post(`${API}/stock/operations/whatever/cancel`, {
      headers: auth(sellerToken),
    });

    // 403 from the role guard, never a 404 that would imply the route ran.
    expect(response.status()).toBe(403);
  });
});
