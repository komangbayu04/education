import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';

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

/* The generic stack/strip placeholders, still here for the one category
   that has no folder of its own yet — Ads. The
   sources are numbered, the outputs are named for the job they do: a file
   called `3.png` tells the next person nothing about where it lands. */
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

/* The real work, one folder per category under image/. The folder's name is
   the category's; everything in it becomes a tile in that category's strip,
   and the first four are also its hover stack.
 *
 * Read off the disk rather than listed here, so adding a shot to a category is
 * dropping a file in its folder and re-running this — nothing to keep in step.
 * Sorted numerically, because Pitch Deck's files are 01, 02, 04, 08, 13… and a
 * plain sort puts 13 before 2.
 *
 * These are full-frame screenshots with no transparency to trim, so they go
 * through the `photos` path rather than `jobs` — with `avif: true`, since the
 * component renders each one in a <picture>. */
const WORK_CATEGORY_FOLDERS = {
  Website: 'website',
  'Landing page': 'landing-page',
  'Product Design': 'product-design',
  'Pitch Deck': 'pitch-deck',
  'Social Media': 'social-media',
  'Branding Design': 'branding-design',
  'One-Pager': 'one-pagers',
};

const workCatPhotos = [];
for (const [folder, slug] of Object.entries(WORK_CATEGORY_FOLDERS)) {
  const files = readdirSync(`${SRC}/${folder}`)
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  files.forEach((file, i) => {
    workCatPhotos.push({
      src: `${SRC}/${folder}/${file}`,
      name: `work-${slug}-${i + 1}`,
      /* The widest either use gets is the strip's 32rem tile, doubled for a
         retina screen. The sources are 843–931px, so `withoutEnlargement`
         keeps them there and this is only a ceiling for anything larger
         dropped in later. */
      maxW: 1000,
      avif: true,
    });
  });

  console.log(`work/${slug}: ${files.length} file(s)`);
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
  /* The footer portrait used to be built from yarik-cut.png here, and it is
     built from image/footer/Yarik.png further down instead — the closing
     screen's own supplied asset, at 590x700 with the semi-transparent ground
     the design wants. Two entries writing the same name is a race decided by
     source order, so only one of them may exist. yarik-cut.png and yarik.png
     stay in image/ as sources for anywhere a cutout or a studio-white
     rectangle is wanted. */
  { src: `${SRC}/blog1.png`, name: 'journal-1', maxW: 900 },
  { src: `${SRC}/blog2.png`, name: 'journal-2', maxW: 900 },
  { src: `${SRC}/blog3.png`, name: 'journal-3', maxW: 900 },
  { src: `${SRC}/bg 2.png`, name: 'quote-ground', maxW: 1800 },
  /* The ground of Two ways in's left panel. new-two.png replaces two_ways.png
     — same 0.863 aspect, twice the resolution (1476x1710 against 738x854), so
     it is a drop-in and the panel's markup keeps its ratio. maxW now bites
     where it used to be nominal: the source is wider than 1600 was reaching
     for, so this is a real downscale rather than `withoutEnlargement` handing
     back the original. Quality stays at 90 — the panel shows this at close to
     1:1 on a wide screen, where there is little downscale to hide compression
     in. */
  { src: `${SRC}/new-two.png`, name: 'two-ways', maxW: 1600, avif: true, quality: 90 },

  /* Overclock's ground on the home page — a full-bleed field, so it is sized
     for the widest screen it has to fill rather than for a box. 2400 covers a
     1920 viewport with room for the crop `cover` takes, and the source is
     2880 wide, so this is a real downscale.

     `avif: true` because the component asks for it first, and quality 82 —
     the default — is safe here in a way it would not be on the Two ways panel:
     this is an unlit dark scene, mostly smooth gradient, which is exactly what
     these codecs are good at. It comes out an order of magnitude under the
     3.1MB source.

     The chapter carries a film now (public/media/overclock-cover.*, from
     image/Monitor_Full.mp4, which this script does not touch) and takes its
     poster from that film's own first frame — so nothing reads this any more.
     Kept because it is still the still of that scene, and putting the chapter
     back on a static ground is one prop rather than a re-export. */
  { src: `${SRC}/Overclock-bg-home.png`, name: 'overclock-ground', maxW: 2400, avif: true },

  /* Client wordmarks for the marquee above Testimonials.
     `lossless`, unlike everything else here: these are flat two-colour marks
     with hard edges at 62–145px wide, which is exactly what lossy WebP rings
     around — and losslessly they are a couple of KB each anyway. maxW is
     nominal for the same reason as two-ways: the sources are already smaller
     than any cap worth stating, and `withoutEnlargement` keeps them there.
     `phillips.png` is the file's spelling; the brand's is Philips, so the
     output takes the brand's. */
  ...[
    ['gojek.png', 'logo-gojek'],
    ['phillips.png', 'logo-philips'],
    ['mandiri.png', 'logo-mandiri'],
    ['BNP.png', 'logo-bnp-paribas'],
    ['novo.png', 'logo-novo-nordisk'],
    ['zingage.png', 'logo-zingage'],
    ['MCD.png', 'logo-mcdonalds'],
    ['Evyd.png', 'logo-evyd'],
    ['Pfizer.png', 'logo-pfizer'],
  ].map(([file, name]) => ({ src: `${SRC}/${file}`, name, maxW: 400, lossless: true })),

  // One entry per file across the four category folders — see
  // WORK_CATEGORY_FOLDERS above.
  ...workCatPhotos,

  /* Our work — categorized. One shot per category, and each one is the whole
     screen: WorkCategories.astro paints them full bleed as the section's
     ground with the copy column over them behind a wash, so these are read at
     the width of the window and not at the width of a card. 2400 is the same
     cap the hero's still is under and for the same reason.

     `flatten` because all four are exports with an alpha channel. Nothing is
     actually cut out in them, but a stray transparent pixel over a black
     section would be a hole rather than a colour, and `cover` can put the
     edges of the frame anywhere.

     All five have one now. */
  /* The founder's portrait in the closing screen.

     Kept at its native 590x700 — it is drawn at about 290px wide and the file
     is a portrait with real edges, so there is nothing to gain from a cap it
     never reaches.

     NOT flattened, and that is the whole character of it. The dark ground it
     was cut on carries an alpha of 0.8 while the subject is opaque, so the
     landscape behind it shows faintly through the box: the picture sits ON the
     photograph rather than in a hole punched out of it. Flattened it would be a
     solid rectangle, which is what a border would have had to be drawn to
     rescue. */
  { src: `${SRC}/footer/Yarik.png`, name: 'portrait-yarik', maxW: 590, avif: true, quality: 84 },

  /* The two panels Two ways in's window opens onto. Full-bleed grounds, read at
     the size of the window and not at the size of a card, so they are capped
     where the category shots are.

     Both are dark photographs and both carry white type, which is the whole
     reason Sprint's panel changed sides: it was dark ink on a light grey flat,
     and the same ink on this picture is unreadable. See the scrim on
     `.offer__art` in Offer.astro for the rest of that. */
  ...['Sprint.png', 'Retainer.png'].map((file) => ({
    src: `${SRC}/offer/${file}`,
    name: `offer-${file.replace('.png', '').toLowerCase()}`,
    maxW: 2400,
    avif: true,
    quality: 80,
    flatten: true,
  })),

  ...[
    ['Website.png', 'work-website-design', {}],
    ['Product Design.png', 'work-product-design', {}],
    ['Branding.png', 'work-brand-design', {}],
    /* Replaced, and the replacement needs no crop. The old export was a mockup
       of this very page with the site's own floating nav drawn into it — the
       wordmark, "PITCH DECK" and the hamburger, in a capsule at the top of the
       frame — so its top tenth was cut off to stop the reader seeing two navs,
       one live and one photographed, a few pixels apart. This one is a hall
       with the deck on the screen and no capsule in it; trimming it would only
       throw away ceiling. */
    ['Pitch Deck New.png', 'work-pitch-deck', {}],
    /* The fifth category's shot, at last. Until now it had none and painted its
       flat `tone` instead. */
    ['Marketing Design.png', 'work-marketing-design', {}],
  ].map(([file, name, opts]) => ({
    src: `${SRC}/work/${file}`,
    name,
    maxW: 2400,
    avif: true,
    quality: 80,
    flatten: true,
    ...opts,
  })),
];

for (const {
  src,
  name,
  maxW,
  avif = false,
  quality = 82,
  lossless = false,
  flatten = false,
  trimTop = 0,
} of photos) {
  let input = sharp(src);

  /* Both of these have to happen before the resize, and in this order: an
     extract is in source pixels, and flattening after a resize would composite
     against edges the resampler has already blended with transparency. */
  if (flatten) input = input.flatten({ background: '#000000' });

  if (trimTop > 0) {
    const { width, height } = await sharp(src).metadata();
    const top = Math.round(height * trimTop);
    input = input.extract({ left: 0, top, width, height: height - top });
  }

  const base = input.resize({ width: maxW, withoutEnlargement: true });

  const webp = await base
    .clone()
    .webp(lossless ? { lossless: true, effort: 6 } : { quality, effort: 6 })
    .toFile(`${OUT}/${name}.webp`);
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
