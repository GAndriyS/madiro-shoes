import { describe, expect, it } from 'vitest';

import { VIEWFINDER, computeCropRect } from '../src/lib/cropRect';

// The crop is what keeps a stack of boxes from handing the model four labels
// at once, so the mapping from the on-screen brackets to source pixels has to
// hold for every sensor/display combination the phones actually produce.
describe('computeCropRect', () => {
  it('відображає рамку в пікселі кадру через object-cover і центрує її', () => {
    // 1920×1080 sensor shown in a 390×700 portrait viewport: cover scales by
    // height (700/1080 = 0.648), which is the larger of the two ratios.
    const rect = computeCropRect(1920, 1080, 390, 700, VIEWFINDER);

    expect(rect).not.toBeNull();
    const scale = 700 / 1080;
    expect(rect!.sw).toBe(Math.round((300 * 1.5) / scale));
    expect(rect!.sh).toBe(Math.round((190 * 1.5) / scale));
    // Centred: equal margins on both sides.
    expect(rect!.sx).toBe(Math.round((1920 - rect!.sw) / 2));
    expect(rect!.sy).toBe(Math.round((1080 - rect!.sh) / 2));
  });

  it('тримає кроп усередині кадру для портретного джерела', () => {
    const rect = computeCropRect(1080, 1920, 390, 700, VIEWFINDER);

    expect(rect).not.toBeNull();
    expect(rect!.sx).toBeGreaterThanOrEqual(0);
    expect(rect!.sy).toBeGreaterThanOrEqual(0);
    expect(rect!.sx + rect!.sw).toBeLessThanOrEqual(1080);
    expect(rect!.sy + rect!.sh).toBeLessThanOrEqual(1920);
  });

  it('обрізає до розміру кадру, коли рамка більша за видиму область', () => {
    // A viewport smaller than the bracket box itself: cover barely scales the
    // frame down, so the padded box maps to more source pixels than exist and
    // the crop has to degrade to the whole frame rather than run off it.
    const rect = computeCropRect(1920, 1080, 200, 100, VIEWFINDER);

    expect(rect).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
  });

  it('не виходить за межі кадру за жодного співвідношення сторін', () => {
    const sizes = [
      [1920, 1080],
      [1080, 1920],
      [640, 480],
      [4032, 3024],
    ] as const;
    const displays = [
      [390, 700],
      [200, 100],
      [1200, 900],
    ] as const;

    for (const [videoW, videoH] of sizes) {
      for (const [displayW, displayH] of displays) {
        const rect = computeCropRect(videoW, videoH, displayW, displayH, VIEWFINDER)!;
        expect(rect.sx).toBeGreaterThanOrEqual(0);
        expect(rect.sy).toBeGreaterThanOrEqual(0);
        expect(rect.sw).toBeGreaterThan(0);
        expect(rect.sh).toBeGreaterThan(0);
        expect(rect.sx + rect.sw).toBeLessThanOrEqual(videoW);
        expect(rect.sy + rect.sh).toBeLessThanOrEqual(videoH);
      }
    }
  });

  it('центр кропу збігається з центром кадру, поки немає обрізання', () => {
    const videoW = 1920;
    const videoH = 1080;
    const rect = computeCropRect(videoW, videoH, 390, 700, VIEWFINDER)!;

    expect(rect.sx + rect.sw / 2).toBeCloseTo(videoW / 2, 0);
    expect(rect.sy + rect.sh / 2).toBeCloseTo(videoH / 2, 0);
  });

  it('повертає null на вироджених розмірах — викликач бере повний кадр', () => {
    // jsdom and hidden elements both report a zero-sized layout box.
    expect(computeCropRect(0, 1080, 390, 700, VIEWFINDER)).toBeNull();
    expect(computeCropRect(1920, 0, 390, 700, VIEWFINDER)).toBeNull();
    expect(computeCropRect(1920, 1080, 0, 700, VIEWFINDER)).toBeNull();
    expect(computeCropRect(1920, 1080, 390, 0, VIEWFINDER)).toBeNull();
    expect(
      computeCropRect(1920, 1080, 390, 700, { boxW: 0, boxH: 190, padRatio: 0.25 }),
    ).toBeNull();
  });

  it('більший padRatio дає більший кроп', () => {
    const tight = computeCropRect(1920, 1080, 390, 700, { boxW: 300, boxH: 190, padRatio: 0 })!;
    const loose = computeCropRect(1920, 1080, 390, 700, { boxW: 300, boxH: 190, padRatio: 0.5 })!;

    expect(loose.sw).toBeGreaterThan(tight.sw);
    expect(loose.sh).toBeGreaterThan(tight.sh);
  });
});
