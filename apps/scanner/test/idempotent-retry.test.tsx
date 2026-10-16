import type {
  CheckoutResult,
  FoundPair,
  IntakeResult,
  ReturnLookupResponse,
  SaleLookupResponse,
} from '@madiro/shared';
import { ApiError, useAuthStore } from '@madiro/web-core';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { IntakeFlow } from '../src/components/intake/IntakeFlow';
import { ReturnFlow } from '../src/components/return/ReturnFlow';
import { CheckoutFlow } from '../src/components/sale/CheckoutFlow';
import { initI18n } from '../src/i18n';
import { useAttemptKey } from '../src/lib/attempt';
import { useFlashStore } from '../src/lib/flash';

/**
 * A lost response on mobile data (spec §5.2): every write here first gets no
 * answer, the flow retries once on its own, then the seller taps again. All of
 * it must travel under one Idempotency-Key and act on the same pair — the API
 * can only answer a repeat with the first result if it is told it is one.
 */
const apiPost = vi.fn();
vi.mock('@madiro/web-core', async () => {
  const actual = await vi.importActual<typeof import('@madiro/web-core')>('@madiro/web-core');
  return {
    ...actual,
    api: { ...actual.api, post: (...args: unknown[]) => apiPost(...args) },
  };
});

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

const seller = { id: 'u1', name: 'Оля', login: 'olia', role: 'SELLER' as const };

/** No answer at all: the request may or may not have reached the API. */
const noAnswer = () => Promise.reject(new ApiError(0, 'network error'));

/** Calls to one endpoint: [body, options]. */
const callsTo = (path: string) =>
  apiPost.mock.calls
    .filter(([p]) => p === path)
    .map(([, body, options]) => ({
      body,
      key: (options as { idempotencyKey?: string })?.idempotencyKey,
    }));

/** The automatic retry waits a second before going again. */
const noticeAfterRetry = () => screen.findByTestId('outcome-unknown', {}, { timeout: 3000 });

/** Network back, app back in front — what would normally refetch every query. */
const reconnect = async () => {
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    // Give any refetch this would start the time to reach the API mock.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const typeTag = async () => {
  await userEvent.type(screen.getByTestId('field-color'), '36');
  await userEvent.type(screen.getByTestId('field-style'), '7645');
  await userEvent.type(screen.getByTestId('field-size'), '38');
};

