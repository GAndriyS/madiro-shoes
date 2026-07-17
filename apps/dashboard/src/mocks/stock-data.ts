import type {
  IntakeHistoryEntry,
  IntakeHistoryResponse,
  IntakeQueueItem,
  IntakeQueueResponse,
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
  /** SOLD pairs are excluded from stock; a sold pair may still await a price. */
  status: 'IN_STOCK' | 'SOLD';
  soldPrice: number | null;
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

interface PairSpec {
  size: number;
  days: number;
  awaiting?: boolean;
  /** Sold-before-pricing demonstration: a sold pair that still awaits a price. */
  soldPrice?: number;
}

let pairSeq = 0;
function pair(variantId: string, spec: PairSpec): MockPair {
  pairSeq += 1;
  return {
    id: `pair-${pairSeq}`,
    variantId,
    size: spec.size,
    intakeDate: daysAgo(spec.days),
    awaitingPrice: spec.awaiting ?? false,
    status: spec.soldPrice != null ? 'SOLD' : 'IN_STOCK',
    soldPrice: spec.soldPrice ?? null,
  };
}

const variants: MockVariant[] = [];
const pairs: MockPair[] = [];

function addVariant(
  v: Omit<MockVariant, 'id' | 'history'> & { history?: VariantHistoryEntry[] },
  pairSpecs: PairSpec[],
): void {
  const id = `v-${v.style}-${v.color}`;
  variants.push({ ...v, id, history: v.history ?? [] });
  for (const s of pairSpecs) {
    pairs.push(pair(id, s));
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

// Queue variant with a "last time this variant came in at 1 800 ₴" hint:
// a prior priced intake in history plus a new draft awaiting price.
addVariant(
  {
    style: '8102',
    color: '07',
    material: 'LEATHER',
    season: 'NONE',
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
      {
        id: 'h-8102-07-0',
        date: daysAgo(70),
        type: 'INTAKE',
        sizes: [38, 40],
        amount: 1800,
        actorName: 'Віктор',
        paymentMethod: null,
      },
    ],
  },
  [{ size: 39, days: 1, awaiting: true }],
);

// Third queue variant demonstrating the sold-before-pricing case (FR-D-11):
// one in-stock draft (р.37) plus one draft already sold for 4 100 ₴ (р.40).
// Together the queue holds 5 awaiting pairs across 3 variants (matches design 3a).
addVariant(
  {
    style: '6310',
    color: '22',
    material: 'SUEDE',
    season: null,
    purchasePrice: null,
    lastSalePrice: 4100,
    soldLast30Days: 1,
    history: [
      {
        id: 'h-6310-22-1',
        date: daysAgo(1),
        type: 'INTAKE',
        sizes: [37, 40],
        amount: null,
        actorName: 'Оля',
        paymentMethod: null,
      },
    ],
  },
  [
    { size: 37, days: 1, awaiting: true },
    { size: 40, days: 1, awaiting: true, soldPrice: 4100 },
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
  // Spread intakes over the last ~40 days so the trailing-30-day summary is meaningful
  const intakeDays = 2 + (i % 40);
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
          date: daysAgo(intakeDays),
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
      days: intakeDays,
    })),
  );
}

const PAGE_SIZE = 8;

function variantPairs(variantId: string): MockPair[] {
  return pairs.filter((p) => p.variantId === variantId);
}

function inStockPairs(variantId: string): MockPair[] {
  return pairs.filter((p) => p.variantId === variantId && p.status === 'IN_STOCK');
}

function hasAwaitingPairs(variantId: string): boolean {
  return pairs.some((p) => p.variantId === variantId && p.awaitingPrice);
}

