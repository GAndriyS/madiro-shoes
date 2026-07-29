import type { IntakeInput } from '@madiro/shared';
import { useAuthStore } from '@madiro/web-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmForm, type SaveMode } from '../src/components/intake/ConfirmForm';
import { initI18n } from '../src/i18n';

// The form asks the API for a purchase price hint; the network is not the
// subject here, so only that one call is stubbed.
const apiGet = vi.fn();
vi.mock('@madiro/web-core', async () => {
  const actual = await vi.importActual<typeof import('@madiro/web-core')>('@madiro/web-core');
  return { ...actual, api: { ...actual.api, get: (path: string) => apiGet(path) } };
});

const recognition = { size: 38, color: '36', style: '7645', confidence: 0.97 };
const seller = { id: 'u1', name: 'Оля', login: 'olia', role: 'SELLER' as const };
const admin = { id: 'a1', name: 'Адмін', login: 'admin', role: 'ADMIN' as const };

const asSeller = () => useAuthStore.getState().setSession({ accessToken: 'a', user: seller });
const asAdmin = () => useAuthStore.getState().setSession({ accessToken: 'a', user: admin });

describe('ConfirmForm', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    // Default: nothing known about this variant, so no hint interferes.
    apiGet.mockReset();
    apiGet.mockResolvedValue({ purchasePrice: null });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
  });

  const renderForm = (
    opts: {
      overrides?: Partial<typeof recognition>;
      onSave?: (input: IntakeInput, mode: SaveMode) => void;
    } = {},
  ) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <ConfirmForm
          recognition={{ ...recognition, ...opts.overrides }}
          saving={false}
          onSave={opts.onSave ?? (() => {})}
          onRescan={() => {}}
          onBack={() => {}}
        />
      </QueryClientProvider>,
    );
  };

  it('префілить SIZE/COLOR/STYLE з результату розпізнавання', () => {
    asSeller();
    renderForm();
    expect(screen.getByDisplayValue('38')).toBeInTheDocument();
    expect(screen.getByDisplayValue('36')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7645')).toBeInTheDocument();
  });

  it('показує підказку лише при низькій упевненості (< 0.8)', () => {
    asSeller();
    const { unmount } = renderForm({ overrides: { confidence: 0.5 } });
    expect(screen.getByText(/звірте цифри з біркою/)).toBeInTheDocument();
    unmount();

    renderForm({ overrides: { confidence: 0.97 } });
    expect(screen.queryByText(/звірте цифри з біркою/)).not.toBeInTheDocument();
  });

  it('пілюлі: утеплення одиничний вибір, матеріал знімається повторним тапом', async () => {
    asSeller();
    renderForm();
    const baika = screen.getByRole('button', { name: 'Байка' });
    const leather = screen.getByRole('button', { name: 'Шкіра' });

    expect(screen.getByRole('button', { name: 'Без' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(baika);
    expect(baika).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Без' })).toHaveAttribute('aria-pressed', 'false');

    expect(leather).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(leather);
    expect(leather).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(leather);
    expect(leather).toHaveAttribute('aria-pressed', 'false');
  });

  it('продавець: інфо-панель чернетки, без секції ціни, чернетковий payload', async () => {
    asSeller();
    const onSave = vi.fn();
    renderForm({ onSave });

    expect(screen.getByText(/Ціну закупки додасть адміністратор/)).toBeInTheDocument();
    expect(screen.queryByText('ЦІНА ЗАКУПКИ')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'У чернетки і сканувати наступну' }));
    expect(onSave).toHaveBeenCalledWith(
      { size: 38, color: '36', style: '7645', season: 'NONE' },
      'next',
    );
  });

  it('адмін: без ціни кнопки задизейблені, введена ціна → payload з purchasePrice', async () => {
    asAdmin();
    const onSave = vi.fn();
    renderForm({ onSave });

    expect(screen.getByText('ЦІНА ЗАКУПКИ')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'На склад і сканувати наступну' });
    expect(next).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('Ціна'), '1400');
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(onSave).toHaveBeenCalledWith(
      { size: 38, color: '36', style: '7645', season: 'NONE', purchasePrice: 1400 },
      'next',
    );
  });

  it('адмін «без ціни — старий товар»: payload з purchasePrice = null', async () => {
    asAdmin();
    const onSave = vi.fn();
    renderForm({ onSave });

    await userEvent.click(screen.getByRole('button', { name: 'Без ціни — старий товар' }));
    const finish = screen.getByRole('button', { name: 'Зберегти й завершити' });
    expect(finish).toBeEnabled();
    await userEvent.click(finish);
    expect(onSave).toHaveBeenCalledWith(
      { size: 38, color: '36', style: '7645', season: 'NONE', purchasePrice: null },
      'finish',
    );
  });

  describe('підказка ціни закупки (FR-D-08)', () => {
    it('адмін: ціна відомого варіанта підставляється у поле', async () => {
      asAdmin();
      apiGet.mockResolvedValue({ purchasePrice: 1750 });
      renderForm();

      await waitFor(() => expect(screen.getByPlaceholderText('Ціна')).toHaveValue('1750'));
      expect(screen.getByText(/Підставлено ціну цього варіанта/)).toBeInTheDocument();
    });

    // A suggestion must never overwrite what a person just typed.
    it('введена вручну ціна не перезаписується підказкою', async () => {
      asAdmin();
      let resolveHint: (value: { purchasePrice: number }) => void = () => {};
      apiGet.mockReturnValue(
        new Promise<{ purchasePrice: number }>((resolve) => {
          resolveHint = resolve;
        }),
      );
      renderForm();

      await userEvent.type(screen.getByPlaceholderText('Ціна'), '999');
      resolveHint({ purchasePrice: 1750 });

      await waitFor(() => expect(apiGet).toHaveBeenCalled());
      expect(screen.getByPlaceholderText('Ціна')).toHaveValue('999');
      expect(screen.queryByText(/Підставлено ціну цього варіанта/)).not.toBeInTheDocument();
    });

    it('варіант «без ціни — старий товар» (0) відкриває той самий режим', async () => {
      asAdmin();
      apiGet.mockResolvedValue({ purchasePrice: 0 });
      renderForm();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Вказати ціну' })).toBeInTheDocument(),
      );
    });

    // FR-B-02: the endpoint is admin-only, so a seller must not even call it.
    it('продавець не запитує підказку взагалі', async () => {
      asSeller();
      renderForm();

      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(apiGet).not.toHaveBeenCalled();
    });
  });

  it('бейдж ролі: ПРОДАВЕЦЬ для продавця, АДМІН для адміна', () => {
    asSeller();
    const { unmount } = renderForm();
    expect(screen.getByText('ПРОДАВЕЦЬ')).toBeInTheDocument();
    unmount();

    asAdmin();
    renderForm();
    expect(screen.getByText('АДМІН')).toBeInTheDocument();
  });
});
