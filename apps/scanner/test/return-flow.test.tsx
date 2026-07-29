import type { ReturnLookupResponse } from '@madiro/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ReturnConfirm } from '../src/components/return/ReturnConfirm';
import { initI18n } from '../src/i18n';

const soldAt = new Date(Date.now() - 2 * 86_400_000).toISOString();

const found: ReturnLookupResponse = {
  combos: [{ material: 'LEATHER', season: 'SHEEPSKIN' }],
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
const notFound: ReturnLookupResponse = { combos: [], sale: null };
/** Same tag, two sold variants — the server refuses to guess (rule 3.3 #5). */
const ambiguous: ReturnLookupResponse = {
  combos: [
    { material: 'LEATHER', season: 'SHEEPSKIN' },
    { material: 'SUEDE', season: 'NONE' },
  ],
  sale: null,
};

describe('ReturnConfirm', () => {
  beforeAll(() => {
    initI18n();
  });
  afterEach(cleanup);

  const renderConfirm = (
    lookup: ReturnLookupResponse,
    opts: {
      onConfirm?: (id: string) => void;
      daysSince?: number;
      onComboSelect?: (combo: { material: unknown; season: unknown }) => void;
    } = {},
  ) => {
    const data =
      opts.daysSince != null && lookup.sale
        ? { ...lookup, sale: { ...lookup.sale, daysSince: opts.daysSince } }
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
        onComboSelect={opts.onComboSelect}
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

  it('кілька комбінацій під біркою: підказка вибору замість картки продажу', async () => {
    const onComboSelect = vi.fn();
    renderConfirm(ambiguous, { onComboSelect });

    expect(screen.getByText(/оберіть утеплення й матеріал/)).toBeInTheDocument();
    // Not the «Продаж не знайдено» error — the sale exists, the choice does not.
    expect(screen.queryByText('Продаж не знайдено')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Повернути на склад/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Замша · Без' }));
    expect(onComboSelect).toHaveBeenCalledWith({ material: 'SUEDE', season: 'NONE' });
  });

  // Manual entry (S-2.1): the confirm step opens with empty fields and no
  // lookup yet — that must read as "type the tag", not as "sale not found".
  it('ручний ввід: порожні поля без помилки і без CTA, поля редаговані', async () => {
    const onFieldChange = vi.fn();
    render(
      <ReturnConfirm
        size=""
        color=""
        style=""
        onFieldChange={onFieldChange}
        lookup={undefined}
        loading={false}
        saving={false}
        onConfirm={() => {}}
        onRescan={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.queryByText('Продаж не знайдено')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Повернути на склад/ })).not.toBeInTheDocument();

    const sizeInput = screen.getByText('SIZE').parentElement!.querySelector('input')!;
    await userEvent.type(sizeInput, '3');
    expect(onFieldChange).toHaveBeenCalledWith('size', '3');
  });

  it('продаж не знайдено: червона картка, CTA відсутня', () => {
    renderConfirm(notFound);
    expect(screen.getByText('Продаж не знайдено')).toBeInTheDocument();
    expect(screen.getByText(/Немає проданої пари 7645 · 36 · р. 38/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Повернути на склад/ })).not.toBeInTheDocument();
  });
});
