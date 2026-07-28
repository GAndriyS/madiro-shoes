import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import {
  REALTIME_EVENT,
  REALTIME_NAMESPACE,
  type RealtimeEvent,
  type RealtimeTopic,
} from '@madiro/shared';
import type { Namespace, Socket } from 'socket.io';

import type { AccessTokenPayload } from '../auth/auth.service';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/** Only the dashboard consumes realtime, and the dashboard is admin-only. */
const ADMIN_ROOM = 'admins';

/**
 * Realtime gateway (FR-B-04 / NFR-03): pushes "something changed" to the
 * dashboard so the queue, the nav badge, the operations feed and the KPIs stay
 * live while a seller works in the hall.
 *
 * Authentication mirrors the HTTP side rather than trusting the socket: the
 * handshake carries the same access token, it is verified with the same secret,
 * and the user is re-read from the database (a deleted seller or a bumped
 * tokenVersion is rejected on the spot). Only an admin is let into the room —
 * a seller socket would otherwise be a way around FR-B-02 the moment an event
 * ever carried data.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  /** The namespace, not the whole io server: this gateway owns /realtime only. */
  @WebSocketServer()
  private server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.tokenOf(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: { role: true, tokenVersion: true },
      });
      if (!user || user.tokenVersion !== payload.ver || user.role !== 'ADMIN') {
        client.disconnect(true);
        return;
      }
      await client.join(ADMIN_ROOM);
    } catch {
      client.disconnect(true);
    }
  }

  /**
   * Announce a change. Fire-and-forget by design: a broken socket must never
   * fail the sale that triggered it.
   */
  emit(topic: RealtimeTopic): void {
    const event: RealtimeEvent = { topic, at: new Date().toISOString() };
    try {
      this.server?.to(ADMIN_ROOM).emit(REALTIME_EVENT, event);
    } catch (error) {
      this.logger.warn(`Не вдалося надіслати realtime-подію ${topic}`, error);
    }
  }

  /** The token rides in the handshake auth payload, with a query fallback. */
  private tokenOf(client: Socket): string | null {
    const fromAuth = (client.handshake.auth as { token?: unknown }).token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    const fromQuery = client.handshake.query.token;
    return typeof fromQuery === 'string' && fromQuery.length > 0 ? fromQuery : null;
  }
}
