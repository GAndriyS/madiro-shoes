import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Params } from 'nestjs-pino';

import type { Env } from '../config/env.validation';

/** Health probes hit the API every few seconds — logging them buries real traffic. */
const IGNORED_PATHS = new Set(['/api/health']);

/**
 * Structured request logging (docs/audit-2026-07, I-5): money operations must
 * leave a trace that can be searched after the fact, which `console.log` in a
 * platform log tail cannot give. Every request gets an id (honouring an
 * upstream `x-request-id`), so the request line and any error thrown inside it
 * can be correlated.
 *
 * Credentials never reach the log: authorization/cookie headers and password
 * fields are redacted, and pino-http does not serialize request bodies.
 */
export function pinoOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  const isProduction = env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      // Human-readable lines in development; JSON in production, where the
      // platform's log search is the consumer.
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
      genReqId: (req: IncomingMessage) => {
        const upstream = req.headers['x-request-id'];
        return typeof upstream === 'string' && upstream.length > 0 ? upstream : randomUUID();
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.refreshToken',
        ],
        censor: '[redacted]',
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => IGNORED_PATHS.has((req.url ?? '').split('?')[0] ?? ''),
      },
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req: IncomingMessage & { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
