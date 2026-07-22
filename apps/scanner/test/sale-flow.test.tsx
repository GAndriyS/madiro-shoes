import type { FoundPair, SaleLookupResponse } from '@madiro/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SaleConfirm } from '../src/components/sale/SaleConfirm';
import { SaleDetails, type CheckoutPayload } from '../src/components/sale/SaleDetails';
import { initI18n } from '../src/i18n';

const pair: FoundPair = {
  pairId: 'p1',
  style: '7645',
  color: '36',
  size: 38,
  material: 'LEATHER',
  season: 'SHEEPSKIN',
  intakeDate: '2026-03-12T10:00:00.000Z',
  awaitingPrice: false,
};

describe('SaleDetails', () => {
  beforeAll(() => {
    initI18n();
  });
  afterEach(cleanup);

  const renderDetails = (
    opts: { hint?: number | null; onConfirm?: (p: CheckoutPayload) => void } = {},
  ) =>
    render(
      <SaleDetails
        pair={pair}
        salePriceHint={opts.hint ?? null}
        saving={false}
        onConfirm={opts.onConfirm ?? (() => {})}
        onBack={() => {}}
      />,
    );

  it('картка пари: стиль · колір · розмір, матеріал/утеплення і дата', () => {
    renderDetails();
    expect(screen.getByText('7645 · колір 36 · р. 38')).toBeInTheDocument();
    expect(screen.getByText(/Шкіра · овчина · на складі з 12\.03/)).toBeInTheDocument();
  });

  it('підказка ціни префілить поле; продаж вимкнено без ціни', async () => {
    const { unmount } = renderDetails({ hint: 2850 });
    expect(screen.getByDisplayValue('2850')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Підтвердити продаж/ })).toBeEnabled();
    unmount();

    renderDetails({ hint: null });
    expect(screen.getByRole('button', { name: /Підтвердити продаж/ })).toBeDisabled();
  });

  it('продаж: payload з ціною і оплатою (Картка після перемикання)', async () => {
    const onConfirm = vi.fn();
    renderDetails({ hint: 2850, onConfirm });

    await userEvent.click(screen.getByRole('button', { name: 'Картка' }));
    await userEvent.click(screen.getByRole('button', { name: /Підтвердити продаж/ }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'sale',
      salePrice: 2850,
      paymentMethod: 'CARD',
    });
  });

  it('списання: без ціни, з коментарем', async () => {
    const onConfirm = vi.fn();
    renderDetails({ onConfirm });

    await userEvent.click(screen.getByRole('button', { name: 'Списання' }));
    expect(screen.queryByText('ЦІНА ПРОДАЖУ')).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'Дефект підошви');
    await userEvent.click(screen.getByRole('button', { name: 'Підтвердити списання' }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'writeoff', comment: 'Дефект підошви' });
  });
});

describe('SaleConfirm', () => {
  beforeAll(() => {
    initI18n();
  });
  afterEach(cleanup);

  const lookupFound: SaleLookupResponse = {
    combos: [{ material: 'LEATHER', season: 'SHEEPSKIN', sizes: [37, 38] }],
    pair,
    salePriceHint: 2850,
    similar: [],
  };
  const lookupNotFound: SaleLookupResponse = {
    combos: [],
    pair: null,
    salePriceHint: null,
    similar: [{ style: '9031', color: '41', size: 39, count: 2 }],
  };

  const renderConfirm = (lookup: SaleLookupResponse, onNext = vi.fn()) =>
    render(
      <SaleConfirm
        photoUrl={null}
        size="38"
        color="36"
        style="7645"
        onFieldChange={() => {}}
        lookup={lookup}
        loading={false}
        selectedCombo={undefined}
        onComboSelect={() => {}}
        onSizeSelect={() => {}}
        onNext={onNext}
        onRescan={() => {}}
        onManualSearch={() => {}}
        onBack={() => {}}
      />,
    );

  it('знайдено: комбінація і розміри показані, «Далі» активна', () => {
    renderConfirm(lookupFound);
    expect(screen.getByRole('button', { name: 'Шкіра · Овчина' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '37' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далі — деталі виходу' })).toBeEnabled();
  });

  it('не знайдено: червона картка + схожі з кількістю пар', () => {
    renderConfirm(lookupNotFound);
    expect(screen.getByText('Пару не знайдено на складі')).toBeInTheDocument();
    expect(screen.getByText(/Немає пари 7645 · 36 · р. 38/)).toBeInTheDocument();
    expect(screen.getByText('9031 · 41 · р. 39')).toBeInTheDocument();
    expect(screen.getByText('2 пари')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пошук по складу вручну' })).toBeInTheDocument();
  });
});
