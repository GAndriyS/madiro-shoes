import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { intakeSchema, type AuthUser, type IntakeResult } from '@madiro/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntakeService } from './intake.service';

@Controller('intake')
@Roles('ADMIN', 'SELLER')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<IntakeResult> {
    const parsed = intakeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.intake.create(parsed.data, user);
  }
}
