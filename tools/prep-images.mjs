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

// Nothing here for the hero any more: its artwork is a looping video
// (public/media/hero-video.*, from image/video-hero.mp4), which this script
// does not touch. The stills it used to build — hero-base, from image bgg.png,
// and before that hero-tree from bg image.png / hover img.png — are no longer
// read by the site; the source PNGs stay in image/ only as history.

const mockBox = await alphaBBox(`${SRC}/mockup2.png`);
console.log('MOCK ', JSON.stringify(mockBox));

// Overclock.png is a flat Figma export (hasAlpha: true, but only ~2.9k of its
// 4.78M pixels are actually transparent — not a real cutout), so alphaBBox
// would just return the whole canvas. This is a manual crop instead, tuned by
// eye against the full frame to keep just the tablet + hand and drop the
// title/body text on the left and the timeline marker on the right (both are
// rebuilt as real DOM in Overclock.astro, not baked into the image).
const overclockBox = { minX: 830, minY: 20, w: 1670, h: 1639 };

/**
 * Lifts a flat, uniform ground out of an export that was never cut out.
 *
 * Overclock's panel is #d6d6d6 while the section it sits in is #e2e2e2 — 12
 * levels apart, which is exactly enough to read as a grey box parked behind
 * the tablet. Keying it turns the export into the cutout the other three
 * device shots already are.
 *
 * Flood-filled from the crop's border rather than matched globally, so grey of
 * the same value *inside* the frame — the screen, the monitor's bezel — is
 * never touched: it isn't connected to the outside.
 *
 * Two thresholds, not one. Anything within `solid` of the key is fully
 * transparent; between `solid` and `edge` the alpha ramps, which is what keeps
 * the anti-aliased rim of the tablet from turning into a hard, jagged step.
 */