describe('повтор після «немає відповіді»', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    apiPost.mockReset();
    navigate.mockReset();
    useFlashStore.getState().clear();
    useAuthStore.getState().setSession({ accessToken: 'a', user: seller });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
  });

  describe('продаж', () => {
    const pair = (pairId: string): FoundPair => ({
      pairId,
      style: '7645',
      color: '36',
      size: 38,
      material: 'LEATHER',
      season: 'NONE',
      intakeDate: '2026-07-01T12:00:00.000Z',
      awaitingPrice: false,
    });
    const found = (pairId: string): SaleLookupResponse => ({
      combos: [{ material: 'LEATHER', season: 'NONE', sizes: [38] }],
      pair: pair(pairId),
      salePriceHint: 2850,
      similar: [],
    });
    const sold: CheckoutResult = {
      pairId: 'p-old',
      style: '7645',
      color: '36',
      size: 38,
      status: 'SOLD',
      salePrice: 2850,
      paymentMethod: 'CASH',
    };

    /**
     * The first lookup offers `p-old`; any later one offers `p-new`, which is
     * what stock looks like once the first sale has in fact landed.
     */
    const stockThatMovesOn = (sale: () => Promise<unknown>) => {
      let lookups = 0;
      apiPost.mockImplementation((path: string) => {
        if (path === '/sale/lookup') {
          lookups += 1;
          return Promise.resolve(found(lookups === 1 ? 'p-old' : 'p-new'));
        }
        return sale();
      });
    };

    const toDetailsAndConfirm = async () => {
      await typeTag();
      const next = screen.getByRole('button', { name: 'Далі — деталі виходу' });
      await waitFor(() => expect(next).toBeEnabled());
      await userEvent.click(next);
      await userEvent.click(screen.getByRole('button', { name: /Підтвердити продаж/ }));
    };

    it('та сама пара і той самий ключ — у автоповторі й у другому натисканні', async () => {
      const answers = [noAnswer, noAnswer, () => Promise.resolve(sold)];
      stockThatMovesOn(() => answers.shift()!());
      renderWithQuery(<CheckoutFlow manual />);

      await toDetailsAndConfirm();

      // Not «не вдалося зберегти»: the sale may well have gone through.
      expect(await noticeAfterRetry()).toHaveTextContent('операція могла вже пройти');
      expect(screen.queryByText('Не вдалося зберегти. Спробуйте ще раз.')).not.toBeInTheDocument();

      // Reconnecting would normally refetch the lookup — and offer `p-new`.
      await reconnect();
      expect(callsTo('/sale/lookup')).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: /Підтвердити продаж/ }));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }));

      const sales = callsTo('/sale');
      expect(sales).toHaveLength(3);
      expect(sales.map((call) => call.body)).toEqual(
        Array(3).fill({ pairId: 'p-old', salePrice: 2850, paymentMethod: 'CASH' }),
      );
      expect(sales[0]!.key).toEqual(expect.any(String));
      expect(new Set(sales.map((call) => call.key)).size).toBe(1);
      expect(useFlashStore.getState().flash?.title).toBe('Продаж зареєстровано');
    });

    // The earlier tap landed with other details (here: the server says so).
    it('422: попереднє натискання вже оформило пару — додому, без другого продажу', async () => {
      stockThatMovesOn(() => Promise.reject(new ApiError(422, 'key reused')));
      renderWithQuery(<CheckoutFlow manual />);

      await toDetailsAndConfirm();

      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }));
      expect(useFlashStore.getState().flash?.title).toBe(
        'Цю пару вже оформлено попереднім натисканням',
      );
      // A refusal is final: no automatic retry.
      expect(callsTo('/sale')).toHaveLength(1);
    });
  });

  describe('прийом', () => {
    const batch: IntakeResult = {
      variantId: 'v1',
      pairs: Array.from({ length: 10 }, (_, i) => ({ pairId: `p${i}`, size: 38 })),
      status: 'IN_STOCK',
      awaitingPrice: true,
    };

    it('повтор збереження несе той самий ключ і те саме тіло', async () => {
      const answers = [noAnswer, noAnswer, () => Promise.resolve(batch)];
      apiPost.mockImplementation(() => answers.shift()!());
      renderWithQuery(<IntakeFlow manual />);

      await userEvent.type(screen.getByTestId('field-color'), '36');
      await userEvent.type(screen.getByTestId('field-style'), '7645');
      await userEvent.type(screen.getByTestId('size-qty-38'), '10');
      await userEvent.click(screen.getByTestId('intake-save-finish'));

      expect(await noticeAfterRetry()).toHaveTextContent('прийом міг уже зберегтися');

      await userEvent.click(screen.getByTestId('intake-save-finish'));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }));

      const saves = callsTo('/intake');
      expect(saves).toHaveLength(3);
      expect(new Set(saves.map((call) => JSON.stringify(call.body))).size).toBe(1);
      expect(saves[0]!.key).toEqual(expect.any(String));
      expect(new Set(saves.map((call) => call.key)).size).toBe(1);
    });
  });

  describe('повернення', () => {
    const lookupOf = (operationId: string): ReturnLookupResponse => ({
      combos: [{ material: 'LEATHER', season: 'NONE' }],
      sale: {
        operationId,
        pairId: `pair-${operationId}`,
        style: '7645',
        color: '36',
        size: 38,
        material: 'LEATHER',
        season: 'NONE',
        salePrice: 2850,
        paymentMethod: 'CASH',
        soldAt: new Date().toISOString(),
        daysSince: 0,
        sellerName: 'Оля',
      },
    });
    const returned: CheckoutResult = {
      pairId: 'pair-op1',
      style: '7645',
      color: '36',
      size: 38,
      status: 'IN_STOCK',
      salePrice: 2850,
      paymentMethod: 'CASH',
    };

    // Two identical pairs were sold. If the first return landed, a fresh
    // lookup shows the other sale — the retry must still name the first.
    it('повтор повертає той самий продаж під тим самим ключем, без рефетчу', async () => {
      let lookups = 0;
      const answers = [noAnswer, noAnswer, () => Promise.resolve(returned)];
      apiPost.mockImplementation((path: string) => {
        if (path === '/returns/lookup') {
          lookups += 1;
          return Promise.resolve(lookupOf(lookups === 1 ? 'op1' : 'op2'));
        }
        return answers.shift()!();
      });
      renderWithQuery(<ReturnFlow />);

      await userEvent.click(screen.getByRole('button', { name: 'Ввести вручну' }));
      await typeTag();
      const cta = await screen.findByRole('button', { name: /Повернути на склад/ });
      await userEvent.click(cta);

      expect(await noticeAfterRetry()).toHaveTextContent('повернення могло вже пройти');
      await reconnect();
      expect(callsTo('/returns/lookup')).toHaveLength(1);

      await userEvent.click(screen.getByRole('button', { name: /Повернути на склад/ }));
      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/' }));

      const returns = callsTo('/returns');
      expect(returns.map((call) => call.body)).toEqual(Array(3).fill({ operationId: 'op1' }));
      expect(new Set(returns.map((call) => call.key)).size).toBe(1);
    });
  });
});

describe('useAttemptKey', () => {
  it('ключ тримається за ціль спроби і змінюється з новою ціллю або після успіху', () => {
    const { result } = renderHook(() => useAttemptKey());
    const first = result.current.keyFor('p1');

    expect(result.current.keyFor('p1')).toBe(first);
    const other = result.current.keyFor('p2');
    expect(other).not.toBe(first);

    result.current.settle();
    expect(result.current.keyFor('p2')).not.toBe(other);
  });
});
