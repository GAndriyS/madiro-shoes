import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGE_PRICED_CURRENCY, type ExchangeRate } from '@madiro/shared';

import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PrivatBank's public cash desk rates — no key, no account. The shop buys
 * dollars at a cash desk, so this is the rate its money actually moves at;
 * the NBU's official rate would understate every purchase price by a couple
 * of percent.
 */
const PROVIDER_URL = 'https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5';
const SOURCE = 'privatbank-cash';
const FETCH_TIMEOUT_MS = 5_000;

/**
 * How long a fetched rate is reused. The cash rate moves in steps of a few
 * kopiykas over a day; refetching per keystroke would spend the provider's
 * goodwill for nothing. It also makes the form's preview and the saved value
 * agree: both read the same cached number.
 */
const TTL_MS = 15 * 60 * 1000;

interface CachedRate {
  rate: number;
  fetchedAt: Date;
}

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);
  private cached: CachedRate | null = null;
  /** One in-flight fetch is shared: a burst of form loads must not fan out. */
  private inFlight: Promise<CachedRate | null> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * The rate to price with. Fresh from the provider when possible; otherwise
   * the last known one, flagged `stale` so the caller can say so. Throws only
   * when there is no rate at all — a brand-new deployment whose first fetch
   * failed, where inventing a number would be worse than refusing.
   */
  async getRate(): Promise<ExchangeRate> {
    // A pinned rate short-circuits everything: automated runs assert exact
    // hryvnia, which a live quote would make impossible (refused in production).
    const pinned = this.config.get('EXCHANGE_RATE_USD', { infer: true });
    if (pinned != null) {
      return { rate: pinned, fetchedAt: new Date().toISOString(), stale: false };
    }

    const fresh = this.fromCache();
    if (fresh) {
      return { rate: fresh.rate, fetchedAt: fresh.fetchedAt.toISOString(), stale: false };
    }

    const fetched = await this.fetchOnce();
    if (fetched) {
      return { rate: fetched.rate, fetchedAt: fetched.fetchedAt.toISOString(), stale: false };
    }

    const last = await this.lastKnown();
    if (!last) {
      throw new ServiceUnavailableException(
        'Курс валют недоступний, і збереженого курсу ще немає — спробуйте пізніше',
      );
    }
    this.logger.warn(`provider unreachable — using the rate from ${last.fetchedAt.toISOString()}`);
    return { rate: last.rate, fetchedAt: last.fetchedAt.toISOString(), stale: true };
  }

  private fromCache(): CachedRate | null {
    if (!this.cached) return null;
    return Date.now() - this.cached.fetchedAt.getTime() < TTL_MS ? this.cached : null;
  }

  private fetchOnce(): Promise<CachedRate | null> {
    this.inFlight ??= this.fetchAndStore().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchAndStore(): Promise<CachedRate | null> {
    let rate: number;
    try {
      const response = await fetch(PROVIDER_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      rate = parseRate(await response.json());
    } catch (error) {
      this.logger.warn(
        `rate fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    const fetchedAt = new Date();
    this.cached = { rate, fetchedAt };
    // Persisted so a restart — or a deploy during an outage — still has a rate.
    await this.prisma.exchangeRate
      .upsert({
        where: { currency: EXCHANGE_PRICED_CURRENCY },
        update: { rate, source: SOURCE, fetchedAt },
        create: { currency: EXCHANGE_PRICED_CURRENCY, rate, source: SOURCE, fetchedAt },
      })
      .catch((error: unknown) => {
        // A cache write failing must not fail the price the admin is saving.
        this.logger.warn(`rate cache write failed: ${String(error)}`);
      });

    return { rate, fetchedAt };
  }

  private async lastKnown(): Promise<CachedRate | null> {
    if (this.cached) return this.cached;

    const row = await this.prisma.exchangeRate.findUnique({
      where: { currency: EXCHANGE_PRICED_CURRENCY },
    });
    if (!row) return null;

    const restored = { rate: Number(row.rate), fetchedAt: row.fetchedAt };
    this.cached = restored;
    return restored;
  }
}

/**
 * The provider answers with every currency it quotes; take USD and use the mid
 * of buy/sell — «середній курс», the number a person would name when asked
 * what the dollar costs today.
 */
export function parseRate(payload: unknown): number {
  if (!Array.isArray(payload)) {
    throw new Error('unexpected payload shape');
  }
  const usd = (payload as { ccy?: string; buy?: string; sale?: string }[]).find(
    (row) => row.ccy === EXCHANGE_PRICED_CURRENCY,
  );
  const buy = Number(usd?.buy);
  const sale = Number(usd?.sale);
  if (!Number.isFinite(buy) || !Number.isFinite(sale) || buy <= 0 || sale <= 0) {
    throw new Error('no usable USD quote in payload');
  }
  return Math.round(((buy + sale) / 2) * 10_000) / 10_000;
}
