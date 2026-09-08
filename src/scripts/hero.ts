import { gsap, ScrollTrigger, SplitText } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Hero motion.
 *
 * Intro    — the video clips open from the bottom, headline lines unmask, aside
 *            rows fade up and their rules draw in.
 * Handover — the scene pins once (so nothing in it ever scrolls away on its
 *            own) and every transition happens inside that one pin, one
 *            scroll at a time. Showcase (Nerd Apply) is out of the page for
 *            now, so the live sequence is two beats:
 *
 *              A. hero → Showcase        THE bespoke transition: pixel reveal
 *                                         spreading from the hero photo,
 *                                         photo pushes in, Showcase crossfades
 *                                         in late underneath the tiles.
 *                                         Skipped while `[data-scene-next]` is
 *                                         not in the page.
 *              B. hero → Overclock        (or Showcase → Overclock, when A
 *                                         runs) the same pixel language,
 *                                         scattered rather than spreading from
 *                                         a point: a field of tiles in
 *                                         Overclock's own ground colour lands
 *                                         in random order, then the layer
 *                                         swaps in behind the finished field,
 *                                         same colour, no seam.
 *              C. Overclock → Our work    the same arrival as B: Overclock
 *                                         recedes (copy up, ground zooms), a
 *                                         field of tiles in Our work's cream
 *                                         lands in random order, then that
 *                                         section swaps in on top of the
 *                                         finished field — same colour, no
 *                                         seam. The pin ends as it finishes.
 *
 *            One scroll plays one of those end to end and lands on the chapter
 *            after it; anything that arrives while one is playing is swallowed.
 *            See "Stepping" below for why it is not scrubbed, and what the
 *            scroll position is still for.
 *
 *            The chapters used to have a dwell phase each — scroll room a
 *            finished chapter held the screen for. A stepped scene has no use
 *            for one: a chapter holds until the next scroll, however long that
 *            is. They are gone, and each live phase is one viewport.
 *
 *            Bedford and CELPIP were chapters here until their case studies
 *            were ready; Showcase is parked the same way. See index.astro for
 *            what putting any of them back involves.
 *
 *            Chapter marker: 2 slots, NOT 3 — hero (and Showcase, when it is
 *            in) share slot 1, so slot 2 = Overclock. See Timeline.astro's
 *            docstring for why this doesn't line up 1:1 with each section's
 *            own `data-chapter-section` index. Switching slots requires an
 *            `onUpdate` threshold check (not a single onLeave/onEnterBack)
 *            because the transition points are *internal* to one continuous
 *            pin, not pin boundaries — `setActiveChapter` no-ops once already
 *            on the target slot, so re-evaluating this on every scroll tick
 *            is cheap.
 *
 *            Every phase length is in viewports (`VIEWPORTS` below); the pin
 *            is their sum, and every tween's position is a fraction of that
 *            total (computed once into `at`/`dur`). They are equal, which is
 *            what makes one step worth exactly one viewport of the pin and
 *            lets the step index and the scroll position stay in agreement
 *            without any arithmetic between them.
 *
 *            Only transform and opacity are touched, so nothing re-lays-out
 *            and nothing can jump.
 * Mobile   — the same pin and the same handover. There is no width gate: the
 *            context below is `(min-width: 1px)`, so every width builds the
 *            scene and a resize never tears it down and rebuilds it. What a
 *            resize does do is refresh the trigger, which is why the scene's
 *            finished state is re-derived there rather than latched at the
 *            edges — see setSceneDone.
 *
 *            (This used to read "below the pin gate (<1200px) there is no pin
 *            and no handover". That gate is long gone; the note outlived it.)
 * Hover    — the photo zooms slightly (scale 1 → 1.06) on a nested wrapper
 *            independent of the scroll-driven scale, so the two tweens never
 *            compete over the same property on the same element.
 * Pointer  — the stage drifts on mouse move.
 *
 * Returns a cleanup function.
 */
/**
 * The hero's reveal — its own pin, scrubbed.
 *
 * NOT a step. Everything else in this page's opening is stepped: one scroll,
 * one chapter, the gesture swallowed and the timeline jumped. This is the
 * exception and it has to be, because it is not a change of chapter — it is
 * one continuous movement the reader drives with the scroll and can run
 * backwards. So the hero is pinned for two viewports and the whole sequence is
 * scrubbed against that distance, and the stepped scene begins after it.
 *
 * Three stages, in this order and not overlapping — the picture arrives before
 * it grows, and it has finished growing before anything is uncovered:
 *
 *   1. to the middle   the framed picture slides from the left of the screen to
 *                      the centre. It does not change size while it travels.
 *                      The copy leaves at the same time.
 *
 *   2. and then grows  the picture scales up to the size the screen gives it,
 *                      about the centre it has just arrived at, and the frame
 *                      around it grows with it.
 *
 *   3. and then opens  the tiles still covering the rest of the screen leave in
 *                      random order, and the sentence arrives out of a blur
 *                      before the last of them has gone.
 *
 * THE FRAME IS THE TILE FIELD, at every moment, including while it moves and
 * grows. That is why the hole is re-cut on each frame rather than the field
 * being transformed: a field that moved with the picture would drag its own
 * outer edge into the screen and show the photograph past it, and a field that
 * scaled would stop covering the screen at all. The tiles stay put, screen-
 * aligned and full-bleed; what changes is which of them are missing.
 *
 * Re-cutting sounds expensive and is not: the desired state of every tile is
 * computed each frame, but only the ones that actually changed are written to,
 * which on any given frame is the few dozen along the frame's moving edge.
 *
 * Returns a cleanup function.
 */
function initHeroReveal(hero: HTMLElement): () => void {
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]');
  const media = hero.querySelector<HTMLImageElement>('[data-hero-media]');
  const field = hero.querySelector<HTMLElement>('[data-hero-pixels]');
  /* The box the photograph is painted in. Taller than the stage — see
     .hero__base — and the difference matters to every number below. */
  const mediaBox = hero.querySelector<HTMLElement>('[data-hero-base]');
  const revealText = hero.querySelector<HTMLElement>('[data-hero-reveal]');
  const revealLines = gsap.utils.toArray<HTMLElement>('[data-hero-reveal-line]', hero);
  const veil = hero.querySelector<HTMLElement>('[data-hero-veil]');
  const fall = hero.querySelector<HTMLElement>('[data-hero-fall]');
  /* The section the hero hands over to. The black is timed against this
     arriving rather than against the hero leaving — see the exit below. */
  const after = document.querySelector<HTMLElement>('[data-project="overclock"]');
  /* The whole copy column, and ONLY the column.
  
     Not the column plus its rows. The buttons and the scroll cue start at
     `opacity: 0` — the stylesheet's pre-animation state — and the intro fades
     them in, but the intro is held until the fonts resolve while this timeline
     is built straight away. A tween created against them at that moment
     records 0 as where they came from, so scrubbing back up returned them to
     0: the headline came back and everything under it stayed gone. The column
     itself is never at 0, so fading it takes the whole block down and brings
     the whole block back. */
  const copy = gsap.utils.toArray<HTMLElement>('.hero__col--text', hero);
  if (!stage || !media || !field) return () => {};

  const reduced = prefersReducedMotion();

  /* Under reduced motion there is no pin and no scrub. The photograph is
     simply the hero's ground and the sentence is simply there: both are
     content, and neither is withheld because someone asked for less
     movement. */
  if (reduced) {
    gsap.set(media, { clearProps: 'transform' });
    field.replaceChildren();
    revealText?.setAttribute('aria-hidden', 'false');
    gsap.set([revealText, ...revealLines], { autoAlpha: 1, filter: 'none', y: 0 });
    return () => {};
  }

  let cols = 0;
  let rows = 0;
  let size = 0;
  let tiles: HTMLElement[] = [];
  /* What each tile is doing right now, so a frame only writes the ones that
     have changed. `true` = covering the photograph, `null` = not known, which
     forces the next pass to write it whatever it decides. */
  let covering: Array<boolean | null> = [];
  /* And which tiles the reveal has already taken away for good. They are out
     of the frame's hands from that point: the frame is still moving and
     growing while the reveal runs — the two overlap on purpose — and without
     this the frame would keep putting back the squares the reveal had just
     removed. */
  let revealed: boolean[] = [];
  /* Which tiles the ragged edge decided to flip, held so the edge does not
     re-roll itself on every frame — a frame whose broken edge changes shape
     each time the scroll moves is a frame that boils. */
  let jitter: number[] = [];

  /* The two rectangles the frame passes between, in stage pixels. */
  let rest = { l: 0, r: 0, t: 0, b: 0 };
  let grown = { l: 0, r: 0, t: 0, b: 0 };
  /* And the photograph's transform at rest — where it has to be for the tree
     and the person to sit inside the resting frame. */
  /* The copy column's foot, and the lift the scroll cue sits at above the
     picture's bottom line. */
  let colFoot = 0;
  let stageOffset = 0;
  const CUE_LIFT = 20;

  let restX = 0;
  let restY = 0;
  let restScale = 1;

  const frac = (name: string) =>
    parseFloat(getComputedStyle(hero).getPropertyValue(name)) || 0;

  const measure = () => {
    const box = stage.getBoundingClientRect();
    const width = box.width || window.innerWidth;
    const height = box.height || window.innerHeight;
    const stageTop = box.top;

    size = Math.max(isTouch() ? 40 : 24, Math.round(width / (isTouch() ? 14 : 40)));
    cols = Math.ceil(width / size) + 2;
    rows = Math.ceil(height / size) + 2;

    field.style.setProperty('--px-size', `${size}px`);
    field.style.setProperty('--px-cols', String(cols));

    /* The resting frame: a drawn rectangle, at the size the stylesheet gives
       it, against the left of the page and centred down it.

       Clamped to the stage, because 649px of box does not fit a 600px window
       and a frame taller than the screen is a frame with no edges. */
    /* Both off the width, so the rectangle keeps its shape at any window —
       see --hero-frame-w. Capped against the stage so a short screen gets a
       frame with edges rather than one running off the top and bottom. */
    const fw = Math.min(frac('--hero-frame-w') * width, width * 0.9);
    const fh = Math.min(frac('--hero-frame-h') * width, height * 0.88);
    const fx = frac('--hero-frame-l') * width;
    /* Centred down the stage and then dropped, and the drop is clamped so the
       box can never be pushed past the foot of the screen on a short one. */
    const drop = frac('--hero-frame-drop') * height;
    const top = Math.min((height - fh) / 2 + drop, height - fh);
    rest = { l: fx, r: fx + fw, t: top, b: top + fh };

    /* Where the subject sits in the photograph once `object-fit` has placed
       it — the same arithmetic the browser paints with, so the picture's own
       geometry is read rather than guessed.

       `max`, matching the stylesheet's `object-fit: cover` — the two differ by
       which axis wins, and they have to agree. Set to `min` while the CSS said
       `cover`, the script would believe the picture smaller than it is drawn
       and the frame it fits the subject into would sit off the tree by the
       difference. This pair is the one thing to change together if the fit
       ever changes again. */
    const natW = media.naturalWidth || 2878;
    const natH = media.naturalHeight || 1926;

    /* Against the BOX THE PICTURE IS PAINTED IN, not against the stage.

       They stopped being the same thing when the media box was given the
       photograph's own height so its foot could overhang the fold: the stage
       is the screen, 900 tall, and the box is 964. Reading the cover fit off
       the stage put the subject 64px from where it actually is, and the frame
       that is fitted around it came out low — the canopy filled the box and
       the person and the grass were below its foot. */
    const shot = mediaBox?.getBoundingClientRect();
    const paintW = shot?.width || width;
    const paintH = shot?.height || height;
    const paintTop = shot ? shot.top - stageTop : 0;

    const fitted = Math.max(paintW / natW, paintH / natH);
    const drawW = natW * fitted;
    const drawH = natH * fitted;
    const offX = (paintW - drawW) / 2;
    const offY = paintTop + (paintH - drawH) / 2;
    const subL = offX + frac('--hero-subject-l') * drawW;
    const subR = offX + (1 - frac('--hero-subject-r')) * drawW;
    const subT = offY + frac('--hero-subject-t') * drawH;
    const subB = offY + (1 - frac('--hero-subject-b')) * drawH;

    /* One scale and one offset that put the subject inside the resting frame,
       on whichever axis is tighter so nothing is ever cut. */
    restScale = Math.min((rest.r - rest.l) / (subR - subL), (rest.b - rest.t) / (subB - subT));
    /* The point the picture scales about, which is the middle of ITS OWN box —
       `transform-origin: 50% 50%` on .hero__media, and that element fills the
       media box, not the stage. Taken as the stage's middle the two were 32px
       apart, and the subject came to rest that far off centre in the frame:
       104px of air above it against 69 below. */
    const midX = paintW / 2;
    const midY = paintTop + paintH / 2;
    restX = (rest.l + rest.r) / 2 - (midX + ((subL + subR) / 2 - midX) * restScale);
    restY = (rest.t + rest.b) / 2 - (midY + ((subT + subB) / 2 - midY) * restScale);

    /* Where the frame ends up once the picture has arrived: centred, and grown
       by exactly the factor the picture grew by. The frame is the picture's
       edge, and the two cannot change size at different rates without the
       frame cropping what it is framing. */
    const grow = 1 / restScale;
    const halfW = ((rest.r - rest.l) / 2) * grow;
    const halfH = ((rest.b - rest.t) / 2) * grow;
    grown = {
      l: Math.max(0, midX - halfW),
      r: Math.min(width, midX + halfW),
      t: Math.max(0, midY - halfH),
      b: Math.min(height, midY + halfH),
    };

    /* The field itself. Rebuilt only when the count changes. */
    if (tiles.length !== cols * rows) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < cols * rows; i += 1) frag.appendChild(document.createElement('span'));
      field.replaceChildren(frag);
      tiles = Array.from(field.children) as HTMLElement[];
      covering = new Array(tiles.length).fill(null);
      revealed = new Array(tiles.length).fill(false);
      order = [];
      /* One roll per tile, kept. It is what breaks the frame's edge into
         squares stepping in and out instead of a straight line, and it has to
         be stable or the edge crawls while the reader scrolls. */
      jitter = Array.from({ length: tiles.length }, () => Math.random());
    }
  

    /* Where the copy column's foot is, cached for the cue. The cue is
       positioned inside that column, so its offset has to be measured from
       there — the column stops about 66px short of the section's own foot. */
    const col = hero.querySelector<HTMLElement>('.hero__col--text');
    /* Both in the SAME space. The column's foot is read in viewport
       coordinates and the frame's is a tile row inside the stage, so the
       stage's own top has to join them — without it the two were 22px apart
       and the cue's 20px lift was eaten by the difference, landing it back on
       the picture's line. */
    colFoot = col ? col.getBoundingClientRect().bottom : height;
    stageOffset = stageTop;
  };

  /* Cut the hole at `rect`. Only tiles whose state changes are written. */
  const cut = (rect: { l: number; r: number; t: number; b: number }) => {
    /* To the NEAREST tile boundary, not outward.

       Outward rounding pushed every edge up to a whole tile past where the
       frame was asked to be, and the ragged edge below then added another —
       so a rectangle specified at 496x649 was drawn at 577x757. Rounding to
       the nearest keeps the box the size it was given, to within half a tile
       on each edge. */
    /* The SIZE is rounded, then placed — not each edge rounded on its own.

       Rounding the four edges independently lets two of them go opposite ways:
       a top at 3.49 tiles rounds down and a bottom at 21.5 rounds up, and the
       box comes out a whole tile taller than it was asked to be. Measured
       exactly that — 649px specified, 685px drawn. Rounding the width and the
       height instead pins the box to a whole number of tiles of the size that
       was asked for, and only its position is free to land on the nearest
       boundary. What is left is half a tile of drift on where it sits, never
       on how big it is. */
    const c0 = Math.round(rect.l / size);
    const r0 = Math.round(rect.t / size);
    const c1 = c0 + Math.max(1, Math.round((rect.r - rect.l) / size));
    const r1 = r0 + Math.max(1, Math.round((rect.b - rect.t) / size));

    /* The cue's line, published from HERE — the one place the snapped
       rectangle exists.

       It was worked out a second time in `measure`, repeating the rounding
       against the same inputs, and the two did not agree: the published foot
       came out 21px from the drawn one and the cue sat on the picture's line
       instead of the 20px above it that was asked for. A number that has to
       match a drawn edge has to come from the code that draws it. */
    hero.style.setProperty(
      '--hero-frame-foot',
      `${Math.round(colFoot - (stageOffset + r1 * size)) + CUE_LIFT}px`,
    );

    for (let i = 0; i < tiles.length; i += 1) {
      const c = i % cols;
      const r = (i - c) / cols;
      const box = c >= c0 && c < c1 && r >= r0 && r < r1;
      /* Two notched corners, and nothing else.

         The whole perimeter used to be broken up on a coin toss — every edge
         tile flipped, all four sides. That reads as a torn edge, and a torn
         edge on all sides reads as damage. The reference notches exactly two
         opposite corners and leaves the other two clean, which is a frame with
         a couple of pixels bitten out of it rather than a frame with a ragged
         outline: the same language, said once instead of forty times.

         Stated as offsets rather than rolled, so the shape is the same on
         every load and at every width — a detail this small has to be the same
         detail each time or it is noise.

         AND SOME OF THEM ARE INSIDE THE PICTURE. That is the part two earlier
         attempts missed: both only ever bit the outline, once at the corners
         and once along the edges, and an outline that is only nibbled reads as
         a frame with a chipped border. The reference has squares standing in
         the photograph itself, stepping diagonally out towards the corner —
         so the picture looks like it is being taken apart a pixel at a time
         rather than trimmed.

         Two runs. One square at the top-left corner, and at the bottom right a
         staircase: three squares walking out from inside the image to the
         corner, with two more along the bottom edge beside them. */
      const dcL = c - c0;
      const drT = r - r0;
      const dcR = c - (c1 - 1);
      const drB = r - (r1 - 1);
      const notched =
        (dcL === 0 && drT === 0) ||
        (dcR === -3 && drB === -4) ||
        (dcR === -2 && drB === -3) ||
        (dcR === -1 && drB === -2) ||
        (dcR === 0 && drB === -1) ||
        (dcR === -4 && drB === 0) ||
        (dcR === -3 && drB === 0);
      const inFrame = box && !notched;
      /* A tile the reveal has taken is gone, whatever the frame thinks. */
      const wants = revealed[i] ? false : !inFrame;
      if (covering[i] === wants) continue;
      covering[i] = wants;
      tiles[i].style.opacity = wants ? '1' : '0';
    }
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const between = (
    a: { l: number; r: number; t: number; b: number },
    b: { l: number; r: number; t: number; b: number },
    t: number,
  ) => ({ l: lerp(a.l, b.l, t), r: lerp(a.r, b.r, t), t: lerp(a.t, b.t, t), b: lerp(a.b, b.b, t) });

  /* The scrub's own clock. One number, 0 to 1 across the whole pin, which the
     three stages read their own slice of — rather than three timelines that
     would each need their own trigger and their own agreement about where the
     others ended. */
  const at = { p: 0 };

  /** Where each stage sits in that number.
   *
   *  Two stages, not three. The move to the middle and the growth to full size
   *  used to be separate — arrive, stop, then swell — and they are one motion
   *  now: by the time the picture is in the centre of the screen it is already
   *  at the size it ends at, so everything after it is nothing but the reveal.
   *  Which is the point: the second half of this should be the tiles leaving
   *  and nothing else competing for the eye. */
  const ARRIVE = [0.04, 0.52] as const;
  /* Starting well before the arrival has finished — a third of the way into
     it, not at the end of it.

     Run end to end the two read as two things: the picture settles, a beat,
     then squares start leaving, and that beat is the join you can see.
     Overlapped they are one movement. Pulled earlier again here, so the field
     is already thinning while the frame is still crossing the screen and
     growing — by the time the picture is at full size a good part of it has
     already been uncovered, and the second half of the pin is the last of the
     squares rather than all of them. */
  const OPEN = [0.16, 1] as const;

  /**
   * And then it holds.
   *
   * Scroll room at the end of the pin where nothing moves and the finished
   * frame simply stands: the photograph full, the sentence on it. Without it
   * the last tile leaving and the pin releasing are the same moment, so the
   * picture is complete for exactly one frame before Overclock takes the
   * screen — the reveal arrives at nothing.
   *
   * As a share of the animated part, so changing the stages above cannot make
   * the hold disproportionate. 0.3 is a little under a viewport of scroll at
   * the two this runs over, which is long enough to read three lines and short
   * enough that it does not feel stuck.
   */
  const HOLD = 0.3;

  const span = (range: readonly [number, number]) =>
    gsap.utils.clamp(0, 1, (at.p - range[0]) / (range[1] - range[0]));

  /* Random order, fixed once: the tile that goes first has to go first every
     time the reader scrubs over that point, or the reveal shimmers. */
  let order: number[] = [];

  const render = () => {
    const arrive = gsap.parseEase('power2.inOut')(span(ARRIVE));
    const open = span(OPEN);

    /* The picture travels and grows as one move — one element has one
       transform, and this is one motion, so it is one `set`. */
    gsap.set(media, {
      x: lerp(restX, 0, arrive),
      y: lerp(restY, 0, arrive),
      scale: lerp(restScale, 1, arrive),
    });

    /* And the frame goes with it, from the drawn rectangle to the grown one. */
    const rect = between(rest, grown, arrive);

    /* The reveal, which by now may already be running underneath the arrival.
       It only decides which tiles are gone for good; the frame below decides
       everything else, and skips the ones this has taken.

       Reversible in both directions, because a scrub is: a tile past the front
       is taken, a tile behind it is handed back to the frame — `null` rather
       than a state of its own, so the next pass writes whatever the frame
       wants without having to know what it was. */
    if (open > 0) {
      if (!order.length) {
        order = tiles.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i -= 1) {
          const j = Math.floor(jitter[i] * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
      const gone = Math.round(open * order.length);
      for (let k = 0; k < order.length; k += 1) {
        const i = order[k];
        const take = k < gone;
        if (revealed[i] === take) continue;
        revealed[i] = take;
        if (take) {
          covering[i] = false;
          tiles[i].style.opacity = '0';
        } else {
          covering[i] = null;
        }
      }
    } else if (revealed.some(Boolean)) {
      /* Scrubbed back out of the reveal entirely. */
      for (let i = 0; i < revealed.length; i += 1) {
        if (!revealed[i]) continue;
        revealed[i] = false;
        covering[i] = null;
      }
    }

    cut(rect);

    /* And the pointer parallax stops once the picture is the screen.

       It is a drift on the whole stage, which is a lovely thing to have under
       a framed picture sitting in a page and the wrong thing entirely under a
       full-bleed one: at full size the drift pulls the photograph's own edges
       off the sides of the window. The flag is an attribute rather than a
       variable so the parallax handler — which lives in initHero, not here —
       can read it without the two having to be introduced. */
    hero.toggleAttribute('data-hero-settled', arrive >= 1);
  };

  measure();
  render();

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      /* Two viewports of scroll for the whole sequence — long enough that each
         stage has room to be watched, short enough that a reader who only
         wants to get past it is not held for four screens. */
      /* Two viewports for the sequence, plus the hold on the end of it. */
      end: () =>
        `+=${(stage.getBoundingClientRect().height || window.innerHeight) * 2 * (1 + HOLD)}`,
      pin: true,
      anticipatePin: 1,
      scrub: 0.6,
      invalidateOnRefresh: true,
      onRefresh: () => {
        measure();
        render();
      },
    },
  });

  tl.to(at, { p: 1, ease: 'none', duration: 1, onUpdate: render }, 0);

  /* The hold, as empty time on the end of the timeline. A scrubbed timeline is
     mapped across the whole of the trigger's distance, so time here with
     nothing in it is scroll there with nothing happening — which is exactly
     what a held frame is. Nothing to animate and nothing to switch off. */
  tl.to({}, { duration: HOLD }, 1);

  /* The copy leaves with the first stage. */
  if (copy.length) {
    /* `fromTo`, so where it comes back to is stated here rather than sampled
       from whatever the column happened to be when this was built. */
    tl.fromTo(
      copy,
      { opacity: 1, y: 0 },
      { opacity: 0, y: -32, ease: 'power1.in', duration: 0.26, immediateRender: false },
      0,
    );
  }

  /* The veil, with the last of the tiles. It has to be on before the sentence
     is, or the words arrive on the bright sky they were darkened for. */
  if (veil) {
    tl.fromTo(veil, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.14 }, 0.72);
  }

  /* And the sentence arrives before the last tiles have gone. */
  if (revealText && revealLines.length) {
    tl.call(() => revealText.setAttribute('aria-hidden', 'false'), undefined, 0.82);
    tl.set(revealText, { autoAlpha: 1 }, 0.82);
    tl.fromTo(
      revealLines,
      { autoAlpha: 0, y: 26, filter: 'blur(14px)' },
      { autoAlpha: 1, y: 0, filter: 'blur(0px)', ease: 'power2.out', duration: 0.16, stagger: 0.04 },
      0.84,
    );
  }

  /* Nothing here for the way out.

     The black used to be a tween on a trigger of its own. It is a panel
     stacked below the locked screen now (see .hero__fall) — always present,
     never animated — so the way out is the page scrolling, which needs no
     help. One less trigger, and one less thing that can be measured against
     the wrong element: hung on the hero, which is pinned and therefore never
     moves, that trigger fired on the pin's first frame and drew the black
     before the reveal had begun. */

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
  };
}