function toRow(v: MockVariant): StockVariantRow {
  // Only in-stock pairs are shown in the stock table; drafts count as in stock
  // (requirement 3.3), sold pairs do not.
  const own = inStockPairs(v.id);
  return {
    id: v.id,
    style: v.style,
    color: v.color,
    material: v.material,
    season: v.season,
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
    // Nav badge / chip: every variant with any awaiting pair (in stock or sold)
    queueVariants: variants.filter((v) => hasAwaitingPairs(v.id)).length,
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
    pairs: inStockPairs(v.id)
      .map(({ variantId: _variantId, status: _status, soldPrice: _soldPrice, ...p }) => p)
      .sort((a, b) => a.size - b.size),
    history: [...v.history].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Marks the variant's draft intake as confirmed in the movement history. */
function confirmDraftIntake(v: MockVariant, price: number | null): void {
  const draft = v.history.find((h) => h.type === 'INTAKE' && h.amount == null);
  if (draft) {
    draft.amount = price;
    draft.date = daysAgo(0);
  }
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
  confirmDraftIntake(v, purchasePrice);
  return true;
}

/** Leaves the variant without a purchase price ("old stock") but clears the queue (FR-D-11/14). */
export function setVariantNoPrice(id: string): boolean {
  const v = variants.find((x) => x.id === id);
  if (!v) {
    return false;
  }
  for (const p of pairs) {
    if (p.variantId === id) {
      p.awaitingPrice = false;
    }
  }
  confirmDraftIntake(v, null);
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

// --- Intake section (FR-D-11/12) ---------------------------------------------

function lastPurchasePriceHint(v: MockVariant): number | null {
  const priced = v.history
    .filter((h) => h.type === 'INTAKE' && h.amount != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return priced?.amount ?? null;
}

function toQueueItem(v: MockVariant): IntakeQueueItem {
  const awaiting = variantPairs(v.id).filter((p) => p.awaitingPrice);
  const draft = v.history.find((h) => h.type === 'INTAKE' && h.amount == null);
  return {
    variantId: v.id,
    style: v.style,
    color: v.color,
    material: v.material,
    season: v.season,
    sellerName: draft?.actorName ?? '—',
    createdAt: draft?.date ?? awaiting[0]?.intakeDate ?? daysAgo(0),
    lastPurchasePrice: lastPurchasePriceHint(v),
    sizes: awaiting
      .map((p) => ({
        pairId: p.id,
        size: p.size,
        sold: p.status === 'SOLD',
        soldPrice: p.soldPrice,
      }))
      .sort((a, b) => a.size - b.size),
  };
}

export function queryIntakeQueue(): IntakeQueueResponse {
  const queued = variants.filter((v) => hasAwaitingPairs(v.id));
  const items = queued.map(toQueueItem).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items,
    summary: {
      awaitingPairs: items.reduce((s, it) => s + it.sizes.length, 0),
      variants: items.length,
      sellers: new Set(items.map((it) => it.sellerName)).size,
    },
  };
}

const INTAKE_HISTORY_PAGE_SIZE = 6;

function intakeHistoryEntries(): IntakeHistoryEntry[] {
  // Confirmed intakes only: a draft still awaiting price stays in the queue.
  const entries: IntakeHistoryEntry[] = [];
  for (const v of variants) {
    for (const h of v.history) {
      if (h.type !== 'INTAKE') {
        continue;
      }
      const isActiveDraft = h.amount == null && hasAwaitingPairs(v.id);
      if (isActiveDraft) {
        continue;
      }
      entries.push({
        id: h.id,
        style: v.style,
        color: v.color,
        sizes: [...h.sizes].sort((a, b) => a - b),
        date: h.date,
        actorName: h.actorName,
        material: v.material,
        season: v.season,
        purchasePrice: h.amount,
      });
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function queryIntakeHistory(page: number): IntakeHistoryResponse {
  const all = intakeHistoryEntries();
  // Summary over the trailing 30 days (robust regardless of the current date)
  const windowStart = daysAgo(30);
  const recent = all.filter((e) => e.date >= windowStart);
  const start = (page - 1) * INTAKE_HISTORY_PAGE_SIZE;
  return {
    items: all.slice(start, start + INTAKE_HISTORY_PAGE_SIZE),
    page,
    pageSize: INTAKE_HISTORY_PAGE_SIZE,
    total: all.length,
    monthSummary: {
      pairs: recent.reduce((s, e) => s + e.sizes.length, 0),
      total: recent.reduce((s, e) => s + (e.purchasePrice ?? 0) * e.sizes.length, 0),
      pairsWithoutPrice: recent
        .filter((e) => e.purchasePrice == null)
        .reduce((s, e) => s + e.sizes.length, 0),
    },
  };
}
