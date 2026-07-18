// Generates the PWA icons (192/512 + maskable) from an inline SVG.
// Run once and commit the PNGs: pnpm --filter @madiro/scanner icons
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

// The serif "M" mark on the ink background; generous margins keep the
// maskable variant safe inside the platform mask.
function svg(size, pad) {
  const fontSize = Math.round((size - pad * 2) * 0.82);
  // librsvg ignores dominant-baseline, so center via baseline math:
  // cap height ≈ 0.7 × font size for serif faces.
  const baselineY = Math.round(size / 2 + fontSize * 0.35);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#2b2620"/>
  <text x="50%" y="${baselineY}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-weight="600"
    font-size="${fontSize}" fill="#c9b591">M</text>
</svg>`);
}

await mkdir(outDir, { recursive: true });
await sharp(svg(192, 28)).png().toFile(path.join(outDir, 'icon-192.png'));
await sharp(svg(512, 72)).png().toFile(path.join(outDir, 'icon-512.png'));
await sharp(svg(512, 130)).png().toFile(path.join(outDir, 'icon-maskable-512.png'));
console.log('PWA icons generated in public/icons');
