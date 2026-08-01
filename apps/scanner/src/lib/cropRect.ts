/**
 * The gold viewfinder box, in CSS pixels. Single source of truth: CameraScreen
 * draws the brackets from it and captureFrame crops to it, so what the seller
 * aims at and what the model reads can never drift apart.
 *
 * `padRatio` widens the crop on each side. Boxes are scanned in stacks (several
 * labels in one shot), so the crop has to be tight enough to exclude the
 * neighbours, yet forgiving enough that a slightly off-centre aim still lands
 * the whole label.
 */
export const VIEWFINDER = { boxW: 300, boxH: 190, padRatio: 0.25 } as const;

export interface CropBox {
  boxW: number;
  boxH: number;
  padRatio: number;
}

/** Source-pixel rectangle, ready for the 9-argument drawImage. */
export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Maps the centred viewfinder box to a rectangle in the video's own pixels.
 *
 * The <video> is rendered `object-cover`, so it is scaled by whichever axis
 * needs the most magnification to fill the element, and the overflow is cropped
 * evenly — with the default 50% 50% object-position the element's centre is the
 * frame's centre, which is why the result is always centred here.
 *
 * Returns null when any dimension is unusable (a hidden element, or jsdom where
 * layout is always zero); callers fall back to the full frame.
 */
export function computeCropRect(
  videoW: number,
  videoH: number,
  displayW: number,
  displayH: number,
  box: CropBox,
): CropRect | null {
  if (videoW <= 0 || videoH <= 0 || displayW <= 0 || displayH <= 0) return null;
  if (box.boxW <= 0 || box.boxH <= 0) return null;

  const scale = Math.max(displayW / videoW, displayH / videoH);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const pad = 1 + 2 * box.padRatio;
  // Display px → source px, never larger than the frame we actually have.
  const sw = clamp(Math.round((box.boxW * pad) / scale), 1, videoW);
  const sh = clamp(Math.round((box.boxH * pad) / scale), 1, videoH);

  return {
    sx: clamp(Math.round((videoW - sw) / 2), 0, videoW - sw),
    sy: clamp(Math.round((videoH - sh) / 2), 0, videoH - sh),
    sw,
    sh,
  };
}
