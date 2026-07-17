import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { BottomNav, MobileHeader, Sidebar } from '../components/layout/AppNav';
import { isAuthenticatedAdmin } from '../stores/auth';

export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    if (!isAuthenticatedAdmin()) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  // Кількість варіантів у черзі для бейджів — поки з моків (екран Поступлення підключить реальне значення).
  const queueVariants = 3;

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
