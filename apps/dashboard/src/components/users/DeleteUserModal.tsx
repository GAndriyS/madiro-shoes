import type { Seller } from '@madiro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '@madiro/web-core';
import { initials } from '@madiro/web-core';
import { TrashIcon } from '@madiro/web-core';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@madiro/web-core';

interface Props {
  seller: Seller | null;
  onClose: () => void;
}

/** Seller deletion confirmation — history stays in reports (design 4f). */
export function DeleteUserModal({ seller, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => api.delete(`/users/${seller?.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  if (seller == null) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[420px] gap-4">
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-danger-bg text-danger">
          <TrashIcon size={20} />
        </div>
        <DialogTitle className="font-display text-[26px] font-semibold text-ink">
          {t('users.deleteTitle')}
        </DialogTitle>
        <DialogDescription className="text-[13.5px] leading-[1.55] text-text">
          {t('users.deleteBody', { name: seller.name })}
        </DialogDescription>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-chart-bar text-[11.5px] font-extrabold text-accent-hover">
            {initials(seller.name)}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-ink">
              {seller.name} · {seller.login}
            </span>
            <span className="text-[11px] text-text-muted">
              {t('users.roleSeller').toLowerCase()} ·{' '}
              {t('users.sales', { count: seller.salesThisMonth })} ·{' '}
              {t('users.drafts', { count: seller.draftsInQueue })}
            </span>
          </div>
        </div>
        {mutation.isError && <p className="text-[13px] text-danger">{t('common.actionError')}</p>}
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 rounded-xl bg-danger p-3.5 text-center text-[14.5px] font-bold text-white disabled:opacity-60"
          >
            {t('users.deleteConfirm')}
          </button>
          <DialogClose className="flex-1 rounded-xl border-[1.5px] border-border-input p-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
            {t('users.cancel')}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
