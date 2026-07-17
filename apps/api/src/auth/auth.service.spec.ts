import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const findFirst = jest.fn();
  const update = jest.fn().mockResolvedValue({});

  const config = {
    getOrThrow: (key: string) => `${key}-secret-0123456789`,
    get: (_key: string, def: string) => def,
  };

  beforeEach(async () => {
    findFirst.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { findFirst, update } } },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'test-secret-0123456789' }),
        },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('повертає токени і користувача при коректному паролі', async () => {
    findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Оля',
      login: 'olia',
      role: 'SELLER',
      passwordHash: await argon2.hash('secret1'),
    });

    const result = await service.login('olia', 'secret1');

    expect(result.user).toEqual({ id: 'u1', name: 'Оля', login: 'olia', role: 'SELLER' });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('відхиляє невірний пароль', async () => {
    findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Оля',
      login: 'olia',
      role: 'SELLER',
      passwordHash: await argon2.hash('secret1'),
    });

    await expect(service.login('olia', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('відхиляє неіснуючого користувача (видалені відфільтровані запитом)', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.login('ghost', 'secret1')).rejects.toThrow(UnauthorizedException);
    expect(findFirst).toHaveBeenCalledWith({ where: { login: 'ghost', deletedAt: null } });
  });

  it('відхиляє access-токен, поданий як refresh', async () => {
    findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Оля',
      login: 'olia',
      role: 'SELLER',
      passwordHash: await argon2.hash('secret1'),
    });
    const { accessToken } = await service.login('olia', 'secret1');

    await expect(service.refresh(accessToken)).rejects.toThrow(UnauthorizedException);
  });
});
