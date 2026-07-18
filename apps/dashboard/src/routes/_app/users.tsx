import { sellersResponseSchema, type Seller } from '@madiro/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PlusIcon, UsersIcon } from '../../components/layout/icons';
import { QueryBoundary } from '../../components/ui/QueryState';
import { DeleteUserModal } from '../../components/users/DeleteUserModal';
import { UserCard } from '../../components/users/UserCard';
import { UserFormModal, type UserFormTarget } from '../../components/users/UserFormModal';
import { api } from '../../lib/api';

export const Route = createFileRoute('/_app/users')({
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  const [formTarget, setFormTarget] = useState<UserFormTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Seller | null>(null);

  const {
    data: sellers,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['users'],
    queryFn: async () => sellersResponseSchema.parse(await api.get<Seller[]>('/users')),
  });

  const requestDelete = (seller: Seller) => {
    setFormTarget(null);
    setDeleteTarget(seller);
  };

  return (
    <div className="flex h-full flex-col gap-3 md:gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3 md:gap-4">
          <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
            {t('users.title')}
          </h1>
          {sellers && sellers.length > 0 && (
            <span className="text-xs text-text-muted md:text-[13px]">
              {t('users.sellers', { count: sellers.length })}
            </span>
          )}
        </div>
        {/* Desktop/tablet: dark button (4a/4b); mobile: accent text link (4c) */}
        <button
          type="button"
          onClick={() => setFormTarget({ mode: 'add' })}
          className="hidden items-center gap-2 rounded-[11px] bg-ink px-[18px] py-2.5 text-[13px] font-bold text-page md:flex"
        >
          <PlusIcon size={15} />
          {t('users.add')}
        </button>
        <button
          type="button"
          onClick={() => setFormTarget({ mode: 'add' })}
          className="flex items-center gap-1.5 text-xs font-bold text-accent md:hidden"
        >
          <PlusIcon size={14} />
          {t('users.addShort')}
        </button>
      </div>

      <QueryBoundary isPending={isPending} isError={isError} onRetry={() => void refetch()}>
        {sellers && sellers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 rounded-[14px] border border-border bg-surface py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-border-row text-text-muted">
              <UsersIcon size={24} />
            </div>
            <div className="font-display text-2xl font-semibold text-ink">
              {t('users.emptyTitle')}
            </div>
            <div className="text-center text-[13px] leading-normal text-text-muted">
              {t('users.emptyBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 md:gap-3">
            {sellers?.map((seller) => (
              <UserCard
                key={seller.id}
                seller={seller}
                onEdit={(s) => setFormTarget({ mode: 'edit', seller: s })}
                onDelete={requestDelete}
              />
            ))}
          </div>
        )}
      </QueryBoundary>

      <p className="mt-auto px-0.5 text-xs leading-normal text-text-faint">{t('users.footnote')}</p>

      <UserFormModal
        target={formTarget}
        onClose={() => setFormTarget(null)}
        onDeleteRequest={requestDelete}
      />
      <DeleteUserModal seller={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
