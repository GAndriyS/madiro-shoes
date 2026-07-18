import { useAuthStore } from '@madiro/web-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ConfirmForm } from '../src/components/intake/ConfirmForm';
import { initI18n } from '../src/i18n';

const recognition = { size: 38, color: '36', style: '7645', confidence: 0.97 };
const seller = { id: 'u1', name: 'Оля', login: 'olia', role: 'SELLER' as const };

describe('ConfirmForm', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearSession();
  });

  const renderForm = (overrides: Partial<typeof recognition> = {}) =>
    render(
      <ConfirmForm
        recognition={{ ...recognition, ...overrides }}
        onRescan={() => {}}
        onBack={() => {}}
      />,
    );

  it('префілить SIZE/COLOR/STYLE з результату розпізнавання', () => {
    renderForm();
    expect(screen.getByDisplayValue('38')).toBeInTheDocument();
    expect(screen.getByDisplayValue('36')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7645')).toBeInTheDocument();
  });

  it('кнопка збереження дизейблена з приміткою про наступний крок', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'На склад' })).toBeDisabled();
    expect(screen.getByText('Збереження — наступний крок розробки')).toBeInTheDocument();
  });

  it('показує підказку лише при низькій упевненості (< 0.8)', () => {
    const { unmount } = renderForm({ confidence: 0.5 });
    expect(screen.getByText(/звірте цифри з біркою/)).toBeInTheDocument();
    unmount();

    renderForm({ confidence: 0.97 });
    expect(screen.queryByText(/звірте цифри з біркою/)).not.toBeInTheDocument();
  });

  it('пілюлі: утеплення одиничний вибір, матеріал знімається повторним тапом', async () => {
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

  it('бейдж ролі: ПРОДАВЕЦЬ для продавця, АДМІН для адміна', () => {
    useAuthStore.getState().setSession({ accessToken: 'a', refreshToken: 'r', user: seller });
    const { unmount } = renderForm();
    expect(screen.getByText('ПРОДАВЕЦЬ')).toBeInTheDocument();
    unmount();

    useAuthStore
      .getState()
      .setSession({ accessToken: 'a', refreshToken: 'r', user: { ...seller, role: 'ADMIN' } });
    renderForm();
    expect(screen.getByText('АДМІН')).toBeInTheDocument();
  });

  it('поля приймають лише цифри', async () => {
    renderForm();
    const sizeInput = screen.getByDisplayValue('38');
    await userEvent.type(sizeInput, 'abc');
    expect(sizeInput).toHaveDisplayValue('38');
    await userEvent.type(sizeInput, '9');
    expect(sizeInput).toHaveDisplayValue('389');
  });
});
