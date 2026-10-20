import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { idempotent, type IdempotentRequest } from './idempotency';

/** The slice of a transaction client the helper touches. */
function makeTx() {
  return {
    idempotencyKey: {
      createMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
}

const KEY = '5f0c7c1e-3c1b-4f5e-9d7a-2b8e6f4a1c3d';
const sale = { pairId: 'p1', salePrice: 2850, paymentMethod: 'CASH' };
const request: IdempotentRequest = { userId: 'u1', key: KEY, type: 'SALE', body: sale };
const response = { pairId: 'p1', status: 'SOLD' };

describe('idempotent', () => {
  let tx: ReturnType<typeof makeTx>;
  const run = (req: IdempotentRequest, work: () => Promise<unknown>) =>
    idempotent(tx as unknown as Prisma.TransactionClient, req, work);

  beforeEach(() => {
    tx = makeTx();
  });

  it('без ключа: просто виконує роботу і нічого не записує', async () => {
    const work = jest.fn().mockResolvedValue(response);

    await expect(run({ ...request, key: null }, work)).resolves.toEqual({
      result: response,
      replayed: false,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(tx.idempotencyKey.createMany).not.toHaveBeenCalled();
  });

  it('новий ключ: займає його до роботи, а після — зберігає відповідь', async () => {
    tx.idempotencyKey.createMany.mockResolvedValue({ count: 1 });
    const work = jest.fn().mockImplementation(() => {
      // Claimed first: a concurrent repeat must queue on the key, not race the work.
      expect(tx.idempotencyKey.createMany).toHaveBeenCalled();
      return Promise.resolve(response);
    });

    await expect(run(request, work)).resolves.toEqual({ result: response, replayed: false });

    const claim = tx.idempotencyKey.createMany.mock.calls[0][0];
    expect(claim.skipDuplicates).toBe(true);
    expect(claim.data[0]).toMatchObject({ userId: 'u1', key: KEY, type: 'SALE' });
    expect(tx.idempotencyKey.update).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'u1', key: KEY } },
      data: { response },
    });
  });

  it('повтор того самого запиту: віддає першу відповідь, роботу не повторює', async () => {
    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 1 });
    await run(request, () => Promise.resolve(response));
    const { requestHash } = tx.idempotencyKey.createMany.mock.calls[0][0].data[0];

    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 0 });
    tx.idempotencyKey.findUniqueOrThrow.mockResolvedValue({ type: 'SALE', requestHash, response });
    const work = jest.fn();

    // Same body with its keys in another order is still the same request.
    const reordered = { paymentMethod: 'CASH', salePrice: 2850, pairId: 'p1' };
    await expect(run({ ...request, body: reordered }, work)).resolves.toEqual({
      result: response,
      replayed: true,
    });
    expect(work).not.toHaveBeenCalled();
  });

  it('той самий ключ з іншим тілом → 422, роботу не виконано', async () => {
    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 1 });
    await run(request, () => Promise.resolve(response));
    const { requestHash } = tx.idempotencyKey.createMany.mock.calls[0][0].data[0];

    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 0 });
    tx.idempotencyKey.findUniqueOrThrow.mockResolvedValue({ type: 'SALE', requestHash, response });
    const work = jest.fn();

    await expect(
      run({ ...request, body: { ...sale, salePrice: 2700 } }, work),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(work).not.toHaveBeenCalled();
  });

  it('той самий ключ на іншому ендпоінті → 422', async () => {
    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 1 });
    await run(request, () => Promise.resolve(response));
    const { requestHash } = tx.idempotencyKey.createMany.mock.calls[0][0].data[0];

    tx.idempotencyKey.createMany.mockResolvedValueOnce({ count: 0 });
    tx.idempotencyKey.findUniqueOrThrow.mockResolvedValue({ type: 'SALE', requestHash, response });

    await expect(run({ ...request, type: 'WRITEOFF' }, jest.fn())).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('робота впала: помилка летить далі, відповідь не зберігається', async () => {
    tx.idempotencyKey.createMany.mockResolvedValue({ count: 1 });

    await expect(run(request, () => Promise.reject(new Error('409')))).rejects.toThrow('409');
    // The transaction rolls the claim back with everything else.
    expect(tx.idempotencyKey.update).not.toHaveBeenCalled();
  });
});
