import { createUserSchema, updateUserSchema, type Seller } from '@madiro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { api, ApiError } from '../../lib/api';
import { CloseIcon, EyeIcon, EyeOffIcon, TrashIcon } from '../layout/icons';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

export type UserFormTarget = { mode: 'add' } | { mode: 'edit'; seller: Seller };

interface Props {
  target: UserFormTarget | null;
  onClose: () => void;
  onDeleteRequest: (seller: Seller) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-[1.5px] text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  'w-full rounded-xl border-[1.5px] border-border-input bg-surface px-4 py-[13px] text-[15px] text-ink outline-none focus:border-ink';

/** Add / edit seller modal (designs 4d and 4e). */
export function UserFormModal({ target, onClose, onDeleteRequest }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = target?.mode === 'edit';
  const seller = isEdit ? target.seller : null;

  useEffect(() => {
    setName(seller?.name ?? '');
    setLogin(seller?.login ?? '');
    setPassword('');
    setError(null);
  }, [target?.mode, seller?.id, seller?.name, seller?.login]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit && seller) {
        const body = updateUserSchema.parse({
          name,
          login,
          ...(password ? { password } : {}),
        });
        return api.patch(`/users/${seller.id}`, body);
      }
      const body = createUserSchema.parse({ name, login, password });
      return api.post('/users', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? t('users.loginTaken')
          : t('users.genericError'),
      );
    },
  });

  if (target == null) {
    return null;
  }

  const valid = (isEdit ? updateUserSchema : createUserSchema).safeParse({
    name,
    login,
    ...(password || !isEdit ? { password } : {}),
  }).success;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[460px]">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <DialogTitle className="font-display text-[26px] font-semibold text-ink">
              {isEdit ? t('users.editTitle') : t('users.addTitle')}
            </DialogTitle>
            {isEdit && seller && (
              <DialogDescription className="text-[13px] text-text-muted">
                {seller.name} · {t('users.roleSeller').toLowerCase()} ·{' '}
                {t('users.sales', { count: seller.salesThisMonth })}
              </DialogDescription>
            )}
          </div>
          <DialogClose className="text-text-muted hover:text-ink">
            <CloseIcon size={20} />
          </DialogClose>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          <Field label={t('users.nameLabel')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={INPUT_CLASS}
            />
          </Field>

          <div className={isEdit ? 'flex flex-col gap-[18px]' : 'grid grid-cols-2 gap-2.5'}>
            <Field label={t('users.loginLabel')}>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={isEdit ? t('users.newPasswordLabel') : t('users.passwordLabel')}>
              <div className="flex items-center rounded-xl border-[1.5px] border-border-input bg-surface focus-within:border-ink">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? t('users.keepPassword') : undefined}
                  autoComplete="new-password"
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-text-faint"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="px-3.5 text-text-faint"
                >
                  {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                </button>
              </div>
            </Field>
          </div>

          {!isEdit && (
            <div className="rounded-xl border border-border bg-surface px-4 py-[13px] text-xs leading-normal text-text-muted">
              <strong className="text-text">{t('users.roleInfo').split(':')[0]}:</strong>
              {t('users.roleInfo').slice(t('users.roleInfo').indexOf(':') + 1)}
            </div>
          )}

          {error && <div className="text-[13px] text-danger">{error}</div>}

          <div className="flex gap-2.5">
            <button
              type="submit"
              disabled={!valid || mutation.isPending}
              className="flex-1 rounded-xl bg-ink p-3.5 text-center text-[14.5px] font-bold text-page disabled:opacity-60"
            >
              {isEdit ? t('users.save') : t('users.create')}
            </button>
            <DialogClose className="rounded-xl border-[1.5px] border-border-input px-5 py-3.5 text-center text-[14.5px] font-semibold text-text-secondary">
              {t('users.cancel')}
            </DialogClose>
          </div>

          {isEdit && seller && (
            <button
              type="button"
              onClick={() => onDeleteRequest(seller)}
              className="flex items-center justify-center gap-1.5 text-[12.5px] font-bold text-danger"
            >
              <TrashIcon size={14} />
              {t('users.deleteLink')}
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
