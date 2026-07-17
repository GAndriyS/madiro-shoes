import type { OverviewResponse } from '@madiro/shared';
import { HttpResponse, http } from 'msw';

/**
 * Замокані дані для розробки дашборда (рішення користувача: дашборд
 * розробляється на моках, реальні дані з'являться разом зі сканером).
 * Auth НЕ мокається — запити йдуть у реальний API через Vite-proxy.
 * Базові цифри — з дизайну «Дашборд адміна», екран 1a.
 */

type Series = OverviewResponse['revenueSeries'];

function dayIso(daysAgo: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Сьогодні: погодинна виручка робочого дня 9:00–19:00, разом 21 200 ₴. */
function hourlySeries(): Series {
  const values = [800, 1400, 2100, 1900, 2500, 3200, 1800, 2400, 2100, 1600, 1400];
  return {
    granularity: 'hour',
    points: values.map((revenue, i) => ({ date: dayIso(0, 9 + i), revenue })),
  };
}

/** Дні, що закінчуються сьогодні; детермінований профіль, підігнаний під total. */
function dailySeries(days: number, total: number): Series {
  const raw = Array.from({ length: days }, (_, i) => 5500 + ((i * 7) % 10) * 600);
  const rawSum = raw.reduce((s, v) => s + v, 0);
  const scaled = raw.map((v) => Math.round((v * total) / rawSum / 10) * 10);
  const diff = total - scaled.reduce((s, v) => s + v, 0);
  scaled[scaled.length - 1] = (scaled[scaled.length - 1] ?? 0) + diff;
  return {
    granularity: 'day',
    points: scaled.map((revenue, i) => ({ date: dayIso(days - 1 - i), revenue })),
  };
}

/** Довільний діапазон дат (включно); максимум 92 точки. */
function customSeries(from: string | null, to: string | null): Series {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 13 * 86_400_000);
  const days = Math.min(
    92,
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1),
  );
  const raw = Array.from({ length: days }, (_, i) => 5500 + ((i * 7) % 10) * 600);
  return {
    granularity: 'day',
    points: raw.map((revenue, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      d.setHours(12, 0, 0, 0);
      return { date: d.toISOString(), revenue };
    }),
  };
}

const queue: OverviewResponse['queue'] = [
  {
    pairId: 'p1',
    style: '5211',
    color: '44',
    size: 36,
    sellerName: 'Оля',
    createdAt: dayIso(0, 10, 2),
    soldAt: null,
  },
  {
    pairId: 'p2',
    style: '5211',
    color: '44',
    size: 37,
    sellerName: 'Оля',
    createdAt: dayIso(0, 10, 1),
    soldAt: null,
  },
  {
    pairId: 'p3',
    style: '8102',
    color: '01',
    size: 39,
    sellerName: 'Ірина',
    createdAt: dayIso(1, 16, 40),
    soldAt: null,
  },
  {
    pairId: 'p4',
    style: '6310',
    color: '05',
    size: 40,
    sellerName: 'Оля',
    createdAt: dayIso(1, 15, 12),
    soldAt: dayIso(0, 12, 5),
  },
];

const recentOperations: OverviewResponse['recentOperations'] = [
  {
    id: 'o1',
    type: 'SALE',
    style: '7645',
    color: '36',
    size: 38,
    at: dayIso(0, 14, 32),
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
    at: dayIso(0, 13, 5),
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
    at: dayIso(0, 12, 40),
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
    at: dayIso(0, 10, 2),
    sellerName: 'Оля',
    paymentMethod: null,
    amount: null,
    margin: null,
    isDraft: true,
  },
];

const base = {
  awaitingPrice: { pairs: 5, sellers: 2, variants: 3 },
  queue,
  recentOperations,
};

function overviewFor(period: string, from: string | null, to: string | null): OverviewResponse {
  switch (period) {
    case 'today':
      return {
        revenue: 21_200,
        revenueDeltaPct: 18,
        sales: 8,
        returns: 1,
        netPairs: 7,
        margin: 9_640,
        marginPctOfRevenue: 45,
        revenueSeries: hourlySeries(),
        ...base,
      };
    case 'week':
      return {
        revenue: 118_400,
        revenueDeltaPct: null,
        sales: 46,
        returns: 3,
        netPairs: 43,
        margin: 52_830,
        marginPctOfRevenue: 45,
        revenueSeries: dailySeries(7, 118_400),
        ...base,
      };
    case 'month':
      return {
        revenue: 248_300,
        revenueDeltaPct: null,
        sales: 97,
        returns: 7,
        netPairs: 90,
        margin: 109_900,
        marginPctOfRevenue: 44,
        revenueSeries: dailySeries(30, 248_300),
        ...base,
      };
    default: {
      // Довільний період: KPI узгоджені з сумою серії
      const series = customSeries(from, to);
      const revenue = series.points.reduce((s, p) => s + p.revenue, 0);
      const days = series.points.length;
      return {
        revenue,
        revenueDeltaPct: null,
        sales: days * 7,
        returns: Math.round(days / 2),
        netPairs: days * 7 - Math.round(days / 2),
        margin: Math.round(revenue * 0.44),
        marginPctOfRevenue: 44,
        revenueSeries: series,
        ...base,
      };
    }
  }
}

export const handlers = [
  http.get('/api/stats/overview', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(
      overviewFor(
        url.searchParams.get('period') ?? 'today',
        url.searchParams.get('from'),
        url.searchParams.get('to'),
      ),
    );
  }),
];
