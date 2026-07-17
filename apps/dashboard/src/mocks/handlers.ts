import { HttpResponse, http } from 'msw';

/**
 * Замокані дані для розробки дашборда (рішення користувача: дашборд
 * розробляється на моках, реальні дані з'являться разом зі сканером).
 * Auth НЕ мокається — запити йдуть у реальний API через Vite-proxy.
 * Цифри — з дизайну «Дашборд адміна», екран 1a.
 */
export const handlers = [
  http.get('/api/stats/overview', () =>
    HttpResponse.json({
      period: 'today',
      revenue: 21_200,
      revenueDeltaPct: 18,
      sales: 8,
      returns: 1,
      netPairs: 7,
      margin: 9_640,
      marginPctOfRevenue: 45,
      awaitingPrice: { pairs: 5, sellers: 2, variants: 3 },
    }),
  ),
];
