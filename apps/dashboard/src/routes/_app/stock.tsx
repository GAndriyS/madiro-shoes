import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/stock')({
  component: StockPage,
});

function StockPage() {
  const { t } = useTranslation();
  return <h1 className="font-display text-[30px] font-semibold text-ink">{t('stock.title')}</h1>;
}
