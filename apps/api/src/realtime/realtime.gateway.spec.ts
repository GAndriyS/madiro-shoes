import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { REALTIME_EVENT } from '@madiro/shared';
import type { Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

const SECRET = 'realtime-test-secret-0123456789';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwt: JwtService;
  const findFirst = jest.fn();

  const config = {
    get: (key: string) =>
      key === 'JWT_ACCESS_SECRET' ? SECRET : 'http://localhost:5173,http://localhost:5174',
  };

  const socket = (token?: string) =>
    ({
      handshake: { auth: token != null ? { token } : {}, query: {} },
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    }) as unknown as Socket & { join: jest.Mock; disconnect: jest.Mock };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: { user: { findFirst } } },
      ],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    jwt = moduleRef.get(JwtService);
  });

  const tokenFor = (sub: string, ver = 0) =>
    jwt.sign({ sub, role: 'ADMIN', ver }, { secret: SECRET });

  it('адмін із валідним токеном потрапляє в кімнату', async () => {
    findFirst.mockResolvedValue({ role: 'ADMIN', tokenVersion: 0 });
    const client = socket(tokenFor('admin-1'));

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('admins');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('продавця відключає: realtime — лише для дашборда (FR-B-02)', async () => {
    findFirst.mockResolvedValue({ role: 'SELLER', tokenVersion: 0 });
    const client = socket(tokenFor('seller-1'));

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('без токена або з чужим підписом — відключення', async () => {
    const anonymous = socket();
    await gateway.handleConnection(anonymous);
    expect(anonymous.disconnect).toHaveBeenCalledWith(true);

    const forged = socket(
      jwt.sign({ sub: 'x', role: 'ADMIN', ver: 0 }, { secret: 'other-secret' }),
    );
    await gateway.handleConnection(forged);
    expect(forged.disconnect).toHaveBeenCalledWith(true);
  });

  it('токен зі старою версією (пароль змінено) — відключення', async () => {
    findFirst.mockResolvedValue({ role: 'ADMIN', tokenVersion: 2 });
    const client = socket(tokenFor('admin-1', 1));

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('emit шле подію в кімнату адмінів', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };

    gateway.emit('sale');

    expect(to).toHaveBeenCalledWith('admins');
    expect(emit).toHaveBeenCalledWith(
      REALTIME_EVENT,
      expect.objectContaining({ topic: 'sale', at: expect.any(String) }),
    );
  });

  it('збій сокета не валить операцію, яка його викликала', () => {
    (gateway as unknown as { server: unknown }).server = {
      to: () => {
        throw new Error('socket is gone');
      },
    };

    expect(() => gateway.emit('sale')).not.toThrow();
  });
});
