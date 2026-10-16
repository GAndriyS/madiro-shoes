import { Controller, Get, Query } from '@nestjs/common';
import { overviewQuerySchema, type OverviewResponse } from '@madiro/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { StatsService, customRangeOf } from './stats.service';
import { validationError } from '../common/validation-error';

@Controller('stats')
@Roles('ADMIN')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(
    @Query('period') period: unknown,
    @Query('from') from: unknown,
    @Query('to') to: unknown,
  ): Promise<OverviewResponse> {
    const parsed = overviewQuerySchema.safeParse({ period, from, to });
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    if (parsed.data.period !== 'custom') {
      return this.stats.overview(parsed.data.period, null, null);
    }

    // The date picker asks as soon as one end is chosen, so a custom range may
    // arrive half-filled. Complete it exactly as the report will, then hold the
    // completed range to the same rules: a lone `from` after today runs
    // backwards just like an explicit `from` > `to`.
    const range = overviewQuerySchema.safeParse({
      period: 'custom',
      ...customRangeOf(parsed.data.from, parsed.data.to),
    });
    if (!range.success) {
      throw validationError(range.error);
    }
    return this.stats.overview('custom', range.data.from ?? null, range.data.to ?? null);
  }
}
