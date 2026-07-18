import { authResponseSchema, loginRequestSchema } from '@madiro/shared';
import {
  api,
  ApiError,
  EyeIcon,
  EyeOffIcon,
  getStoredLanguage,
  setLanguage,
  useAuthStore,
  type AppLanguage,
} from '@madiro/web-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (useAuthStore.getState().accessToken != null) {
      throw redirect({ to: '/' });
    }
  },
  component: LoginPage,
});

/** Staff sign-in (design 1a). Unlike the dashboard, both roles may enter. */
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
      queryClient.clear();
      setSession(session);
      void navigate({ to: '/' });
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
    <div className="flex flex-1 flex-col px-7 pt-16 pb-10">
      <form onSubmit={onSubmit} className="flex flex-1 flex-col justify-center gap-7">
        <div className="flex flex-col items-center gap-2">
          <div className="font-display text-[26px] tracking-[6px] text-accent">MADIRO</div>
          <div className="text-[13px] text-text-muted">{t('login.subtitle')}</div>
          <div className="mt-1.5 flex rounded-[10px] bg-segment p-[3px]">
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

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('login.loginLabel')}
            </span>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className="rounded-[14px] border-[1.5px] border-border-input bg-surface px-[18px] py-4 text-base text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">
              {t('login.passwordLabel')}
            </span>
            <div className="flex items-center rounded-[14px] border-[1.5px] border-border-input bg-surface focus-within:border-accent">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded-[14px] px-[18px] py-4 text-base tracking-[3px] text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                className="px-4 text-text-faint"
              >
                {showPassword ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
              </button>
            </div>
          </label>
        </div>

        {error && <div className="text-center text-[13px] text-danger">{error}</div>}

        <button
          type="submit"
          disabled={mutation.isPending || login.length === 0 || password.length === 0}
          className="rounded-[14px] bg-ink p-[17px] text-center text-base font-bold text-page disabled:opacity-60"
        >
          {t('login.submit')}
        </button>
      </form>

      <p className="text-center text-xs leading-normal whitespace-pre-line text-text-faint">
        {t('login.footnote')}
      </p>
    </div>
  );
}