export function initHero(): () => void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return () => {};

  /* The film carries two cuts — landscape, and a portrait one for phones —
     chosen by `media` on their <source> elements. Keeping that choice honest
     across a resize is initVideoSources' job now, which any video marked
     `data-video-sources` opts into: this one, and the Nerd Apply chapter's.

     It used to live here, for this video alone. The second film needed the
     same subtlety, and two copies of something this easy to get wrong is how
     the two drift apart. Nothing about it was hero-specific, and it has to run
     whether or not motion is reduced — which is also why it did not belong
     above the return below. */

  // Reduced motion: the CSS already renders the resolved end state, and the
  // scene stays in normal flow because we never set data-scene-mode.
  if (prefersReducedMotion()) return () => {};

  const title = hero.querySelector<HTMLElement>('[data-hero-title]');
  const base = hero.querySelector<HTMLElement>('[data-hero-base]');
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]');
  const zoom = hero.querySelector<HTMLElement>('[data-hero-zoom]');
  const asideItems = gsap.utils.toArray<HTMLElement>('[data-hero-aside-item]', hero);
  const media = hero.querySelector<HTMLImageElement>('[data-hero-media]');
  const heroPixels = hero.querySelector<HTMLElement>('[data-hero-pixels]');
  const revealText = hero.querySelector<HTMLElement>('[data-hero-reveal]');
  const revealLines = gsap.utils.toArray<HTMLElement>('[data-hero-reveal-line]', hero);
  const veil = hero.querySelector<HTMLElement>('[data-hero-veil]');
  const fall = hero.querySelector<HTMLElement>('[data-hero-fall]');
  /* The section the hero hands over to. The black is timed against this
     arriving rather than against the hero leaving — see the exit below. */
  const after = document.querySelector<HTMLElement>('[data-project="overclock"]');

  /* The hero's own tile field, kept across rebuilds so a resize can replace it
     without stacking a second one on the timeline. */
  let heroFieldCols = 0;
  let heroFieldRows = 0;
  let heroFieldOff: gsap.core.Tween | null = null;
  const rules = gsap.utils.toArray<HTMLElement>('.hero__list-rule', hero);
  const textCols = gsap.utils.toArray<HTMLElement>(
    '.hero__col--text',
    hero,
  );

  let split: SplitText | null = null;
  const cleanups: Array<() => void> = [];

  // --- Intro --------------------------------------------------------------
  const tl = gsap.timeline({
    defaults: { ease: 'expo.out' },
    // Held until fonts resolve, so SplitText measures real line breaks.
    paused: true,
  });

  /* The artwork has no intro of its own any more.

     It used to open from its own floor: a `clip-path` tween on .hero__base
     from `inset(100% 0 0 0)` to nothing. That belonged to a hero whose artwork
     was full-bleed at rest and had a shape to arrive in. The resting frame is
     now cut out of the tile field, and the field is what the reader watches
     come and go — so an opening clip here would be a second, competing idea
     about how the picture arrives. The field's own build is the arrival. */

  if (title) {
    split = SplitText.create(title, { type: 'lines', mask: 'lines' });
    gsap.set(title, { opacity: 1 });
    tl.from(split.lines, { yPercent: 115, duration: 1.15, stagger: 0.09 }, 0.15);
  }

  if (asideItems.length) {
    tl.to(asideItems, { opacity: 1, duration: 0.9, stagger: 0.07 }, 0.5).from(
      asideItems,
      { y: 22, duration: 0.9, stagger: 0.07 },
      0.5,
    );
  }

  if (rules.length) {
    tl.to(rules, { scaleX: 1, duration: 1, stagger: 0.07 }, 0.6);
  }

  const start = () => tl.play();
  if (document.fonts?.status === 'loaded') start();
  else document.fonts?.ready.then(start).catch(start);

  /* The stepped scene is gone.

     What stood here was a pinned, gesture-stepped sequence: one scroll moved
     the page from the hero to Overclock and another from Overclock to Our
     work, each handed over behind a field of scattered tiles, with the wheel
     and touch swallowed so a gesture could only ever be worth exactly one
     chapter. About twelve hundred lines of it — the timeline, the stepper, the
     cooldown, the swallow, the re-entry, two tile fields and the chapter
     marker's thresholds.

     It is all out, and deliberately: a step is a cut the reader triggers, and
     what this page wants is movement the reader drives. The hero has its own
     pinned scrub (initHeroReveal above) and Overclock has its own
     (src/scripts/overclock.ts); neither swallows a gesture, both can be
     scrubbed backwards, and the sections between them are ordinary scrolling
     page. Nothing here is left to co-ordinate them, because there is nothing
     left to co-ordinate. */


  // --- Hover zoom -----------------------------------------------------------
  // On .hero__zoom, not .hero__stage: the scroll handover already scales
  // stage, and a second tween fighting over the same property on the same
  // target would flicker between the two. This is a different element, so
  // there is nothing to fight — the browser composes the two transforms
  // (stage's scroll-scale × zoom's hover-scale) automatically.
  if (zoom && stage && !isTouch()) {
    const hoverTo = gsap.quickTo(zoom, 'scale', { duration: 0.6, ease: 'power3.out' });
    const controller = new AbortController();

    stage.addEventListener('pointerenter', () => hoverTo(1.06), {
      signal: controller.signal,
    });
    stage.addEventListener('pointerleave', () => hoverTo(1), { signal: controller.signal });

    cleanups.push(() => controller.abort());
  }

  // --- Pointer parallax ---------------------------------------------------
  /* Only while the artwork is a framed picture on a page. Once the reveal has
     taken it to full bleed the drift is switched off and run back to zero —
     see `data-hero-settled`, set in initHeroReveal. A few pixels of drift is
     movement under a picture with a margin around it; under a picture that
     already reaches every edge it is the photograph coming away from them. */
  if (stage && !isTouch()) {
    const xTo = gsap.quickTo(stage, 'x', { duration: 1, ease: 'power3' });
    const yTo = gsap.quickTo(stage, 'y', { duration: 1, ease: 'power3' });
    const AMOUNT = 24;
    const controller = new AbortController();

    hero.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        /* Settled: the picture is the screen, so the drift is off and run back
           to nothing. Sent every move rather than once on the edge — the
           attribute can be set while the pointer is still, and a drift left
           parked at its last offset is the same fault as one still moving. */
        if (hero.hasAttribute('data-hero-settled')) {
          xTo(0);
          yTo(0);
          return;
        }
        const { width, height, left, top } = hero.getBoundingClientRect();
        xTo(((e.clientX - left) / width - 0.5) * -AMOUNT);
        yTo(((e.clientY - top) / height - 0.5) * -AMOUNT * 0.6);
      },
      { signal: controller.signal, passive: true },
    );

    hero.addEventListener(
      'pointerleave',
      () => {
        xTo(0);
        yTo(0);
      },
      { signal: controller.signal },
    );

    cleanups.push(() => controller.abort());
  }

  /* The hero's own reveal — pinned and scrubbed, and nothing to do with the
     stepped scene below it. Built last so it measures a hero the intro has
     already laid out. */
  const stopReveal = initHeroReveal(hero);

  return () => {
    stopReveal();
    tl.kill();
    split?.revert();
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
