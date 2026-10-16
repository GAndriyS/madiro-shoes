import { createHash } from 'node:crypto';

import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IDEMPOTENCY_HEADER, idempotencyKeySchema } from '@madiro/shared';
import type { OperationType, Prisma } from '@prisma/client';

/**
 * The request's `Idempotency-Key`, or null when it carries none. The header is
 * optional so that a scanner build still cached on a phone keeps working
 * through a rollout. A malformed key is refused rather than ignored: dropping
 * it silently would turn the retry it was sent to protect back into a
 * duplicate.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const value = request.headers[IDEMPOTENCY_HEADER];
    if (value === undefined) {
      return null;
    }
    const parsed = idempotencyKeySchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException('Некоректний Idempotency-Key: очікується UUID');
    }
    return parsed.data;
  },
);

export interface IdempotentRequest {
  userId: string;
  /** From {@link IdempotencyKey}; null runs the work unguarded. */
  key: string | null;
  /** The operation the endpoint creates, which also tells the endpoints apart. */
  type: OperationType;
  /** The validated request body — a repeat has to carry the same one. */
  body: unknown;
}

/** JSON with object keys sorted, so the hash does not depend on key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Runs `work` at most once per key (spec §5.2) and answers every repeat with
 * the first response. It runs inside the caller's transaction, so the key and
 * everything the work writes commit or roll back together: a request that
 * failed leaves no key behind, and its retry simply runs again.
 *
 * The key is claimed *before* the work, with ON CONFLICT DO NOTHING on the
 * primary key. A repeat sent while the first request is still in flight — the
 * phone gave up waiting, the server did not — therefore waits on the first
 * one's row instead of racing it to the pair lock, where it would lose with a
 * 409 for a sale that was its own. Once the first commits, the repeat finds the
 * key taken and replays; had the first rolled back, the repeat's claim goes
 * through and it does the work itself.
 */
export async function idempotent<T>(
  tx: Prisma.TransactionClient,
  request: IdempotentRequest,
  work: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const { userId, key, type } = request;
  if (key == null) {
    return { result: await work(), replayed: false };
  }
  const requestHash = createHash('sha256').update(canonicalJson(request.body)).digest('hex');
  const where = { userId_key: { userId, key } };

  const claim = await tx.idempotencyKey.createMany({
    data: [{ userId, key, type, requestHash }],
    skipDuplicates: true,
  });
  if (claim.count === 0) {
    const previous = await tx.idempotencyKey.findUniqueOrThrow({ where });
    // Same key, different request: a client bug, or an attempt edited after
    // its first try had already gone through. Either way, not a repeat.
    if (previous.type !== type || previous.requestHash !== requestHash) {
      throw new UnprocessableEntityException(
        'Цей Idempotency-Key уже використано для іншого запиту',
      );
    }
    return { result: previous.response as T, replayed: true };
  }

  const result = await work();
  await tx.idempotencyKey.update({
    where,
    data: { response: result as Prisma.InputJsonValue },
  });
  return { result, replayed: false };
}
