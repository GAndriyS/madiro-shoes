import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { validationError } from './validation-error';

describe('validationError', () => {
  const schema = z.object({
    login: z.string().min(2),
    sizes: z.array(z.object({ size: z.number().int() })),
  });

  it('400 з полем і словами, без нутрощів схеми', () => {
    const result = schema.safeParse({ login: 'a', sizes: [{ size: 'x' }] });
    if (result.success) throw new Error('expected a parse failure');

    const error = validationError(result.error);
    expect(error).toBeInstanceOf(BadRequestException);

    const body = error.getResponse() as {
      statusCode: number;
      message: string;
      errors: Array<Record<string, unknown>>;
    };
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Некоректний запит');
    expect(body.errors.map((e) => e.path)).toEqual(['login', 'sizes.0.size']);
    for (const entry of body.errors) {
      expect(Object.keys(entry).sort()).toEqual(['message', 'path']);
      expect(typeof entry.message).toBe('string');
    }
  });

  it('помилка на корені має порожній path', () => {
    const result = z.string().safeParse(42);
    if (result.success) throw new Error('expected a parse failure');

    const body = validationError(result.error).getResponse() as { errors: Array<{ path: string }> };
    expect(body.errors).toEqual([{ path: '', message: expect.any(String) }]);
  });
});
