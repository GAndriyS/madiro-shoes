import type { Seller } from '@madiro/shared';
import { useTranslation } from 'react-i18next';

import { dayLabel, initials } from '../../lib/format';
import { PencilIcon, TrashIcon } from '../layout/icons';

interface Props {
  seller: Seller;
  onEdit: (seller: Seller) => void;
  onDelete: (seller: Seller) => void;
}

/** Seller card (design 4a desktop / 4b tablet / 4c mobile — one responsive component). */
export function UserCard({ seller, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const activity = `${t('users.sales', { count: seller.salesThisMonth })} · ${t('users.drafts', {
    count: seller.draftsInQueue,
  })}`;
  const activeWhen =
    seller.lastActiveAt != null ? dayLabel(seller.lastActiveAt) : t('users.neverActive');

  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-border bg-surface px-[18px] py-4 lg:gap-[18px] lg:px-[22px] lg:py-[18px]">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-chart-bar text-[13px] font-extrabold text-accent-hover lg:h-11 lg:w-11 lg:text-sm">
        {initials(seller.name)}
      </div>

      {/* Desktop (>=1100): wide columns per design 4a */}
      <div className="hidden w-[220px] flex-col gap-0.5 lg:flex">
        <span className="text-[15px] font-extrabold text-ink">{seller.name}</span>
        <span className="text-xs text-text-muted">
          {t('users.loginPrefix', { login: seller.login })}
        </span>
      </div>
      <span className="hidden flex-none rounded-2xl border-[1.5px] border-border-input px-3.5 py-[5px] text-[11.5px] font-bold text-text-secondary lg:inline">
        {t('users.roleSeller')}
      </span>
      <span className="hidden flex-1 text-[12.5px] text-text-muted lg:inline">{activity}</span>
      <span className="hidden text-xs text-text-muted lg:inline">
        {t('users.activeAt', { when: activeWhen })}
      </span>

      {/* Tablet/mobile (<1100): compact stacked line per design 4b/4c */}
      <div className="flex flex-1 flex-col gap-0.5 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[14.5px] font-extrabold text-ink">{seller.name}</span>
          <span className="rounded-xl border border-border-input px-2.5 py-0.5 text-[10px] font-bold text-text-secondary">
            {t('users.roleSeller')}
          </span>
        </div>
        <span className="text-[11.5px] text-text-muted">
          {seller.login} · {activity} · {activeWhen}
        </span>
      </div>

      <div className="flex gap-3 lg:gap-3.5">
        <button
          type="button"
          aria-label={t('users.editTitle')}
          onClick={() => onEdit(seller)}
          className="text-text-muted hover:text-ink"
        >
          <PencilIcon size={15} />
        </button>
        <button
          type="button"
          aria-label={t('users.deleteLink')}
          onClick={() => onDelete(seller)}
          className="hidden text-danger md:block"
        >
          <TrashIcon size={15} />
        </button>
      </div>
    </div>
  );
}
