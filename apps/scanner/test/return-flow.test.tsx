import type { ReturnLookupResponse } from '@madiro/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReturnConfirm } from '../src/components/return/ReturnConfirm';
import { initI18n } from '../src/i18n';

const soldAt = new Date(Date.now() - 2 * 86_400_000).toISOString();

const found: ReturnLookupResponse = {
  sale: {
    operationId: 'op1',
    pairId: 'p1',
    style: '7645',
    color: '36',
    size: 38,
    material: 'LEATHER',
    season: 'SHEEPSKIN',
    salePrice: 2850,
    paymentMethod: 'CARD',
    soldAt,
    daysSince: 2,
    sellerName: 'Оля',
  },
};
const notFound: ReturnLookupResponse = { sale: null };

describe('ReturnConfirm', () => {
  beforeAll(() => {
    initI18n();
  });
  afterEach(cleanup);

  const renderConfirm = (
    lookup: ReturnLookupResponse,
    opts: { onConfirm?: (id: string) => void; daysSince?: number } = {},
  ) => {
    const data =
      opts.daysSince != null && lookup.sale
        ? { sale: { ...lookup.sale, daysSince: opts.daysSince } }
        : lookup;
    return render(
      <ReturnConfirm
        size="38"
        color="36"
        style="7645"
        onFieldChange={() => {}}
        lookup={data}
        loading={false}
        saving={false}
        onConfirm={opts.onConfirm ?? (() => {})}
        onRescan={() => {}}
        onBack={() => {}}
      />,
    );
  };

  it('картка продажу: пара, риси, рядок «Продано … · картка · Оля», ціна', () => {
    renderConfirm(found);
    expect(screen.getByText('7645 · колір 36 · р. 38')).toBeInTheDocument();
    expect(screen.getByText('Шкіра · овчина')).toBeInTheDocument();
    expect(screen.getByText(/Продано .* — 2 дні тому · картка · Оля/)).toBeInTheDocument();
    expect(screen.getByText('2 850 ₴')).toBeInTheDocument();
    expect(
      screen.getByText('Пара повернеться на склад, продаж буде скасовано у статистиці'),
    ).toBeInTheDocument();
  });

  it('CTA з відʼємною сумою викликає onConfirm з operationId', async () => {
    const onConfirm = vi.fn();
    renderConfirm(found, { onConfirm });

    const cta = screen.getByRole('button', { name: /Повернути на склад/ });
    expect(cta.textContent).toContain('−2'); // signed amount in the CTA
    await userEvent.click(cta);
    expect(onConfirm).toHaveBeenCalledWith('op1');
  });

  it('понад 14 днів — показує орієнтирну підказку, але CTA активна', () => {
    renderConfirm(found, { daysSince: 20 });
    expect(screen.getByText(/орієнтир, повернення не блокується/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Повернути на склад/ })).toBeEnabled();
  });

  it('продаж не знайдено: червона картка, CTA відсутня', () => {
    renderConfirm(notFound);
    expect(screen.getByText('Продаж не знайдено')).toBeInTheDocument();
    expect(screen.getByText(/Немає проданої пари 7645 · 36 · р. 38/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Повернути на склад/ })).not.toBeInTheDocument();
  });
});
