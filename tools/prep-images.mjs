import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'image';
const OUT = 'public/media';
mkdirSync(OUT, { recursive: true });

/** Bounding box of pixels with alpha > threshold. */
async function alphaBBox(file) {
  const img = sharp(file).ensureAlpha();
  const { width, height } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// The tree canopy and the rectangular ground photo are now one pre-composited
// asset (image bgg.png) — no separate cutout, so no runtime registration math
// needed. Kept for reference: hero-tree / bg image.png / hover img.png are no
// longer used by the site; the source PNGs stay in image/ only as history.
const heroBox = await alphaBBox(`${SRC}/image bgg.png`);
console.log('HERO ', JSON.stringify(heroBox));

const mockBox = await alphaBBox(`${SRC}/mockup2.png`);
console.log('MOCK ', JSON.stringify(mockBox));

// Overclock.png is a flat Figma export (hasAlpha: true, but only ~2.9k of its
// 4.78M pixels are actually transparent — not a real cutout), so alphaBBox
// would just return the whole canvas. This is a manual crop instead, tuned by
// eye against the full frame to keep just the tablet + hand and drop the
// title/body text on the left and the timeline marker on the right (both are
// rebuilt as real DOM in Overclock.astro, not baked into the image).
const overclockBox = { minX: 830, minY: 20, w: 1670, h: 1639 };

// image 3.png (Bedford) and image 4.png (CELPIP) are clean transparent
// cutouts, same as mockup2.png — alphaBBox works directly on both.
const bedfordBox = await alphaBBox(`${SRC}/image 3.png`);
console.log('BEDFORD ', JSON.stringify(bedfordBox));

const celpipBox = await alphaBBox(`${SRC}/image 4.png`);
console.log('CELPIP ', JSON.stringify(celpipBox));

const jobs = [
  { src: `${SRC}/image bgg.png`, box: heroBox, name: 'hero-base', maxW: 1600 },
  { src: `${SRC}/mockup2.png`, box: mockBox, name: 'showcase-device', maxW: 1400 },
  { src: `${SRC}/Overclock.png`, box: overclockBox, name: 'overclock-device', maxW: 1400 },
  { src: `${SRC}/image 3.png`, box: bedfordBox, name: 'bedford-device', maxW: 1400 },
  { src: `${SRC}/image 4.png`, box: celpipBox, name: 'celpip-device', maxW: 1400 },
];

// Photographs that need no cutout — portraits, journal cards, and the founder
// quote's ground. No alphaBBox: these are full-frame images with no
// transparency to trim, so they are resized and encoded as they are.
//
// webp only, deliberately: every one of these lands in a plain <img src>
// (the device shots above use <picture> with an avif source, these do not), so
// an avif sibling would never be requested.
const photos = [
  { src: `${SRC}/ahmed.png`, name: 'portrait-ahmed', maxW: 640 },
  { src: `${SRC}/braden.png`, name: 'portrait-braden', maxW: 640 },
  { src: `${SRC}/Geoffrey Langford.png`, name: 'portrait-geoffrey', maxW: 640 },
  { src: `${SRC}/Wei Sun.png`, name: 'portrait-wei-sun', maxW: 640 },
  { src: `${SRC}/yarik.png`, name: 'portrait-yarik', maxW: 640 },
  { src: `${SRC}/blog1.png`, name: 'journal-1', maxW: 900 },
  { src: `${SRC}/blog2.png`, name: 'journal-2', maxW: 900 },
  { src: `${SRC}/blog3.png`, name: 'journal-3', maxW: 900 },
  { src: `${SRC}/bg 2.png`, name: 'quote-ground', maxW: 1800 },
];

for (const { src, name, maxW } of photos) {
  const out = await sharp(src)
    .resize({ width: maxW, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(`${OUT}/${name}.webp`);
  console.log(`${name}: webp ${out.width}x${out.height} ${(out.size / 1024).toFixed(0)}KB`);
}

for (const { src, box, name, maxW } of jobs) {
  const base = sharp(src)
    .extract({ left: box.minX, top: box.minY, width: box.w, height: box.h })
    .resize({ width: Math.min(maxW, box.w), withoutEnlargement: true });

  const webp = await base.clone().webp({ quality: 80, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  const avif = await base.clone().avif({ quality: 55, effort: 5 }).toFile(`${OUT}/${name}.avif`);
  console.log(
    `${name}: trimmed ${box.w}x${box.h} → webp ${webp.width}x${webp.height} ${(webp.size / 1024).toFixed(0)}KB · avif ${(avif.size / 1024).toFixed(0)}KB`,
  );
}
