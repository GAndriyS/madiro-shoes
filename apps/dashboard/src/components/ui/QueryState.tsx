import { useTranslation } from 'react-i18next';

/** Centered loading placeholder while a query is pending (design-toned spinner). */
export function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-text-muted">
      <span
        className="h-7 w-7 animate-spin rounded-full border-2 border-border-input border-t-accent"
        role="status"
        aria-label={t('common.loading')}
      />
      <span className="text-[13px]">{t('common.loading')}</span>
    </div>
  );
}

/** Error card with a retry action — replaces the previous silent blank screen. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="font-display text-2xl font-semibold text-ink">{t('common.errorTitle')}</div>
      <div className="max-w-sm text-[13px] leading-normal text-text-muted">
        {t('common.errorBody')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 rounded-[11px] border-[1.5px] border-border-input px-5 py-2.5 text-[13px] font-semibold text-text-secondary"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

/**
 * Renders loading / error / content for a page-level query. Keeps a page's
 * static chrome (header, filters) mounted; only the data area swaps.
 */
export function QueryBoundary({
  isPending,
  isError,
  onRetry,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isError) {
    return <ErrorState onRetry={onRetry} />;
  }
  if (isPending) {
    return <LoadingState />;
  }
  return <>{children}</>;
}
