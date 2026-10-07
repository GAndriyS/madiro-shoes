import { BadRequestException } from '@nestjs/common';
import type { ZodError } from 'zod';

/**
 * The 400 a failed Zod parse turns into (audit S-L1).
 *
 * Raw `error.issues` carry the schema's internals — codes, expected types,
 * received values, union branches — which is more than a client needs and more
 * than the public login route should describe about itself. A caller needs to
 * know *which field* and *why* in words; that is all this keeps.
 */
export function validationError(error: ZodError): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    message: 'Некоректний запит',
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}
