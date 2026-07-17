import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('створює продавця з хешованим паролем і роллю SELLER', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1' });

    await service.createSeller({ name: 'Марія', login: 'maria', password: 'secret1' });

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe('SELLER');
    expect(data.passwordHash).not.toBe('secret1');
    await expect(argon2.verify(data.passwordHash, 'secret1')).resolves.toBe(true);
  });

  it('кидає 409, якщо логін уже зайнятий (включно з видаленими та адміном)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'admin' });

    await expect(
      service.createSeller({ name: 'X', login: 'admin', password: 'secret1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('оновлення без пароля не чіпає хеш', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', login: 'olia' });
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.updateSeller('u1', { name: 'Оля', login: 'olia' });

    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
  });

  it('видалення — soft delete через deletedAt', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', login: 'olia' });
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.deleteSeller('u1');

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'u1' });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it('редагування адміна чи неіснуючого → 404', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.updateSeller('admin-id', { name: 'X', login: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('список повертає лише активних продавців без лічильників операцій', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'Оля', login: 'olia', lastActiveAt: new Date('2026-07-17T11:30:00Z') },
      { id: 'u2', name: 'Ірина', login: 'iryna', lastActiveAt: null },
    ]);

    const res = await service.listSellers();

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: 'SELLER',
      deletedAt: null,
    });
    expect(res[0]).toMatchObject({ login: 'olia', salesThisMonth: 0, draftsInQueue: 0 });
    expect(res[0]!.lastActiveAt).toBe('2026-07-17T11:30:00.000Z');
    expect(res[1]!.lastActiveAt).toBeNull();
  });
});
