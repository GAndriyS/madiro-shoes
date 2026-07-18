import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { MAX_PHOTO_BYTES, type TagRecognition } from '@madiro/shared';
import { memoryStorage } from 'multer';

import { Roles } from '../auth/decorators/roles.decorator';
import { TagsService } from './tags.service';

/**
 * HEIC is deliberately absent: sharp's prebuilt binaries ship without a HEIF
 * decoder; the scanner normalizes captures to JPEG client-side.
 */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('tags')
@Roles('ADMIN', 'SELLER')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  // Recognition is a computation over the photo, not resource creation → 200.
  // Tight throttle: every call is a paid LLM request.
  @Post('recognize')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  recognize(@UploadedFile() photo?: Express.Multer.File): Promise<TagRecognition> {
    if (!photo) {
      throw new BadRequestException('Очікується файл у полі "photo"');
    }
    if (!ALLOWED_MIME_TYPES.has(photo.mimetype)) {
      throw new BadRequestException('Підтримуються лише зображення JPEG, PNG або WebP');
    }
    return this.tags.recognize(photo);
  }
}
