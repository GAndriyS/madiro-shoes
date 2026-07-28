import type { AuthResponse, AuthUser } from '@madiro/shared';
import { create } from 'zustand';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setSession: (session: AuthResponse) => void;
  clearSession: () => void;
}

/**
 * Session state, deliberately in memory only.
 *
 * Persisting tokens in localStorage meant that any XSS could read a 30-day
 * refresh token and keep the account for a month (audit S-H3). The refresh
 * token now lives in an httpOnly cookie the page cannot touch, and only the
 * short-lived access token is held here — a reload restores the session via
 * `restoreSession()` (see lib/api), which spends the cookie instead of reading
 * a stored token.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  setSession: ({ user, accessToken }) => set({ user, accessToken }),
  clearSession: () => set({ user: null, accessToken: null }),
}));

export function isAuthenticatedAdmin(): boolean {
  const { user, accessToken } = useAuthStore.getState();
  return accessToken != null && user?.role === 'ADMIN';
}
