# Tribe World 2026

Front-end for the Tribe brand site. Stack follows `prd.md` §2, with the
version deltas noted below.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output to dist/
npm run images   # re-derive public/media/* from image/*.png
```

## Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | Astro 7 | PRD says Astro 5; 7 is current. Same island model. |
| Styling | Tailwind v4 (`@tailwindcss/vite`) | CSS-first config, tokens in `src/styles/globals.css`. |
| Animation | GSAP 3.15 + ScrollTrigger + SplitText | SplitText is free as of GSAP 3.13, so **OI-06 is closed** — no Club licence needed. |
| Smooth scroll | Lenis 1.3 | Fed through the GSAP ticker — one RAF loop total. |
| Fonts | Astro `fonts` API (Space Grotesk) | Downloaded at build, self-hosted, preloaded. Replaces the manual `@font-face` block in the PRD. |
| Transitions | Astro `<ClientRouter />` | Built-in View Transitions. |

Not wired up yet (deliberately — front-end first): Storyblok, Mux, Vercel
adapter, sitemap, OG endpoint.

There is **no custom cursor** — the native pointer is used throughout.
`[data-magnetic]` elements still lean toward the pointer, which is a button
behaviour rather than a cursor (`src/scripts/magnetic.ts`).

## Structure

```
src/
├── layouts/Base.astro              # head, fonts, ClientRouter, nav
├── pages/index.astro               # the shared scroll scene, all 5 sections
├── components/
│   ├── layout/Nav.astro
│   ├── ui/
│   │   ├── Timeline.astro          # chapter marker, shared by 4 sections
│   │   └── ProjectSection.astro    # shared layout for Overclock/Bedford/CELPIP
│   └── sections/
│       ├── Hero.astro              # chapter 1
│       ├── Showcase.astro          # chapter 2 — its own layout, predates ProjectSection
│       ├── Overclock.astro         # chapter 3 — thin wrapper around ProjectSection
│       ├── Bedford.astro           # chapter 4 — ditto
│       └── Celpip.astro            # chapter 5 — ditto
├── scripts/
│   ├── main.ts                     # entry: page-load / before-swap lifecycle
│   ├── gsap.ts                     # plugin registration (single source)
│   ├── scroll.ts                   # Lenis
│   ├── magnetic.ts                 # [data-magnetic] pull
│   ├── nav.ts
│   ├── hero.ts                     # hero intro + the whole scroll handover
│   ├── timeline.ts                 # setActiveChapter() — shared marker state
│   └── utils/device.ts             # reduced-motion, touch, debounce
├── styles/globals.css
└── tools/prep-images.mjs           # trims + optimises every section's art
```

Convention: styling uses class names, motion uses `data-*` hooks. A script
never selects on a styling class, so restyling can't silently break animation.

## Hero artwork

One pre-composited image inside `.hero__stage` — the tree canopy and the
rectangular ground photo (white pixel squares baked in) arrive as a single
asset (`image/image bgg.png`), not two layers glued together at runtime.

An earlier version used two separately-sourced images (a rectangular base
photo + a transparent tree cutout) registered to each other by measured trunk
position, with a `--tree-x`/`--tree-y`/`--tree-w` formula to keep them aligned.
That's gone — this asset already has the canopy composited in, so there is
nothing left to register, and the WebGL tree-dissolve effect that specifically
eroded the old cutout layer (`src/gl/TreeDissolve.ts`, OGL) was deleted with
it: it had no host once the cutout it targeted no longer existed. If a similar
effect is wanted on the new single image, it would need to be rebuilt against
`.hero__base` rather than reintroduced as-is — say so and it can be added back.

The stage is height-driven — it takes its width from the photo's own
1274 : 1394 ratio, so the photo is never cropped — and centred
(`.hero__col--media` is `justify-content: center`) rather than pinned to the
bottom, which the two-layer version was.

That centring exists because this asset's aspect ratio (1274 : 1394 ≈ 0.91) is
far squarer than the old base photo's (900 : 1277 ≈ 0.70) — the canopy is baked
into the same trimmed bounding box now, instead of bleeding in from a separate,
narrower layer. At full column height its width overflowed the actual gap
between the headline and the aside list far enough to sit on top of real
words, not just empty margin (measured via `Range.getBoundingClientRect()` on
the text nodes, not the elements' layout boxes — a `display:block` line's box
is full column width regardless of how long the word actually is, so
bounding-box comparisons alone were misleading).

`left`/`top` on `.hero__stage` are a further static nudge on top of that —
genuinely static, not a GSAP target, so they don't interact with the
scroll-scale, pointer-parallax or hover-scale tweens on the same element, all
of which write to `transform`, a different property.

**Current values are the sum of several rounds of exact, explicit adjustment**
(height 83% → 108% → 113.4%; left −7rem → −5.5rem → −4.75rem; top −0.5rem →
−1.5rem), each applied as given rather than silently re-tuned back toward the
clearance the first round measured. The trade-off is real and was flagged each
time: at 83% height the box was clear of both text columns; every enlargement
since has grown width proportionally (the aspect ratio is locked) and taken
some of that clearance back. Last measured: 0px overlap with the title side,
~125–130px into the aside side (down from an original 200px+, but present).
If a further request changes the size or position again, re-measure rather
than assume — the numbers here will be stale.

The `left`/`top` nudge is desktop-only (`≥1200px`, where the image sits between
two text columns it needs to clear) — the narrower breakpoints reset both to
`0`. They were not being reset before this round, which pushed the
width-constrained mobile box up to 30px off the left edge of the viewport at
900px and 420px; fixed alongside the changes above.

A prior round misread "margin on the button, 24px, so it isn't cramped" as
"right-align the button, 24px from the edge." Corrected: the button is back at
its original left-aligned position, and the 24px instead reads as intended —
**the whole aside block (list + button) has 24px of clearance above the bottom
edge**, via `margin-bottom: 24px` on `.hero__aside` (previously flush, `0`).

That had to be `margin`, not `padding`: `.hero__col--aside` is
`justify-content: flex-end`, which aligns a flex item's *margin* edge to the
end of its container — padding only grows the box upward and stays exactly as
flush as before, producing no visible gap at all. Verified: exactly 24px
between the aside's bottom edge and the hero's bottom edge at 1512, 1920 and
1280px; larger below 1200px because the hero's own responsive bottom padding
stacks on top there, which is expected.

### Assets

`image/*.png` are the sources. `npm run images` (`tools/prep-images.mjs`) trims
the transparent padding, resizes and writes AVIF + WebP into `public/media/`:

| Output | Size |
|---|---|
| `showcase-device.avif` | 67 KB |
| `two-ways.avif` | 85 KB |

AVIF is served first with WebP as the fallback via `<picture>`. `two-ways` goes
through the `photos` list rather than `jobs` — it is a full-frame photograph
with nothing to trim — with `avif: true` because, unlike the portraits and
journal cards, it does land in a `<picture>`. Its source is only 738 px wide,
so `maxW` is nominal: `withoutEnlargement` keeps it at native size, which is
roughly 1:1 with the panel it grounds at 1440.

The hero's artwork is a **looping video**, not a still, and it does not go
through that script. `image/video-hero.mp4` (864 × 496, 10s) was encoded once by
hand into `public/media/`:

```bash
# Two cuts: a 16:9 one for the wide layout and a portrait one for phones, each
# chosen by `media` on its <source>. The phone cut is encoded at its native
# 402x874 rather than scaled up — the source is already that size, and
# upscaling it would only cost bytes.
ffmpeg -i "image/Bg-hero-dekstop.mp4" -an -vf "scale=1920:-2"   -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p   -movflags +faststart "public/media/hero-video.mp4"

ffmpeg -i "image/Bg-hero-dekstop.mp4" -an -vf "scale=1920:-2"   -c:v libvpx-vp9 -crf 48 -b:v 0 -row-mt 1 -pix_fmt yuv420p   "public/media/hero-video.webm"

ffmpeg -i "image/hero-bg-mobile .mp4" -an   -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p   -movflags +faststart "public/media/hero-video-mobile.mp4"

ffmpeg -i "image/hero-bg-mobile .mp4" -an   -c:v libvpx-vp9 -crf 48 -b:v 0 -row-mt 1 -pix_fmt yuv420p   "public/media/hero-video-mobile.webm"

# Posters, from the encodes so the still and the first frame match exactly.
ffmpeg -i "public/media/hero-video.mp4" -vframes 1   -c:v libwebp -quality 80 "public/media/hero-video-poster.webp"

ffmpeg -i "public/media/hero-video-mobile.mp4" -vframes 1   -c:v libwebp -quality 80 "public/media/hero-video-mobile-poster.webp"
```

plus a VP9 `.webm` sibling (470 KB, served first) and a first-frame
`hero-video-poster.webp` for the gap before the video decodes. The audio track is
stripped on the way in — the element is `muted` regardless, and autoplay depends
on it. `image bgg.png`, `bg image.png` and `hover img.png` (the stills the hero
used to be built from) are no longer read by the build — kept in `image/` only as
history.

## Hero motion

**Intro** (one timeline, `src/scripts/hero.ts`): photo clips open from the
bottom → headline lines unmask and stagger up → aside rows fade up → their
rules draw left to right. Held until `document.fonts.ready` so SplitText
measures real line breaks.

**Pointer:** a small drift on `.hero__stage` toward the mouse position, mouse
input only (`isTouch()` gates it out).

**Mobile scroll zoom (<1200px):** below the desktop pin gate the hero has no
pin and no handover — it simply scrolls with the rest of the page — but it
still gets its own small scroll-tied zoom (scale 1 → 1.08) as it scrolls past,
via a separate, un-pinned `ScrollTrigger` scoped to the hero's own height
(`start: 'top top', end: 'bottom top'`) so it completes at roughly the same
point regardless of how tall the hero is at that width.

**Hover:** the artwork zooms slightly (scale 1 → 1.06) when the pointer is over
it, on a nested `.hero__zoom` wrapper — a separate element from `.hero__stage`,
not a separate property on the same one. `.hero__stage` already carries the
scroll-driven scale (§ below) and the pointer-parallax translate; a second tween
scaling *the same element* would fight the scroll tween over the same `scale`
property and flicker between the two on every scrub frame. Nested transforms
compose visually — stage-scale × zoom-scale — so hovering during a scroll still
looks correct, and the photo + cut-out still zoom as one rigid unit. Verified:
scaling both simultaneously in the live DOM produces the exact product
(1.1 × 1.06 → the tree's box grows by 1.166×, measured to sub-pixel accuracy).

## The scroll handover

All five sections (Hero, Showcase, Overclock, Bedford, CELPIP) share one
scroll scene (`index.astro`). `hero.ts` sets `data-scene-mode="pinned"` on it,
which stacks all five absolutely on top of each other; the scene then pins for
the sum of every phase below and one scrubbed timeline runs across the whole
thing:

| Phase | What happens |
|---|---|
| hero → Showcase | **the one bespoke transition.** Pixel tiles drop in one by one spreading out of the hero photo, the photo pushes in (scale 1 → 1.22), hero type fades out, and — late in the phase, underneath the now-solid tile field — Showcase crossfades in. Showcase's own text then rises into view. |
| Showcase's text exits | translates up + fades, in place — the device image never moves |
| Overclock arrives | plain opacity crossfade, 0 → 1, no zoom, no pixel field. Overclock's own text rises into view partway through |
| Overclock's text exits | same as Showcase's |
| Bedford arrives | same plain crossfade as Overclock |
| Bedford's text exits | same as the others |
| CELPIP arrives | same plain crossfade — currently the last section, so no exit phase follows it |
| Settle | nothing animates; scroll room to rest on the finished page before the pin (and the document) ends |

Every phase length lives in one object (`VIEWPORTS` in `hero.ts`) as a count of
viewports; the pin's total scroll distance is their sum, and a small `at()`
helper turns "this phase is N viewports long" into "starts at fraction X of the
whole pin" by walking that list once. Adding a 6th section is two more numbers
in that object, not a rewrite of the fraction math.

### Why Overclock, Bedford and CELPIP are deliberately NOT copies of the hero→Showcase mechanic

Direct instruction, more than once: don't reuse phase A's pixel-reveal-plus-
zoom for the later handovers. Each later arrival is a plain
`opacity: 0 → 1` crossfade (`addArrival()`) — no pixel field, no scale on
anything. Only phase A keeps the original mechanic, since it was never asked
to change.

### The chapter marker is 4 slots covering 5 sections

An explicit, standing direction: the marker should read "1" for all of
hero → Showcase (they're one continuous chapter), only advancing once Showcase
has genuinely been left. So the mapping is deliberately not 1:1 with the DOM:

```
slot 1 = hero + Showcase     slot 2 = Overclock
slot 3 = Bedford             slot 4 = CELPIP
```

Each section's own `data-chapter-section` attribute (1–5, one per section, in
document order) is separate and purely descriptive — nothing reads its value.
Don't assume it lines up with the marker.

Switching slots needs an `onUpdate` threshold sweep, not a single
`onLeave`/`onEnterBack` pair: with 5 sections in one pin there are 3 *internal*
transition points to detect (Overclock/Bedford/CELPIP each finishing their
arrival), not just the one pin boundary a 2-section version has.
`setActiveChapter()` no-ops once already on the target slot, so re-checking
this every scroll tick is cheap.

### A bug this surfaced: the invisible section was eating every click

Every non-hero layer is `position: absolute; inset: 0` — full-viewport — for
the entire pin, sitting at `opacity: 0` until its own crossfade. **`opacity: 0`
does not stop an element from receiving pointer events.** Left at the default
`auto`, an invisible layer sitting on top silently swallows hover and clicks
aimed at whatever's visually underneath — confirmed with `elementFromPoint()`
in the live DOM.

Fixed with `pointer-events: none` as the base state (`index.astro`), flipped to
`auto` near the end of that layer's own arrival phase via `.set()` calls in the
handover timeline — which apply the instant the scrubbed playhead crosses them,
in either direction, so scrolling back up past that point correctly hands
pointer events back.

### Two scale targets, one visual result (hero only)

`.hero__base` is wrapped in `.hero__zoom`, itself a child of `.hero__stage`:

```
.hero__stage           ← scroll-driven scale (1 → 1.22), pointer-parallax x/y
  .hero__zoom           ← hover-driven scale (1 → 1.06)
    .hero__base
```

Both wrappers exist because two independent GSAP tweens cannot safely target
`scale` on the *same* element — whichever renders last on a given frame wins,
so a scroll-scrubbed tween and a hover tween competing over one property would
flicker between the two. Giving hover its own nested element sidesteps the
conflict entirely: the browser composes nested CSS transforms on its own
(stage-scale × zoom-scale), so hovering mid-scroll still looks correct.

Bundle: ~59KB gzipped JS total, against the PRD's 100KB budget.

Verified at 1512×900: pin runway is exactly 5.1 viewports (matches
`Object.values(VIEWPORTS).reduce()` precisely — checked via total document
scroll height), every section's text starts hidden at the CSS default matching
its GSAP "from" state, all four chapter-marker instances agree, no horizontal
overflow. At 1199/900/420px: normal flow, no pin, every section's text plainly
visible with no transform.

**Desktop only.** Below 1200px every section is content-height rather than part
of one exact-viewport pin, so stacking them into a viewport-tall pinned scene
would clip them. A `gsap.matchMedia` gate builds the handover above that width
and tears it down below, where all five sections simply read top to bottom.

The CSS breakpoint is `max-width: 1199px`, deliberately not `75rem`: at exactly
1200px a `max-width: 75rem` query and the `min-width: 1200px` gate both match,
which made the hero content-height *and* pinned at the same time.

**Why the settle phase exists.** Once a section is absolutely positioned inside
`.scene` (which is exactly `100svh` whether pinned or not), there's no DOM
content after it to provide scroll room once the pin ends — without a deliberate
hold phase, the document would end at the exact instant the last crossfade
finishes, reaching "scrollbar at the bottom" and "page done animating"
simultaneously. The settle phase (currently 1 viewport, after CELPIP) exists
purely to give the finished page somewhere to rest. Adding a 6th section
removes the need for it after CELPIP specifically, but whichever section ends
up last will need the same kind of room after it.

Without JS, or under `prefers-reduced-motion`, `data-scene-mode` is never set —
every section stays in normal flow and reads top to bottom, no pin at all.

## Notes on the project sections

- Overclock, Bedford and CELPIP share one layout component,
  `src/components/ui/ProjectSection.astro` — title + body left, device shot
  bottom-right, `<Timeline />` marker top-right. Showcase (chapter 2) is NOT
  built on this; it predates the component and has its own gradient ground and
  texture overlay nobody asked to change.
- Overclock's source (`Overclock.png`) was a flat Figma export of the *entire*
  reference frame (background + text + timeline baked in as opaque pixels),
  not a transparent cutout — it needed a manual crop in `tools/prep-images.mjs`
  to isolate just the device. Bedford's and CELPIP's sources are clean
  transparent cutouts, same as Showcase's, so those use the automatic
  alpha-bounding-box trim instead.
- The faint pixel field on Showcase is `.showcase__texture` — one element to
  delete if it isn't wanted.

## Accessibility

- Every animation is gated on `prefers-reduced-motion`; the CSS ships the
  resolved end state so reduced-motion users see a static, complete hero.
- Pre-animation hidden states only apply under `html[data-js="true"]`, so a
  failed script leaves content visible rather than blank.
- Skip link, single `<h1>`, labelled nav landmark, hover states all have focus
  equivalents.
