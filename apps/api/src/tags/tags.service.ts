import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { tagRecognitionSchema, type TagRecognition } from '@madiro/shared';
import sharp from 'sharp';

import type { VisionProvider } from './vision/vision-provider';
import { VISION_PROVIDER, VisionProviderError } from './vision/vision-provider';

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(@Inject(VISION_PROVIDER) private readonly vision: VisionProvider) {}

  /**
   * Photo → normalized JPEG (~768px) → vision provider → validated result.
   * The photo lives only in memory for the duration of the request (FR-B-03:
   * no storage).
   */
  async recognize(photo: UploadedPhoto): Promise<TagRecognition> {
    // The scanner already uploads at this size; the resize is what protects the
    // model from a gallery pick or an older client. Measured against the real
    // label: 768px read correctly every run at a ~405ms median, 1024px at
    // ~1350ms (more image tiles, more input tokens), and 512px started
    // misreading digits for no further speedup.
    const resizeStartedAt = Date.now();
    let normalized: Buffer;
    try {
      normalized = await sharp(photo.buffer)
        .rotate()
        .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Файл не є зображенням, яке вдалося обробити');
    }
    const resizeMs = Date.now() - resizeStartedAt;

    let raw: unknown;
    // Recognition latency is the thing sellers feel; log it so a regression is
    // visible without reproducing it. `finally` so timeouts get timed too, and
    // both stages separately — decode+resize used to sit outside the timer,
    // which made a slow upload and a slow model look identical in the log.
    const startedAt = Date.now();
    try {
      raw = await this.vision.recognizeTag({ buffer: normalized, mimeType: 'image/jpeg' });
    } catch (error) {
      if (error instanceof VisionProviderError) {
        throw new BadGatewayException('Сервіс розпізнавання тимчасово недоступний');
      }
      throw error;
    } finally {
      this.logger.log(
        `vision recognizeTag: sharp ${resizeMs}ms, model ${Date.now() - startedAt}ms, ` +
          `${photo.buffer.byteLength} → ${normalized.byteLength} bytes`,
      );
    }

    // Model output that fails the contract (junk digits, size out of range)
    // is a recognition failure, not a server bug — 422 so the UI offers retry.
    const parsed = tagRecognitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Не вдалося прочитати бірку');
    }
    return parsed.data;
  }
}
