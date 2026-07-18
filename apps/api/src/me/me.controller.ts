import { Controller, Get } from '@nestjs/common';
import type { AuthUser, MeSummary } from '@madiro/shared';

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
}