async function keyOutGround(file, box, key, { solid = 8, edge = 30 } = {}) {
  const { data, info } = await sharp(file)
    .extract({ left: box.minX, top: box.minY, width: box.w, height: box.h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const dist = (i) =>
    Math.max(
      Math.abs(data[i] - key[0]),
      Math.abs(data[i + 1] - key[1]),
      Math.abs(data[i + 2] - key[2]),
    );

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1);
  }

  let cleared = 0;
  while (stack.length) {
    const at = stack.pop();
    if (seen[at]) continue;
    const i = at * 4;
    const d = dist(i);
    if (d > edge) continue; // part of the subject — stop here
    seen[at] = 1;
    data[i + 3] = d <= solid ? 0 : Math.round(((d - solid) / (edge - solid)) * 255);
    if (data[i + 3] === 0) cleared++;
    const x = at % width;
    const y = (at / width) | 0;
    if (x > 0) stack.push(at - 1);
    if (x < width - 1) stack.push(at + 1);
    if (y > 0) stack.push(at - width);
    if (y < height - 1) stack.push(at + width);
  }

  console.log(
    `keyed ${file}: ${((cleared / (width * height)) * 100).toFixed(1)}% of the frame is now transparent`,
  );
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const overclockCut = await keyOutGround(`${SRC}/Overclock.png`, overclockBox, [214, 214, 214]);

// image 3.png (Bedford) and image 4.png (CELPIP) are clean transparent
// cutouts, same as mockup2.png — alphaBBox works directly on both.
const bedfordBox = await alphaBBox(`${SRC}/image 3.png`);
console.log('BEDFORD ', JSON.stringify(bedfordBox));

const celpipBox = await alphaBBox(`${SRC}/image 4.png`);
console.log('CELPIP ', JSON.stringify(celpipBox));

/* The two shots the nav panel previews. Clean transparent cutouts like
   mockup2.png, so alphaBBox works on them directly — and they go through the
   `jobs` path rather than `photos` because the panel renders them in a
   <picture> with an avif source, which the webp-only path would never write. */
const navNerdBox = await alphaBBox(`${SRC}/Nerd Apply.png`);
console.log('NAV NERD', JSON.stringify(navNerdBox));

const navOverclockBox = await alphaBBox(`${SRC}/Overclock_nav.png`);
console.log('NAV OVER', JSON.stringify(navOverclockBox));

/* Work categories. 1–3 are the hover stack, 4–6 the strip; the sources are
   numbered, the outputs are named for the job they do — a file called `3.png`
   tells the next person nothing about where it lands. */
const workCatSources = [
  { file: '1.png', name: 'work-hover-1' },
  { file: '2.png', name: 'work-hover-2' },
  { file: '3.png', name: 'work-hover-3' },
  { file: '4.png', name: 'work-shot-1' },
  { file: '5.png', name: 'work-shot-2' },
  { file: '6.png', name: 'work-shot-3' },
];

const workCatBoxes = [];
for (const { file, name } of workCatSources) {
  const box = await alphaBBox(`${SRC}/${file}`);
  console.log(name.padEnd(14), JSON.stringify(box));
  workCatBoxes.push({ src: `${SRC}/${file}`, box, name, maxW: 900 });
}

const jobs = [
  { src: `${SRC}/mockup2.png`, box: mockBox, name: 'showcase-device', maxW: 1400 },
  // Already cropped by keyOutGround, so its box is the whole buffer.
  {
    src: overclockCut,
    box: { minX: 0, minY: 0, w: overclockBox.w, h: overclockBox.h },
    name: 'overclock-device',
    maxW: 1400,
  },
  { src: `${SRC}/image 3.png`, box: bedfordBox, name: 'bedford-device', maxW: 1400 },
  { src: `${SRC}/image 4.png`, box: celpipBox, name: 'celpip-device', maxW: 1400 },
  /* 900 rather than the 1400 above: these are previews inside the nav panel,
     where the shot gets about half of a 75vw block — a good deal smaller than
     a chapter's full-height device shot, even doubled for retina. */
  { src: `${SRC}/Nerd Apply.png`, box: navNerdBox, name: 'nav-nerd-apply', maxW: 900 },
  { src: `${SRC}/Overclock_nav.png`, box: navOverclockBox, name: 'nav-overclock', maxW: 900 },
  /* Work categories — three for the hover stack, three for the strip a row
     opens. Placeholders standing in for the real work, so every category
     currently points at the same six.

     maxW is nominal: the sources are 332–509px wide and `withoutEnlargement`
     keeps them there. Stated anyway so the day a real, larger shot replaces
     one of these it is capped like everything else rather than shipping at
     whatever it happens to be. */
  ...workCatBoxes,
];

// Photographs that need no cutout — portraits, journal cards, and the founder
// quote's ground. No alphaBBox: these are full-frame images with no
// transparency to trim, so they are resized and encoded as they are.
//
// webp by default, deliberately: most of these land in a plain <img src> (the
// device shots above use <picture> with an avif source, these do not), so an
// avif sibling would never be requested. `avif: true` is for the ones that are
// in a <picture> and are big enough for the second encode to be worth it.
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
  /* The ground of Two ways in's left panel. Its source is only 738px wide, so
     maxW is nominal — `withoutEnlargement` means it comes out at its native
     size whatever is asked for, and the panel is about that wide at 1440.
     Quality is up from the 82 the rest use for the same reason: this is the
     one photo here that is displayed at roughly 1:1, where there is no
     downscale left to hide compression in. */
  { src: `${SRC}/two_ways.png`, name: 'two-ways', maxW: 1600, avif: true, quality: 90 },
];

for (const { src, name, maxW, avif = false, quality = 82 } of photos) {
  const base = sharp(src).resize({ width: maxW, withoutEnlargement: true });

  const webp = await base.clone().webp({ quality, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  let line = `${name}: webp ${webp.width}x${webp.height} ${(webp.size / 1024).toFixed(0)}KB`;

  if (avif) {
    const out = await base.clone().avif({ quality: 55, effort: 5 }).toFile(`${OUT}/${name}.avif`);
    line += ` · avif ${(out.size / 1024).toFixed(0)}KB`;
  }

  console.log(line);
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
