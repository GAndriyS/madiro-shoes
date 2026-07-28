import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { overviewPeriodSchema, type OverviewResponse } from '@madiro/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { StatsService } from './stats.service';

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
    const parsed = overviewPeriodSchema.safeParse(period ?? 'today');
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.stats.overview(
      parsed.data,
      typeof from === 'string' ? from : null,
      typeof to === 'string' ? to : null,
    );
  }
}
