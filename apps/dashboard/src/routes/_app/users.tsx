import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/users')({
  component: UsersPage,
});

function UsersPage() {
  const { t } = useTranslation();
  return <h1 className="font-display text-[30px] font-semibold text-ink">{t('users.title')}</h1>;
}
