import type { MeSummary } from '@madiro/shared';
import {
  BottomSheetContent,
  ChevronRightIcon,
  Dialog,
  DialogTitle,
  LogoutIcon,
  initials,
  useAuthStore,
} from '@madiro/web-core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
  summary: MeSummary | undefined;
}

/** Profile bottom sheet (design 1a, screen 3). */
export function ProfileSheet({ open, onClose, summary }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const logout = () => {
    clearSession();
    queryClient.clear();
    void navigate({ to: '/login' });
  };

  if (!user) {
    return null;
  }
  const isSeller = user.role === 'SELLER';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <BottomSheetContent aria-describedby={undefined}>
        <div className="flex items-center gap-3.5">
          <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-chart-bar text-base font-bold text-accent-hover">
            {initials(user.name)}
          </div>
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="font-display text-2xl font-semibold text-ink">
              {user.name}
            </DialogTitle>
            <span className="text-[12.5px] text-text-muted">
              {isSeller ? t('profile.roleSeller') : t('profile.roleAdmin')} · {user.login}
            </span>
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-surface px-[18px] py-1">
          <Link
            to="/my-sales"
            onClick={onClose}
            className="flex items-center justify-between border-b border-border-row py-3.5"
          >
            <span className="text-[14.5px] font-semibold text-ink">{t('profile.mySales')}</span>
            <ChevronRightIcon size={16} className="text-text-faint" />
          </Link>
          {isSeller && (
            <Link
              to="/my-drafts"
              onClick={onClose}
              className="flex items-center justify-between py-3.5"
            >
              <span className="text-[14.5px] font-semibold text-ink">{t('profile.myDrafts')}</span>
              <span className="flex items-center gap-2">
                {summary != null && summary.draftsInQueue > 0 && (
                  <span className="rounded-[10px] bg-[#e9dfc9] px-2 py-[3px] text-[11.5px] font-bold text-accent-hover">
                    {summary.draftsInQueue}
                  </span>
                )}
                <ChevronRightIcon size={16} className="text-text-faint" />
              </span>
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-[#d4a08a] bg-surface p-[15px] text-[15px] font-bold text-danger"
        >
          <LogoutIcon size={18} />
          {t('profile.logout')}
        </button>

        <p className="text-center text-xs text-text-faint">{t('profile.footnote')}</p>
      </BottomSheetContent>
    </Dialog>
  );
}
