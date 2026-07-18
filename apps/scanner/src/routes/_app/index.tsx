import { meSummarySchema, type MeSummary } from '@madiro/shared';
import {
  PencilIcon,
  PlusIcon,
  ReturnIcon,
  ScanFrameIcon,
  SearchIcon,
  api,
  initials,
  money,
  useAuthStore,
} from '@madiro/web-core';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProfileSheet } from '../../components/ProfileSheet';
import { homeDate } from '../../lib/homeDate';

export const Route = createFileRoute('/_app/')({
  component: HomePage,
});

/** Home hub (design 1a, screen 2): two big actions, secondary cards, day summary. */
function HomePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['me', 'summary'],
    queryFn: async () => meSummarySchema.parse(await api.get<MeSummary>('/me/summary')),
  });

  const firstName = user?.name.split(/\s+/)[0] ?? '';

  return (
    <div className="flex flex-1 flex-col gap-[18px] px-5 pt-4 pb-7">
      <div className="flex items-center justify-between">
        <div className="font-display text-[17px] tracking-[3px] text-accent">MADIRO</div>
        <button
          type="button"
          aria-label={t('profile.open')}
          onClick={() => setProfileOpen(true)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-chart-bar text-xs font-bold text-accent-hover"
        >
          {user ? initials(user.name) : ''}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[32px] font-semibold text-ink">
          {t('home.greeting', { name: firstName })}
        </h1>
        <div className="text-[13px] text-text-muted">{homeDate(i18n.language)}</div>
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/sale" className="flex items-center gap-4 rounded-2xl bg-ink px-[22px] py-6">
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-[rgba(245,241,234,.12)] text-page">
            <ScanFrameIcon size={24} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-bold text-page">{t('home.saleTitle')}</span>
            <span className="text-[12.5px] text-sidebar-muted">{t('home.saleSubtitle')}</span>
          </span>
        </Link>

        <Link
          to="/intake"
          className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-[22px] py-6"
        >
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-border-row text-accent-hover">
            <PlusIcon size={24} strokeWidth={1.6} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-bold text-ink">{t('home.intakeTitle')}</span>
            <span className="text-[12.5px] text-text-muted">{t('home.intakeSubtitle')}</span>
          </span>
        </Link>

        <Link
          to="/return"
          className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-[22px] py-[18px]"
        >
          <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-border-row text-accent-hover">
            <ReturnIcon size={22} />
          </span>
          <span className="text-[15px] font-bold text-ink">{t('home.returnTitle')}</span>
        </Link>

        <div className="flex gap-3">
          <Link
            to="/manual"
            className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5"
          >
            <PencilIcon size={18} className="text-accent-hover" />
            <span className="text-[13.5px] font-bold text-ink">{t('home.manual')}</span>
          </Link>
          <Link
            to="/search"
            className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3.5"
          >
            <SearchIcon size={18} className="text-accent-hover" strokeWidth={1.8} />
            <span className="text-[13.5px] font-bold text-ink">{t('home.search')}</span>
          </Link>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 rounded-2xl border border-border bg-surface px-[22px] py-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold tracking-[1.5px] text-text-muted">
            {t('home.summaryLabel')}
          </span>
          <Link to="/my-sales" className="text-[12.5px] font-semibold text-accent-hover">
            {t('home.summaryAll')}
          </Link>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="font-display text-[30px] font-semibold text-ink">
              {summary?.todaySalesPairs ?? '—'}
            </span>
            <span className="text-[11.5px] text-text-muted">
              {t('home.summaryPairs', { count: summary?.todaySalesPairs ?? 0 })}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-display text-[30px] font-semibold text-ink">
              {summary != null ? money(summary.todaySalesTotal) : '—'}
            </span>
            <span className="text-[11.5px] text-text-muted">{t('home.summaryTotal')}</span>
          </div>
        </div>
      </div>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} summary={summary} />
    </div>
  );
}
