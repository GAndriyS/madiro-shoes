import type {
  Material,
  Season,
  StockListQuery,
  StockListResponse,
  StockVariantRow,
  VariantDetail,
  VariantHistoryEntry,
  VariantPair,
} from '@madiro/shared';

/**
 * Mutable in-memory stock dataset so price/delete mutations actually change
 * what the UI shows during a session. Deterministic: no randomness, dates are
 * derived from "days ago" offsets. The first six variants replicate design 2a.
 */

interface MockPair extends VariantPair {
  variantId: string;
}

interface MockVariant {
  id: string;
  style: string;
  color: string;
  material: Material | null;
  season: Season | null;
  purchasePrice: number | null;
  lastSalePrice: number | null;
  soldLast30Days: number;
  history: VariantHistoryEntry[];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

let pairSeq = 0;
function pair(variantId: string, size: number, intakeDaysAgo: number, awaiting = false): MockPair {
  pairSeq += 1;
  return {
    id: `pair-${pairSeq}`,
    variantId,
    size,
    intakeDate: daysAgo(intakeDaysAgo),
    awaitingPrice: awaiting,
  };
}

const variants: MockVariant[] = [];
const pairs: MockPair[] = [];

function addVariant(
  v: Omit<MockVariant, 'id' | 'history'> & { history?: VariantHistoryEntry[] },
  pairSpecs: Array<{ size: number; days: number; awaiting?: boolean }>,
): void {
  const id = `v-${v.style}-${v.color}`;
  variants.push({ ...v, id, history: v.history ?? [] });
  for (const s of pairSpecs) {
    pairs.push(pair(id, s.size, s.days, s.awaiting ?? false));
  }
}

// The six rows from design screen 2a
addVariant(
  {
    style: '5211',
    color: '44',
    material: 'SUEDE',
    season: 'BAIKA',
    purchasePrice: null,
    lastSalePrice: null,
    soldLast30Days: 0,
    history: [
      {
        id: 'h-5211-1',
        date: daysAgo(0),
        type: 'INTAKE',
        sizes: [36, 37],
        amount: null,
        actorName: 'Оля',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 36, days: 0, awaiting: true },
    { size: 37, days: 0, awaiting: true },
  ],
);
addVariant(
  {
    style: '6310',
    color: '05',
    material: 'SUEDE',
    season: 'NONE',
    purchasePrice: 2500,
    lastSalePrice: 4100,
    soldLast30Days: 1,
    history: [
      {
        id: 'h-6310-1',
        date: daysAgo(1),
        type: 'SALE',
        sizes: [40],
        amount: 4100,
        actorName: 'Оля',
        paymentMethod: 'CARD',
      },
      {
        id: 'h-6310-2',
        date: daysAgo(35),
        type: 'INTAKE',
        sizes: [37, 39, 40],
        amount: 2500,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 37, days: 35 },
    { size: 39, days: 35 },
  ],
);
addVariant(
  {
    style: '7645',
    color: '12',
    material: 'SUEDE',
    season: 'BAIKA',
    purchasePrice: 1300,
    lastSalePrice: 2700,
    soldLast30Days: 1,
    history: [
      {
        id: 'h-7645-12-1',
        date: daysAgo(0),
        type: 'RETURN',
        sizes: [37],
        amount: -2700,
        actorName: 'Оля',
        paymentMethod: null,
      },
      {
        id: 'h-7645-12-2',
        date: daysAgo(2),
        type: 'SALE',
        sizes: [37],
        amount: 2700,
        actorName: 'Оля',
        paymentMethod: 'CASH',
      },
      {
        id: 'h-7645-12-3',
        date: daysAgo(50),
        type: 'INTAKE',
        sizes: [37, 38],
        amount: 1300,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 37, days: 50 },
    { size: 38, days: 50 },
  ],
);
addVariant(
  {
    style: '7645',
    color: '36',
    material: 'LEATHER',
    season: 'SHEEPSKIN',
    purchasePrice: 1400,
    lastSalePrice: 2850,
    soldLast30Days: 2,
    history: [
      {
        id: 'h-7645-36-1',
        date: daysAgo(3),
        type: 'SALE',
        sizes: [38],
        amount: 2850,
        actorName: 'Оля',
        paymentMethod: 'CARD',
      },
      {
        id: 'h-7645-36-2',
        date: daysAgo(5),
        type: 'RETURN',
        sizes: [38],
        amount: -2850,
        actorName: 'Оля',
        paymentMethod: null,
      },
      {
        id: 'h-7645-36-3',
        date: daysAgo(5),
        type: 'SALE',
        sizes: [38],
        amount: 2850,
        actorName: 'Оля',
        paymentMethod: 'CARD',
      },
      {
        id: 'h-7645-36-4',
        date: daysAgo(50),
        type: 'INTAKE',
        sizes: [39, 40],
        amount: 1400,
        actorName: 'Віктор',
        paymentMethod: null,
      },
      {
        id: 'h-7645-36-5',
        date: daysAgo(127),
        type: 'INTAKE',
        sizes: [36, 38],
        amount: 1400,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 36, days: 45 },
    { size: 38, days: 127 },
    { size: 39, days: 50 },
    { size: 40, days: 50 },
  ],
);
addVariant(
  {
    style: '8102',
    color: '01',
    material: 'LEATHER',
    season: 'NONE',
    purchasePrice: 1800,
    lastSalePrice: 3400,
    soldLast30Days: 3,
    history: [
      {
        id: 'h-8102-1',
        date: daysAgo(0),
        type: 'SALE',
        sizes: [40],
        amount: 3400,
        actorName: 'Ірина',
        paymentMethod: 'CASH',
      },
      {
        id: 'h-8102-2',
        date: daysAgo(20),
        type: 'INTAKE',
        sizes: [38, 40, 41],
        amount: 1800,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 38, days: 20 },
    { size: 40, days: 20 },
    { size: 41, days: 20 },
  ],
);
addVariant(
  {
    style: '9031',
    color: '14',
    material: 'LEATHER',
    season: 'SHEEPSKIN',
    purchasePrice: 2100,
    lastSalePrice: 3900,
    soldLast30Days: 1,
    history: [
      {
        id: 'h-9031-1',
        date: daysAgo(8),
        type: 'SALE',
        sizes: [39],
        amount: 3900,
        actorName: 'Оля',
        paymentMethod: 'CARD',
      },
      {
        id: 'h-9031-2',
        date: daysAgo(60),
        type: 'INTAKE',
        sizes: [38, 39],
        amount: 2100,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [{ size: 38, days: 60 }],
);

// One more variant awaiting price so the queue counts 3 variants / 5 pairs
addVariant(
  {
    style: '8102',
    color: '07',
    material: null,
    season: null,
    purchasePrice: null,
    lastSalePrice: null,
    soldLast30Days: 0,
    history: [
      {
        id: 'h-8102-07-1',
        date: daysAgo(1),
        type: 'INTAKE',
        sizes: [39],
        amount: null,
        actorName: 'Ірина',
        paymentMethod: null,
      },
    ],
  },
  [{ size: 39, days: 1, awaiting: true }],
);

// Third queue variant so the totals match the Overview mock: 3 variants / 5 pairs
addVariant(
  {
    style: '6310',
    color: '22',
    material: 'SUEDE',
    season: null,
    purchasePrice: null,
    lastSalePrice: null,
    soldLast30Days: 0,
    history: [
      {
        id: 'h-6310-22-1',
        date: daysAgo(0),
        type: 'INTAKE',
        sizes: [37, 38],
        amount: null,
        actorName: 'Ірина',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 37, days: 0, awaiting: true },
    { size: 38, days: 0, awaiting: true },
  ],
);

// Deterministic filler variants up to 57 total
const FILLER_MATERIALS: Array<Material | null> = ['LEATHER', 'SUEDE', null];
const FILLER_SEASONS: Array<Season | null> = ['NONE', 'BAIKA', 'SHEEPSKIN', null];
for (let i = variants.length; i < 57; i += 1) {
  const style = String(3100 + i * 97);
  const color = String(((i * 7) % 90) + 10);
  const material = FILLER_MATERIALS[i % FILLER_MATERIALS.length] ?? null;
  const season = FILLER_SEASONS[i % FILLER_SEASONS.length] ?? null;
  const purchasePrice = 900 + (i % 9) * 250;
  const sizeCount = (i % 4) + 1;
  const baseSize = 36 + (i % 5);
  addVariant(
    {
      style,
      color,
      material,
      season,
      purchasePrice,
      lastSalePrice: purchasePrice + 900 + (i % 5) * 300,
      soldLast30Days: i % 4,
      history: [
        {
          id: `h-f-${i}`,
          date: daysAgo(30 + (i % 90)),
          type: 'INTAKE',
          sizes: Array.from({ length: sizeCount }, (_, k) => baseSize + k),
          amount: purchasePrice,
          actorName: 'Віктор',
          paymentMethod: null,
        },
      ],
    },
    Array.from({ length: sizeCount }, (_, k) => ({
      size: baseSize + k,
      days: 30 + (i % 90),
    })),
  );
}

const PAGE_SIZE = 8;

function variantPairs(variantId: string): MockPair[] {
  return pairs.filter((p) => p.variantId === variantId);
}

function toRow(v: MockVariant): StockVariantRow {
  const own = variantPairs(v.id);
  return {
    id: v.id,
    style: v.style,
    color: v.color,
    material: v.material,
    season: v.season,
    // Drafts count as in stock (requirements 3.3), so sizes include awaiting pairs
    sizes: [...new Set(own.map((p) => p.size))].sort((a, b) => a - b),
    awaitingPriceCount: own.filter((p) => p.awaitingPrice).length,
    pairsCount: own.length,
    purchasePrice: v.purchasePrice,
    lastSalePrice: v.lastSalePrice,
  };
}

export function queryStock(query: StockListQuery): StockListResponse {
  const rows = variants.map(toRow).filter((r) => r.pairsCount > 0);

  let filtered = rows;
  const search = query.search?.trim();
  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.style.includes(search) ||
        r.color.includes(search) ||
        r.sizes.some((s) => String(s) === search),
    );
  }
  if (query.material) {
    filtered = filtered.filter((r) => r.material === query.material);
  }
  if (query.season) {
    filtered = filtered.filter((r) => r.season === query.season);
  }
  if (query.awaitingPrice) {
    filtered = filtered.filter((r) => r.awaitingPriceCount > 0);
  }
  if (query.lowStock) {
    filtered = filtered.filter((r) => r.pairsCount <= 2);
  }
  if (query.size != null) {
    filtered = filtered.filter((r) => r.sizes.includes(query.size!));
  }

  filtered.sort((a, b) =>
    query.sort === 'style-desc'
      ? b.style.localeCompare(a.style) || a.color.localeCompare(b.color)
      : a.style.localeCompare(b.style) || a.color.localeCompare(b.color),
  );

  const start = (query.page - 1) * PAGE_SIZE;
  const allRows = variants.map(toRow).filter((r) => r.pairsCount > 0);
  return {
    items: filtered.slice(start, start + PAGE_SIZE),
    page: query.page,
    pageSize: PAGE_SIZE,
    total: filtered.length,
    summary: {
      pairsTotal: allRows.reduce((s, r) => s + r.pairsCount, 0),
      variantsTotal: allRows.length,
      purchaseValue: allRows.reduce((s, r) => s + (r.purchasePrice ?? 0) * r.pairsCount, 0),
    },
    queueVariants: allRows.filter((r) => r.awaitingPriceCount > 0).length,
  };
}

export function getVariantDetail(id: string): VariantDetail | null {
  const v = variants.find((x) => x.id === id);
  if (!v) {
    return null;
  }
  return {
    id: v.id,
    style: v.style,
    color: v.color,
    material: v.material,
    season: v.season,
    purchasePrice: v.purchasePrice,
    lastSalePrice: v.lastSalePrice,
    soldLast30Days: v.soldLast30Days,
    pairs: variantPairs(v.id)
      .map(({ variantId: _variantId, ...p }) => p)
      .sort((a, b) => a.size - b.size),
    history: [...v.history].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Sets the variant price and moves its queued pairs to stock (FR-D-08). */
export function setVariantPrice(id: string, purchasePrice: number): boolean {
  const v = variants.find((x) => x.id === id);
  if (!v) {
    return false;
  }
  v.purchasePrice = purchasePrice;
  for (const p of pairs) {
    if (p.variantId === id) {
      p.awaitingPrice = false;
    }
  }
  return true;
}

export function deletePair(pairId: string): boolean {
  const idx = pairs.findIndex((p) => p.id === pairId);
  if (idx === -1) {
    return false;
  }
  pairs.splice(idx, 1);
  return true;
}
