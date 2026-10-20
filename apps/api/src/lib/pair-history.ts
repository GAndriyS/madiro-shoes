import type { Prisma } from '@prisma/client';

/**
 * Take the pair's row lock — the one a checkout, a return and a cancellation
 * take — so nothing can sell, return or write the pair off between a check
 * and the change that relies on it. Resolves to the pair's current status,
 * or null when there is no such pair.
 */
export async function lockPair(
  tx: Prisma.TransactionClient,
  pairId: string,
): Promise<string | null> {
  const locked = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM pairs WHERE id = ${pairId} FOR UPDATE`;
  return locked[0]?.status ?? null;
}

/**
 * Whether anything beyond its own intake ever happened to the pair: a sale, a
 * return or a write-off, cancelled ones included — a cancellation keeps its
 * trace on purpose. Such a pair carries the shop's books, so it is never
 * deleted, nor moved to another variant along with its sales: the journal is
 * append-only (FR-B-06), and a pair that is physically gone is written off.
 */
export async function hasMovements(tx: Prisma.TransactionClient, pairId: string): Promise<boolean> {
  return (await tx.operation.count({ where: { pairId, type: { not: 'INTAKE' } } })) > 0;
}
