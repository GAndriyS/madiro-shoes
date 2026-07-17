import { beforeEach, describe, expect, it } from 'vitest';

import { isAuthenticatedAdmin, useAuthStore } from '../src/stores/auth';

const adminSession = {
  accessToken: 'access',
  refreshToken: 'refresh',
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
});
