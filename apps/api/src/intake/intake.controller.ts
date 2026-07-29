import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  draftUpdateSchema,
  intakeSchema,
  priceHintQuerySchema,
  type AuthUser,
  type IntakeHistoryResponse,
  type IntakeQueueResponse,
  type IntakeResult,
  type MyDraft,
  type PriceHintResponse,
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

  /**
   * Purchase price hint while filling in an intake (FR-D-08). ADMIN only, and
   * not merely because the dashboard is: this returns a purchase price, which
   * FR-B-02 keeps away from sellers on every endpoint without exception.
   */
  @Get('price-hint')
  @Roles('ADMIN')
  priceHint(@Query() query: Record<string, string>): Promise<PriceHintResponse> {
    const parsed = priceHintQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.intake.priceHint(parsed.data);
  }

  // Dashboard queue/history are admin-only (method-level @Roles overrides the class).
  @Get('queue')
  @Roles('ADMIN')
  queue(): Promise<IntakeQueueResponse> {
    return this.intake.queue();
  }

  @Get('history')
  @Roles('ADMIN')
  history(@Query('page') page: unknown): Promise<IntakeHistoryResponse> {
    const parsed = Math.max(1, Number(page ?? '1') || 1);
    return this.intake.history(parsed);
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
