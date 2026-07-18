import { Outlet, createRootRoute } from '@tanstack/react-router';

import { OfflineBanner } from '../components/OfflineBanner';

export const Route = createRootRoute({
  component: () => (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <OfflineBanner />
      <Outlet />
    </div>
  ),
});
