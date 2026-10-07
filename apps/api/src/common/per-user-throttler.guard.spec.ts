import { refreshCookieName } from '@madiro/shared';

import { trackerFor } from './per-user-throttler.guard';

/** A syntactically valid JWT whose payload is `claims`; the signature is junk. */
function bearer(claims: Record<string, unknown>): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `Bearer ${segment({ alg: 'HS256', typ: 'JWT' })}.${segment(claims)}.signature`;
}

describe('PerUserThrottlerGuard: ключ кошика', () => {
  it('авторизований запит — за sub токена, не за IP', () => {
    const req = { ip: '10.0.0.1', headers: { authorization: bearer({ sub: 'user_a' }) } };

    expect(trackerFor(req)).toBe('user:user_a');
    expect(trackerFor({ ...req, ip: '10.0.0.2' })).toBe('user:user_a');
  });

  it('два продавці за одним проксі — два кошики', () => {
    const a = { ip: '10.0.0.1', headers: { authorization: bearer({ sub: 'olia' }) } };
    const b = { ip: '10.0.0.1', headers: { authorization: bearer({ sub: 'iryna' }) } };

    expect(trackerFor(a)).not.toBe(trackerFor(b));
  });

  it('логін — за нормалізованим логіном з тіла', () => {
    const base = { ip: '10.0.0.1', headers: {} };

    expect(trackerFor({ ...base, body: { login: 'Admin', password: 'x' } })).toBe('login:admin');
    expect(trackerFor({ ...base, body: { login: '  admin ', password: 'x' } })).toBe('login:admin');
    expect(trackerFor({ ...base, body: { login: 'olia', password: 'x' } })).toBe('login:olia');
  });

  it('refresh — за хешем куки сесії, а не за IP', () => {
    const base = { ip: '10.0.0.1', headers: {} };
    const a = trackerFor({ ...base, cookies: { [refreshCookieName('scanner')]: 'token-a' } });
    const b = trackerFor({ ...base, cookies: { [refreshCookieName('scanner')]: 'token-b' } });

    expect(a).toMatch(/^session:[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    // The cookie value itself never becomes a storage key.
    expect(a).not.toContain('token-a');
  });

  it('без ідентичності — IP, як раніше', () => {
    expect(trackerFor({ ip: '10.0.0.1', headers: {} })).toBe('ip:10.0.0.1');
    expect(trackerFor({ headers: {} })).toBe('ip:unknown');
  });

  it('сміття замість токена чи логіна не ламає ключ', () => {
    const base = { ip: '10.0.0.1' };

    expect(trackerFor({ ...base, headers: { authorization: 'Bearer not.a.jwt.at.all' } })).toBe(
      'ip:10.0.0.1',
    );
    expect(trackerFor({ ...base, headers: { authorization: 'Bearer a.%%%.c' } })).toBe(
      'ip:10.0.0.1',
    );
    expect(trackerFor({ ...base, headers: { authorization: bearer({ sub: 42 }) } })).toBe(
      'ip:10.0.0.1',
    );
    expect(trackerFor({ ...base, headers: {}, body: { login: 123 } })).toBe('ip:10.0.0.1');
    expect(trackerFor({ ...base, headers: {}, body: { login: '   ' } })).toBe('ip:10.0.0.1');
  });

  it('довгий логін або sub обрізається/відкидається — ключ обмежений', () => {
    const base = { ip: '10.0.0.1', headers: {} };

    expect(trackerFor({ ...base, body: { login: 'a'.repeat(500) } })).toBe(
      `login:${'a'.repeat(64)}`,
    );
    expect(
      trackerFor({ ...base, headers: { authorization: bearer({ sub: 'x'.repeat(65) }) } }),
    ).toBe('ip:10.0.0.1');
  });
});
