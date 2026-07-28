import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.io does not inherit the HTTP CORS config, and engine.io freezes its
 * CORS middleware at construction — so the allowlist has to be handed over when
 * the server is created, here, rather than patched afterwards. Same origins as
 * the REST API: the dashboard and the scanner, nothing else.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
    });
  }
}
