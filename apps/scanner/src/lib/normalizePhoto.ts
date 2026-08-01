import { fitWithin, MAX_UPLOAD_EDGE } from './cropRect';

/**
 * Prepare a picked file for upload: decode, downscale to the size the backend
 * would resize to anyway, and re-encode as JPEG.
 *
 * Safari decodes HEIC natively, so iPhone photos leave the device as JPEG — but
 * at full sensor resolution, which is several megabytes of upload for an image
 * the model never sees at that size. Downscaling here is the same win the
 * shutter path already gets from cropping.
 *
 * Every failure path returns the original file: a browser that cannot decode it
 * still gets a clear 400 from the backend, which beats blocking the seller.
 */
export async function normalizePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const target = fitWithin(bitmap.width, bitmap.height, MAX_UPLOAD_EDGE);

    // Already small enough and already JPEG — re-encoding would only lose detail.
    if (file.type === 'image/jpeg' && target.width === bitmap.width) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (context) {
      // Thin handwritten strokes survive a smooth downscale; nearest-neighbour
      // is how a 3 turns into an 8.
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        bitmap,
        0,
        0,
        bitmap.width,
        bitmap.height,
        0,
        0,
        target.width,
        target.height,
      );
    }
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
