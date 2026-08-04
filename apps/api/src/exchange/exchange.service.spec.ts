import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { ExchangeService, parseRate } from './exchange.service';

const quote = (buy: string, sale: string) => [
  { ccy: 'EUR', base_ccy: 'UAH', buy: '50.95000', sale: '51.95000' },
  { ccy: 'USD', base_ccy: 'UAH', buy, sale },
];

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe('parseRate', () => {
  // «Середній курс» is the mid of the cash spread — what a person means when
  // they say what the dollar costs today.
  it('бере середнє між купівлею і продажем USD', () => {
    expect(parseRate(quote('44.40000', '45.00000'))).toBe(44.7);
  });

  it('ігнорує інші валюти', () => {
    expect(parseRate([{ ccy: 'EUR', buy: '50', sale: '52' }, ...quote('40', '42')])).toBe(41);
  });

  it.each([
    ['не масив', { ccy: 'USD' }],
    ['без USD', [{ ccy: 'EUR', buy: '50', sale: '52' }]],
    ['нечислові котирування', [{ ccy: 'USD', buy: 'н/д', sale: 'н/д' }]],
    ['нульовий курс', [{ ccy: 'USD', buy: '0', sale: '0' }]],
  ])('відхиляє %s', (_label, payload) => {
    expect(() => parseRate(payload)).toThrow();
  });
});

describe('ExchangeService', () => {
  const upsert = jest.fn();
  const findUnique = jest.fn();
  let service: ExchangeService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    upsert.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExchangeService,
        { provide: PrismaService, useValue: { exchangeRate: { upsert, findUnique } } },
        // No pinned rate: these tests are about the provider path.
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = moduleRef.get(ExchangeService);
  });

  it('віддає свіжий курс і зберігає його як останній відомий', async () => {
    fetchMock.mockResolvedValue(okResponse(quote('44.40000', '45.00000')));

    const result = await service.getRate();

    expect(result.rate).toBe(44.7);
    expect(result.stale).toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].update.rate).toBe(44.7);
  });

  // A form that refetched per keystroke would spend the provider's goodwill,
  // and the preview would disagree with what the save stores.
  it('кешує курс: другий виклик не йде в мережу', async () => {
    fetchMock.mockResolvedValue(okResponse(quote('44.00000', '45.00000')));

    await service.getRate();
    await service.getRate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('провайдер недоступний → останній збережений курс із міткою stale', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const fetchedAt = new Date('2026-08-01T10:00:00.000Z');
    findUnique.mockResolvedValue({ currency: 'USD', rate: 41.5, fetchedAt });

    const result = await service.getRate();

    expect(result).toEqual({ rate: 41.5, fetchedAt: fetchedAt.toISOString(), stale: true });
  });

  it('провайдер віддав помилку HTTP → теж фолбек', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    findUnique.mockResolvedValue({ currency: 'USD', rate: 40, fetchedAt: new Date() });

    expect((await service.getRate()).stale).toBe(true);
  });

  // Inventing a rate would put a wrong number in the books; refusing is honest.
  it('немає ні мережі, ні збереженого курсу → 503, а не вигаданий курс', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    findUnique.mockResolvedValue(null);

    await expect(service.getRate()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('збій запису кешу не ламає видачу курсу', async () => {
    fetchMock.mockResolvedValue(okResponse(quote('44.00000', '44.00000')));
    upsert.mockRejectedValue(new Error('db is down'));

    await expect(service.getRate()).resolves.toMatchObject({ rate: 44, stale: false });
  });

  // The escape hatch automated runs use — asserting stored hryvnia is only
  // possible against a rate that does not move.
  it('EXCHANGE_RATE_USD фіксує курс і не ходить у мережу', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExchangeService,
        { provide: PrismaService, useValue: { exchangeRate: { upsert, findUnique } } },
        { provide: ConfigService, useValue: { get: () => 40 } },
      ],
    }).compile();

    const result = await moduleRef.get(ExchangeService).getRate();

    expect(result).toMatchObject({ rate: 40, stale: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('паралельні запити діляться одним зверненням до провайдера', async () => {
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(okResponse(quote('44.00000', '46.00000'))), 10),
        ),
    );

    const results = await Promise.all([service.getRate(), service.getRate(), service.getRate()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.rate)).toEqual([45, 45, 45]);
  });
});
