import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RouteErrorFallback,
  isChunkLoadError,
  reloadForNewVersion,
} from '../src/components/ui/RouteErrorFallback';
import { initI18n } from '../src/i18n/core';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x.app/assets/stock-abc.js',
    'error loading dynamically imported module: https://x.app/assets/stock-abc.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/stock-abc.css',
    "'text/html' is not a valid JavaScript MIME type.",
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores ordinary errors and non-errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ message: 'Importing a module script failed.' })).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  beforeEach(() => sessionStorage.clear());

  it('reloads once, then refuses inside the cooldown', () => {
    const reload = vi.fn();

    expect(reloadForNewVersion(reload, 1_000_000)).toBe(true);
    expect(reloadForNewVersion(reload, 1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads again once the cooldown has passed', () => {
    const reload = vi.fn();

    reloadForNewVersion(reload, 1_000_000);
    expect(reloadForNewVersion(reload, 1_031_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('RouteErrorFallback', () => {
  beforeAll(() => {
    initI18n({
      uk: {
        translation: {
          common: {
            updateTitle: 'Вийшла нова версія',
            updateBody: 'Перезавантажте сторінку.',
            crashTitle: 'Щось пішло не так',
            crashBody: 'Сталася неочікувана помилка.',
            reload: 'Перезавантажити',
          },
        },
      },
    });
  });

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reloads by itself for a stale chunk and still offers the button', async () => {
    const reload = vi.fn();
    render(
      <RouteErrorFallback
        error={new TypeError('Failed to fetch dynamically imported module: /assets/a.js')}
        reload={reload}
      />,
    );

    expect(screen.getByText('Вийшла нова версія')).toBeInTheDocument();
    expect(reload).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Перезавантажити' }));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload in a loop when the chunk is still missing after a reload', () => {
    const reload = vi.fn();
    const error = new TypeError('Importing a module script failed.');

    const first = render(<RouteErrorFallback error={error} reload={reload} />);
    first.unmount();
    render(<RouteErrorFallback error={error} reload={reload} />);

    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows a generic error without reloading on its own', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const error = new Error('boom');
    render(<RouteErrorFallback error={error} reload={reload} />);

    expect(screen.getByText('Щось пішло не так')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(error);

    await userEvent.click(screen.getByRole('button', { name: 'Перезавантажити' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
