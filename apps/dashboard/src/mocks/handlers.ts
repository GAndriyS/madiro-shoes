import type { OverviewResponse } from '@madiro/shared';
import { HttpResponse, http } from 'msw';

/**
 * Замокані дані для розробки дашборда (рішення користувача: дашборд
 * розробляється на моках, реальні дані з'являться разом зі сканером).
 * Auth НЕ мокається — запити йдуть у реальний API через Vite-proxy.
 * Цифри — з дизайну «Дашборд адміна», екран 1a.
 */

/** Профіль висот барів з дизайну (14 днів, останній — сьогодні). */
const CHART_PROFILE = [38, 52, 44, 66, 30, 58, 72, 47, 55, 40, 63, 78, 50, 60];

function iso(daysAgo: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function revenueByDay(): OverviewResponse['revenueByDay'] {
  return CHART_PROFILE.map((h, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (CHART_PROFILE.length - 1 - i));
    return { date: d.toISOString().slice(0, 10), revenue: h * 330 };
  });
}

const queue: OverviewResponse['queue'] = [
  {
    pairId: 'p1',
    style: '5211',
    color: '44',
    size: 36,
    sellerName: 'Оля',
    createdAt: iso(0, 10, 2),
    soldAt: null,
  },
  {
    pairId: 'p2',
    style: '5211',
    color: '44',
    size: 37,
    sellerName: 'Оля',
    createdAt: iso(0, 10, 1),
    soldAt: null,
  },
  {
    pairId: 'p3',
    style: '8102',
    color: '01',
    size: 39,
    sellerName: 'Ірина',
    createdAt: iso(1, 16, 40),
    soldAt: null,
  },
  {
    pairId: 'p4',
    style: '6310',
    color: '05',
    size: 40,
    sellerName: 'Оля',
    createdAt: iso(1, 15, 12),
    soldAt: iso(0, 12, 5),
  },
];

const recentOperations: OverviewResponse['recentOperations'] = [
  {
    id: 'o1',
    type: 'SALE',
    style: '7645',
    color: '36',
    size: 38,
    at: iso(0, 14, 32),
    sellerName: 'Оля',
    paymentMethod: 'CARD',
    amount: 2850,
    margin: 1450,
    isDraft: false,
  },
  {
    id: 'o2',
    type: 'SALE',
    style: '8102',
    color: '01',
    size: 40,
    at: iso(0, 13, 5),
    sellerName: 'Ірина',
    paymentMethod: 'CASH',
    amount: 3400,
    margin: 1600,
    isDraft: false,
  },
  {
    id: 'o3',
    type: 'RETURN',
    style: '7645',
    color: '12',
    size: 37,
    at: iso(0, 12, 40),
    sellerName: 'Оля',
    paymentMethod: null,
    amount: -2700,
    margin: -1400,
    isDraft: false,
  },
  {
    id: 'o4',
    type: 'INTAKE',
    style: '5211',
    color: '44',
    size: 36,
    at: iso(0, 10, 2),
    sellerName: 'Оля',
    paymentMethod: null,
    amount: null,
    margin: null,
    isDraft: true,
  },
];

const base = {
  awaitingPrice: { pairs: 5, sellers: 2, variants: 3 },
  revenueByDay: revenueByDay(),
  queue,
  recentOperations,
};

const byPeriod: Record<string, OverviewResponse> = {
  today: {
    revenue: 21_200,
    revenueDeltaPct: 18,
    sales: 8,
    returns: 1,
    netPairs: 7,
    margin: 9_640,
    marginPctOfRevenue: 45,
    ...base,
  },
  week: {
    revenue: 118_400,
    revenueDeltaPct: null,
    sales: 46,
    returns: 3,
    netPairs: 43,
    margin: 52_830,
    marginPctOfRevenue: 45,
    ...base,
  },
  month: {
    revenue: 248_300,
    revenueDeltaPct: null,
    sales: 97,
    returns: 7,
    netPairs: 90,
    margin: 109_900,
    marginPctOfRevenue: 44,
    ...base,
  },
};

export const handlers = [
  http.get('/api/stats/overview', ({ request }) => {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') ?? 'today';
    const data = byPeriod[period] ?? byPeriod['month'];
    return HttpResponse.json(data);
  }),
];
