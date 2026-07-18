import { useAuthStore } from '@madiro/web-core';
import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    // Any authenticated staff member (seller or admin) may use the scanner.
    if (useAuthStore.getState().accessToken == null) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  // React to a session cleared mid-view (failed refresh / logout), not only on navigation.
  const accessToken = useAuthStore((s) => s.accessToken);
  useEffect(() => {
    if (accessToken == null) {
      void navigate({ to: '/login' });
    }
  }, [accessToken, navigate]);

  return <Outlet />;
}
