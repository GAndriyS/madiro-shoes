import {
  BadGatewayException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';

import { TagsService } from './tags.service';
import { VISION_PROVIDER, VisionProviderError } from './vision/vision-provider';

/** Small real JPEG so the sharp pipeline runs for real. */
const makeJpeg = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#c8a26a' } })
    .jpeg()
    .toBuffer();

describe('TagsService', () => {
  let service: TagsService;
  const recognizeTag = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TagsService, { provide: VISION_PROVIDER, useValue: { recognizeTag } }],
    }).compile();
    service = moduleRef.get(TagsService);
  });

  it('нормалізує фото і повертає валідований результат провайдера', async () => {
    recognizeTag.mockResolvedValue({ size: 38, color: '36', style: '7645', confidence: 0.97 });

    const result = await service.recognize({ buffer: await makeJpeg(), mimetype: 'image/jpeg' });

    expect(result).toEqual({ size: 38, color: '36', style: '7645', confidence: 0.97 });
    const image = recognizeTag.mock.calls[0][0];
    expect(image.mimeType).toBe('image/jpeg');
    expect(Buffer.isBuffer(image.buffer)).toBe(true);
  });

  it('битий буфер → 400 ще до виклику провайдера', async () => {
    await expect(
      service.recognize({ buffer: Buffer.from('not an image'), mimetype: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(recognizeTag).not.toHaveBeenCalled();
  });

  it('невалідний вивід моделі (розмір поза 16..50) → 422', async () => {
    recognizeTag.mockResolvedValue({ size: 99, color: '36', style: '7645', confidence: 0.9 });

    await expect(
      service.recognize({ buffer: await makeJpeg(), mimetype: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('транспортна помилка провайдера → 502', async () => {
    recognizeTag.mockRejectedValue(new VisionProviderError('timeout'));

    await expect(
      service.recognize({ buffer: await makeJpeg(), mimetype: 'image/jpeg' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('несподівані помилки провайдера пробиваються без маскування у 502', async () => {
    recognizeTag.mockRejectedValue(new Error('boom'));

    await expect(
      service.recognize({ buffer: await makeJpeg(), mimetype: 'image/jpeg' }),
    ).rejects.toThrow('boom');
  });
});
