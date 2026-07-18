import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
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
  constructor(@Inject(VISION_PROVIDER) private readonly vision: VisionProvider) {}

  /**
   * Photo → normalized JPEG (~1024px) → vision provider → validated result.
   * The photo lives only in memory for the duration of the request (FR-B-03:
   * no storage).
   */
  async recognize(photo: UploadedPhoto): Promise<TagRecognition> {
    let normalized: Buffer;
    try {
      normalized = await sharp(photo.buffer)
        .rotate()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Файл не є зображенням, яке вдалося обробити');
    }

    let raw: unknown;
    try {
      raw = await this.vision.recognizeTag({ buffer: normalized, mimeType: 'image/jpeg' });
    } catch (error) {
      if (error instanceof VisionProviderError) {
        throw new BadGatewayException('Сервіс розпізнавання тимчасово недоступний');
      }
      throw error;
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
