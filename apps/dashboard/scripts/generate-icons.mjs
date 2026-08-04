// Generates the dashboard favicon from an inline SVG.
// Run once and commit the PNGs: pnpm --filter @madiro/dashboard icons
//
// Same mark as the scanner (apps/scanner/scripts/generate-icons.mjs) with the
// two brand colours swapped: ink on sand instead of sand on ink. The dashboard
// and the scanner are usually open in adjacent tabs, so the inverse pair reads
// as one product while still telling the two tabs apart at favicon size.
// No maskable variant here — the dashboard is not installable.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

function svg(size, pad) {
  const fontSize = Math.round((size - pad * 2) * 0.82);
  // librsvg ignores dominant-baseline, so center via baseline math:
  // cap height ≈ 0.7 × font size for serif faces.
  const baselineY = Math.round(size / 2 + fontSize * 0.35);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#c9b591"/>
  <text x="50%" y="${baselineY}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-weight="600"
    font-size="${fontSize}" fill="#2b2620">M</text>
</svg>`);
}

await mkdir(outDir, { recursive: true });
await sharp(svg(192, 28)).png().toFile(path.join(outDir, 'icon-192.png'));
await sharp(svg(512, 72)).png().toFile(path.join(outDir, 'icon-512.png'));
console.log('dashboard icons generated in public/icons');
