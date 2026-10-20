import { Outlet, createRootRoute } from '@tanstack/react-router';

import { OfflineBanner } from '../components/OfflineBanner';

export const Route = createRootRoute({
  // index.html opts into viewport-fit=cover with a black-translucent status
  // bar, so an installed app on a notched iPhone draws under the status bar —
  // where iOS takes the taps. The top inset keeps every header (and its back
  // button) below it; elsewhere it is 0.
  component: () => (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col pt-[env(safe-area-inset-top)]">
      <OfflineBanner />
      <Outlet />
    </div>
  ),
});
