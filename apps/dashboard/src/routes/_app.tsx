import { intakeQueueResponseSchema, type IntakeQueueResponse } from '@madiro/shared';
import { useQuery } from '@tanstack/react-query';
import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { BottomNav, MobileHeader, Sidebar } from '../components/layout/AppNav';
import { api } from '../lib/api';
import { isAuthenticatedAdmin, useAuthStore } from '../stores/auth';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!isAuthenticatedAdmin()) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  // beforeLoad only runs on navigation; also react to a session cleared mid-view
  // (logout in another tab, or a failed token refresh from lib/api.ts).
  const accessToken = useAuthStore((s) => s.accessToken);
  useEffect(() => {
    if (accessToken == null) {
      void navigate({ to: '/login' });
    }
  }, [accessToken, navigate]);

  // Nav badge = variants awaiting a price; kept fresh via the shared query key.
  const { data } = useQuery({
    queryKey: ['intake', 'queue'],
    queryFn: async () =>
      intakeQueueResponseSchema.parse(await api.get<IntakeQueueResponse>('/intake/queue')),
  });
  const queueVariants = data?.summary.variants ?? 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar queueVariants={queueVariants} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="min-w-0 flex-1 px-5 py-4 pb-24 md:px-9 md:py-8 md:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav queueVariants={queueVariants} />
    </div>
  );
}
