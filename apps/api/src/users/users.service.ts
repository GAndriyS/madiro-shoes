import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { CreateUserInput, Seller, UpdateUserInput } from '@madiro/shared';

import { PrismaService } from '../prisma/prisma.service';

/** Postgres unique-violation → a friendly 409 (covers the check-then-write race). */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active sellers only — the single admin is never listed (FR-D-15). */
  async listSellers(): Promise<Seller[]> {
    const sellers = await this.prisma.user.findMany({
      where: { role: 'SELLER', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, login: true, lastActiveAt: true },
    });
    return sellers.map((s) => ({
      id: s.id,
      name: s.name,
      login: s.login,
      lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
      // Real counters arrive with the operations tables (sales / intake drafts)
      salesThisMonth: 0,
      draftsInQueue: 0,
    }));
  }

  async createSeller(input: CreateUserInput): Promise<{ id: string }> {
    // Logins must be unique across everyone, including soft-deleted accounts
    // and the admin (the DB unique index covers them all).
    await this.assertLoginFree(input.login);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          login: input.login,
          passwordHash: await argon2.hash(input.password),
          role: 'SELLER',
        },
      });
      return { id: user.id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Такий логін уже існує');
      }
      throw err;
    }
  }

  async updateSeller(id: string, input: UpdateUserInput): Promise<{ id: string }> {
    const seller = await this.findActiveSeller(id);
    if (input.login !== seller.login) {
      await this.assertLoginFree(input.login);
    }
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          name: input.name,
          login: input.login,
          // Omitted password keeps the current hash (design 4e: «залишити без змін»).
          // A new password bumps tokenVersion, revoking the seller's active sessions.
          ...(input.password
            ? {
                passwordHash: await argon2.hash(input.password),
                tokenVersion: { increment: 1 },
              }
            : {}),
        },
      });
      return { id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Такий логін уже існує');
      }
      throw err;
    }
  }

  /** Soft delete: the account disappears and cannot log in, history stays (FR-D-18). */
  async deleteSeller(id: string): Promise<{ id: string }> {
    await this.findActiveSeller(id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  private async findActiveSeller(id: string): Promise<{ id: string; login: string }> {
    const seller = await this.prisma.user.findFirst({
      where: { id, role: 'SELLER', deletedAt: null },
      select: { id: true, login: true },
    });
    if (!seller) {
      throw new NotFoundException('Продавця не знайдено');
    }
    return seller;
  }

  private async assertLoginFree(login: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { login } });
    if (existing) {
      throw new ConflictException('Такий логін уже існує');
    }
  }
}
