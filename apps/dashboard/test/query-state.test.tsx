import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { QueryBoundary } from '../src/components/ui/QueryState';
import { initI18n } from '../src/i18n';

describe('QueryBoundary', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows the loading state while pending', () => {
    render(
      <QueryBoundary isPending isError={false} onRetry={() => {}}>
        <div>data</div>
      </QueryBoundary>,
    );
    expect(screen.getByText('Завантаження…')).toBeInTheDocument();
    expect(screen.queryByText('data')).not.toBeInTheDocument();
  });

  it('shows an error with a working retry button', async () => {
    const onRetry = vi.fn();
    render(
      <QueryBoundary isPending={false} isError onRetry={onRetry}>
        <div>data</div>
      </QueryBoundary>,
    );
    expect(screen.getByText('Не вдалося завантажити дані')).toBeInTheDocument();
    expect(screen.queryByText('data')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders children once loaded', () => {
    render(
      <QueryBoundary isPending={false} isError={false} onRetry={() => {}}>
        <div>data</div>
      </QueryBoundary>,
    );
    expect(screen.getByText('data')).toBeInTheDocument();
  });
});
