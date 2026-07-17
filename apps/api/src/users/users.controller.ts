import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { createUserSchema, updateUserSchema, type Seller } from '@madiro/shared';

import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<Seller[]> {
    return this.users.listSellers();
  }

  @Post()
  create(@Body() body: unknown): Promise<{ id: string }> {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.users.createSeller(parsed.data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<{ id: string }> {
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    return this.users.updateSeller(id, parsed.data);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ id: string }> {
    return this.users.deleteSeller(id);
  }
}
