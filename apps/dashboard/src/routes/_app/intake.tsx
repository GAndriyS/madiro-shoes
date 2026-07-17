import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/intake')({
  component: IntakePage,
});

function IntakePage() {
  const { t } = useTranslation();
  return <h1 className="font-display text-[30px] font-semibold text-ink">{t('intake.title')}</h1>;
}
