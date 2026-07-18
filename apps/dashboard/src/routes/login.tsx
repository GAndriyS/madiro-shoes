import { authResponseSchema, loginRequestSchema } from '@madiro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { EyeIcon, EyeOffIcon } from '../components/layout/icons';
import { getStoredLanguage, setLanguage, type AppLanguage } from '../i18n';
import { api, ApiError } from '../lib/api';
import { isAuthenticatedAdmin, useAuthStore } from '../stores/auth';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (isAuthenticatedAdmin()) {
      throw redirect({ to: '/overview' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLang] = useState<AppLanguage>(getStoredLanguage());

  const mutation = useMutation({
    mutationFn: async () => {
      const body = loginRequestSchema.parse({ login, password });
      return authResponseSchema.parse(await api.post('/auth/login', body));
    },
    onSuccess: (session) => {
      // The dashboard is admin-only (FR-D-01); sellers are rejected.
      if (session.user.role !== 'ADMIN') {
        setError(t('login.adminOnly'));
        return;
      }
      // Clear any cache left by a previous session before the new admin's data loads.
      queryClient.clear();
      setSession(session);
      void navigate({ to: '/overview' });
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 401
          ? t('login.invalidCredentials')
          : t('login.genericError'),
      );
    },
  });

  const switchLanguage = (lang: AppLanguage) => {
    setLanguage(lang);
    setLang(lang);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#f5f1ea_55%,#e9e0d0_100%)]" />
      <div className="relative flex w-[420px] flex-col gap-[30px] px-4">
        <div className="flex flex-col items-center gap-2">
          <div className="font-display text-[30px] tracking-[8px] text-accent">MADIRO</div>
          <div className="text-[13.5px] text-text-muted">{t('login.subtitle')}</div>
          <div className="mt-1 flex rounded-[10px] bg-segment p-[3px]">
            {(['uk', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => switchLanguage(lang)}
                className={
                  language === lang
                    ? 'rounded-lg bg-surface px-4 py-1.5 text-[12.5px] font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                    : 'px-4 py-1.5 text-[12.5px] text-text-secondary'
                }
              >
                {lang === 'uk' ? 'УКР' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-[18px] rounded-[20px] border border-border bg-surface p-[34px] shadow-login"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('login.loginLabel')}
            </span>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoFocus
              className="rounded-xl border-[1.5px] border-border-input bg-white px-4 py-3.5 text-[15px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('login.passwordLabel')}
            </span>
            <div className="flex items-center rounded-xl border-[1.5px] border-border-input bg-white focus-within:border-accent">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded-xl px-4 py-3.5 text-[15px] tracking-[3px] text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                className="px-4 text-text-faint"
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="text-[13px] text-danger">{error}</div>}

          <button
            type="submit"
            disabled={mutation.isPending || login.length === 0 || password.length === 0}
            className="mt-1 rounded-xl bg-ink p-[15px] text-center text-[15px] font-bold text-page disabled:opacity-60"
          >
            {t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
