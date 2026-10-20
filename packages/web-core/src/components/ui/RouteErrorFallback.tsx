import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// What each engine says when a code-split chunk cannot be loaded — Chrome,
// Firefox, Safari, Vite's CSS preloader, and Safari again for a JS request
// answered with an HTML page (what the SPA fallback used to do for /assets).
const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i;

/**
 * True when the error is a code-split chunk that failed to load — in practice,
 * a tab opened before a deploy asking for a hashed file the new build no
 * longer has. That is not a bug in the screen, and reloading fixes it.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  return message !== undefined && CHUNK_LOAD_ERROR.test(message);
}

const RELOAD_STAMP_KEY = 'madiro.chunkReloadAt';
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * Reloads the page once for a stale chunk. A chunk still missing straight after
 * a reload is not a stale tab — the deploy itself is broken — so a second
 * attempt inside the cooldown is refused rather than looping forever. Without
 * sessionStorage there is no way to tell, so it never reloads on its own.
 */
export function reloadForNewVersion(reload: () => void, now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY));
    if (last && now - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

function reloadPage(): void {
  window.location.reload();
}

interface RouteErrorFallbackProps {
  error: unknown;
  /** The page reload; injectable only so tests can observe it. */
  reload?: () => void;
}

/**
 * The router's default error screen (`defaultErrorComponent`). Typed loosely so
 * web-core stays router-agnostic: TanStack passes `{ error, reset, info }`.
 *
 * A stale chunk reloads by itself once and otherwise asks for a reload; any
 * other error gets a plain apology and the same button. Strings come from the
 * app's `common.*` keys (updateTitle, updateBody, crashTitle, crashBody, reload).
 */
export function RouteErrorFallback({ error, reload = reloadPage }: RouteErrorFallbackProps) {
  const { t } = useTranslation();
  const stale = isChunkLoadError(error);

  useEffect(() => {
    if (stale) {
      reloadForNewVersion(reload);
    } else {
      // A production build logs nothing for a route error on its own.
      console.error(error);
    }
  }, [stale, error, reload]);

  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
    >
      <div className="font-display text-2xl font-semibold text-ink">
        {t(stale ? 'common.updateTitle' : 'common.crashTitle')}
      </div>
      <div className="max-w-sm text-[13px] leading-normal text-text-muted">
        {t(stale ? 'common.updateBody' : 'common.crashBody')}
      </div>
      <button
        type="button"
        onClick={reload}
        className="mt-1 rounded-[11px] border-[1.5px] border-border-input px-5 py-2.5 text-[13px] font-semibold text-text-secondary"
      >
        {t('common.reload')}
      </button>
    </div>
  );
}
