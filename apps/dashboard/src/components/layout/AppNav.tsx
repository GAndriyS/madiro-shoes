import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';

import { useAuthStore } from '../../stores/auth';
import { BoxIcon, GridIcon, LogoutIcon, PlusIcon, UsersIcon } from './icons';

interface NavItem {
  to: string;
  labelKey: string;
  shortLabelKey: string;
  Icon: ComponentType<{ size?: number }>;
  /** Бейдж черги = кількість варіантів (розділ 3.3, п. 11); поки з моків. */
  badge?: number;
}

export function useNavItems(queueVariants: number): NavItem[] {
  return [
    { to: '/overview', labelKey: 'nav.overview', shortLabelKey: 'nav.overview', Icon: GridIcon },
    { to: '/stock', labelKey: 'nav.stock', shortLabelKey: 'nav.stock', Icon: BoxIcon },
    {
      to: '/intake',
      labelKey: 'nav.intake',
      shortLabelKey: 'nav.intakeShort',
      Icon: PlusIcon,
      badge: queueVariants,
    },
    { to: '/users', labelKey: 'nav.users', shortLabelKey: 'nav.usersShort', Icon: UsersIcon },
  ];
}

function QueueBadge({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="rounded-[9px] bg-queue-badge px-2 py-0.5 text-[11px] font-extrabold text-ink">
      {count}
    </span>
  );
}

/** Повний сайдбар 216px (≥1100) та іконковий 64px (768–1100). */
export function Sidebar({ queueVariants }: { queueVariants: number }) {
  const { t } = useTranslation();
  const items = useNavItems(queueVariants);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();

  const logout = () => {
    clearSession();
    void navigate({ to: '/login' });
  };

  return (
    <aside className="hidden h-screen flex-none flex-col bg-ink pt-[26px] pb-5 md:flex md:w-16 lg:w-[216px]">
      <div className="px-0 pb-[26px] text-center font-display text-[19px] tracking-[5px] text-logo lg:px-[26px] lg:text-left">
        <span className="lg:hidden">M</span>
        <span className="hidden lg:inline">MADIRO</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {items.map(({ to, labelKey, Icon, badge }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center justify-center gap-[11px] rounded-[10px] px-3.5 py-[11px] text-[13.5px] text-sidebar-muted lg:justify-between"
            activeProps={{ className: 'bg-[rgba(245,241,234,.12)] font-bold !text-page' }}
          >
            <span className="relative flex items-center gap-[11px]">
              <Icon size={16} />
              {badge != null && badge > 0 && (
                <span className="absolute -top-2 -right-3.5 rounded-lg bg-queue-badge px-[5px] text-[10px] font-extrabold text-ink lg:hidden">
                  {badge}
                </span>
              )}
              <span className="hidden lg:inline">{t(labelKey)}</span>
            </span>
            <span className="hidden lg:inline">
              <QueueBadge count={badge ?? 0} />
            </span>
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={logout}
        className="mt-auto flex items-center justify-center gap-[11px] px-[26px] py-[11px] text-[13.5px] text-sidebar-muted hover:text-page lg:justify-start"
      >
        <LogoutIcon size={16} />
        <span className="hidden lg:inline">{t('common.logout')}</span>
      </button>
    </aside>
  );
}

/** Нижня навігація 4 пункти (<768): Огляд / Склад / Черга / Люди. */
export function BottomNav({ queueVariants }: { queueVariants: number }) {
  const { t } = useTranslation();
  const items = useNavItems(queueVariants);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface md:hidden">
      {items.map(({ to, shortLabelKey, Icon, badge }) => (
        <Link
          key={to}
          to={to}
          className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-text-faint"
          activeProps={{ className: 'font-bold !text-ink' }}
        >
          <span className="relative">
            <Icon size={20} />
            {badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-3 rounded-[9px] bg-queue-badge px-1.5 text-[10px] font-extrabold text-ink">
                {badge}
              </span>
            )}
          </span>
          {t(shortLabelKey)}
        </Link>
      ))}
    </nav>
  );
}
