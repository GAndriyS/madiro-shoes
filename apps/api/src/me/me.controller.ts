import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  mySalesPeriodSchema,
  type AuthUser,
  type MeSummary,
  type MyDraftsResponse,
  type MySalesResponse,
} from '@madiro/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MeService } from './me.service';

@Controller('me')
@Roles('ADMIN', 'SELLER')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<MeSummary> {
    return this.me.summary(user.id);
  }

  @Get('sales')
  sales(@CurrentUser() user: AuthUser, @Query('period') period: unknown): Promise<MySalesResponse> {
    const parsed = mySalesPeriodSchema.safeParse(period ?? 'today');
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.me.sales(user.id, parsed.data);
  }

  @Get('drafts')
  drafts(@CurrentUser() user: AuthUser): Promise<MyDraftsResponse> {
    return this.me.drafts(user.id);
  }
}
