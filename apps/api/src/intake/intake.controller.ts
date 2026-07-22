import { BadRequestException, Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  draftUpdateSchema,
  intakeSchema,
  type AuthUser,
  type IntakeResult,
  type MyDraft,
} from '@madiro/shared';

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

  // Own drafts awaiting price only (FR-S-13) — the service enforces ownership.
  @Patch(':pairId')
  update(
    @Param('pairId') pairId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<MyDraft> {
    const parsed = draftUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.intake.updateDraft(pairId, parsed.data, user.id);
  }

  @Delete(':pairId')
  remove(
    @Param('pairId') pairId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ pairId: string }> {
    return this.intake.deleteDraft(pairId, user.id);
  }
}
