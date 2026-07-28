import type { IncomingMessage, ServerResponse } from 'node:http';

import { pinoOptions } from './logging.config';

type AutoLogging = { ignore: (req: IncomingMessage) => boolean };

const req = (url: string, headers: Record<string, string> = {}) =>
  ({ url, headers }) as unknown as IncomingMessage;
const res = (statusCode: number) => ({ statusCode }) as ServerResponse;

describe('pinoOptions', () => {
  it('прод: JSON без pino-pretty, рівень info', () => {
    const opts = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: undefined });

    expect(opts.pinoHttp).toMatchObject({ level: 'info', transport: undefined });
  });

  it('LOG_LEVEL з env перекриває дефолт', () => {
    const opts = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: 'warn' });

    expect(opts.pinoHttp).toMatchObject({ level: 'warn' });
  });

  it('редагує authorization, cookie й паролі', () => {
    const { redact } = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: undefined })
      .pinoHttp as unknown as { redact: { paths: string[] } };

    expect(redact.paths).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.body.password']),
    );
  });

  it('health-проби не засмічують лог, решта пишеться', () => {
    const { autoLogging } = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: undefined })
      .pinoHttp as unknown as { autoLogging: AutoLogging };

    expect(autoLogging.ignore(req('/api/health'))).toBe(true);
    expect(autoLogging.ignore(req('/api/health?probe=1'))).toBe(true);
    expect(autoLogging.ignore(req('/api/sale'))).toBe(false);
  });

  it('5xx — error, 4xx — warn, решта — info', () => {
    const { customLogLevel } = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: undefined })
      .pinoHttp as unknown as {
      customLogLevel: (r: IncomingMessage, s: ServerResponse, e?: Error) => string;
    };

    expect(customLogLevel(req('/api/sale'), res(500))).toBe('error');
    expect(customLogLevel(req('/api/sale'), res(409))).toBe('warn');
    expect(customLogLevel(req('/api/sale'), res(201))).toBe('info');
    expect(customLogLevel(req('/api/sale'), res(200), new Error('boom'))).toBe('error');
  });

  it('req-id береться з x-request-id, інакше генерується', () => {
    const { genReqId } = pinoOptions({ NODE_ENV: 'production', LOG_LEVEL: undefined })
      .pinoHttp as unknown as { genReqId: (r: IncomingMessage) => string };

    expect(genReqId(req('/api/sale', { 'x-request-id': 'upstream-1' }))).toBe('upstream-1');
    expect(genReqId(req('/api/sale'))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
