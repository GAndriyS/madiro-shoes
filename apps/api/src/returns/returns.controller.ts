import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  pairLookupSchema,
  returnSchema,
  type AuthUser,
  type CheckoutResult,
  type ReturnLookupResponse,
} from '@madiro/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReturnsService } from './returns.service';

@Controller('returns')
@Roles('ADMIN', 'SELLER')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  // A computation over history, not a resource creation — hence 200.
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() body: unknown): Promise<ReturnLookupResponse> {
    const parsed = pairLookupSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.returns.lookup(parsed.data);
  }

  @Post()
  register(@Body() body: unknown, @CurrentUser() user: AuthUser): Promise<CheckoutResult> {
    const parsed = returnSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.returns.register(parsed.data.operationId, user.id);
  }
}
