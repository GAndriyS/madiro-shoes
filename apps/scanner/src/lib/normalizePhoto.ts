/**
 * Re-encode a picked file to JPEG via canvas for the file-input fallback.
 * Safari decodes HEIC natively, so iPhone photos leave the device as JPEG;
 * if the browser cannot decode the file at all, the original is returned and
 * the backend answers 400 with a clear message.
 */
export async function normalizePhoto(file: File): Promise<Blob> {
  if (file.type === 'image/jpeg') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
