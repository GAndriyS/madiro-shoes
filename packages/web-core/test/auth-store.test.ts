import { beforeEach, describe, expect, it } from 'vitest';

import { isAuthenticatedAdmin, useAuthStore } from '../src/stores/auth';

const adminSession = {
  accessToken: 'access',
  user: { id: 'u1', name: 'Адмін', login: 'admin', role: 'ADMIN' as const },
};

describe('auth store', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('зберігає сесію і розпізнає адміністратора', () => {
    useAuthStore.getState().setSession(adminSession);
    expect(isAuthenticatedAdmin()).toBe(true);
  });

  it('продавець не проходить перевірку доступу до дашборда', () => {
    useAuthStore
      .getState()
      .setSession({ ...adminSession, user: { ...adminSession.user, role: 'SELLER' } });
    expect(isAuthenticatedAdmin()).toBe(false);
  });

  it('вихід очищає сесію', () => {
    useAuthStore.getState().setSession(adminSession);
    useAuthStore.getState().clearSession();
    expect(isAuthenticatedAdmin()).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('токени не потрапляють у localStorage (S-H3)', () => {
    useAuthStore.getState().setSession(adminSession);

    // Nothing persisted: an XSS has no stored token to steal, and the refresh
    // token never leaves the httpOnly cookie in the first place.
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('access');
  });
});
