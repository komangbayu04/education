import { gsap, ScrollTrigger, SplitText } from './gsap';
import { setActiveChapter } from './timeline';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Hero motion.
 *
 * Intro    — photo clips open from the bottom, headline lines unmask, aside
 *            rows fade up and their rules draw in.
 * Handover — the scene pins once (so nothing in it ever scrolls away on its
 *            own) for every transition across all five sections, all sharing
 *            that one pin:
 *
 *              A. hero → Showcase        THE bespoke transition: pixel reveal
 *                                         spreading from the hero photo,
 *                                         photo pushes in, Showcase crossfades
 *                                         in late underneath the tiles. Kept
 *                                         exactly as originally tuned.
 *                 Showcase's own text     rises into view near the end of A —
 *                                         same "enters from below" language
 *                                         every later section's text also
 *                                         uses (added on request; it didn't
 *                                         have its own entrance before).
 *              B. Showcase's text leaves  translates up + fades, in place —
 *                                         the device image never moves.
 *              Then Overclock, Bedford and CELPIP each repeat the same two
 *              beats — deliberately NOT phase A's mechanic (explicit
 *              direction: no zoom, no pixels, just opacity):
 *                arrival   plain opacity crossfade (0 → 1, no scale
 *                          anywhere), that section's own text rising into
 *                          view partway through
 *                exit      that section's text scrolls up and fades, in
 *                          place (skipped for CELPIP — it's currently last,
 *                          nothing to hand off to)
 *              Settle — nothing animates; just scroll room to rest on the
 *              finished page before the pin (and the document) ends.
 *
 *            Chapter marker: 4 slots, NOT 5 — hero and Showcase share slot 1
 *            (an earlier explicit direction), so slot 2 = Overclock, slot 3 =
 *            Bedford, slot 4 = CELPIP. See Timeline.astro's docstring for why
 *            this doesn't line up 1:1 with each section's own
 *            `data-chapter-section` index. Switching slots requires an
 *            `onUpdate` threshold check (not a single onLeave/onEnterBack)
 *            because there are now three *internal* transition points inside
 *            one continuous pin, not just one pin boundary — `setActiveChapter`
 *            no-ops once already on the target slot, so re-evaluating this on
 *            every scroll tick is cheap.
 *
 *            Every phase length is in viewports (`VIEWPORTS` below); the pin
 *            is their sum, and every tween's position is a fraction of that
 *            total (computed once into `at`/`dur` — see `cursor()`). Phase
 *            A's own internal tuning (0–82% pixels in, 0–35% type fade, etc.)
 *            is unchanged from when the pin was exactly one viewport — it's
 *            rescaled by `at.a` so phase A still finishes at the same
 *            absolute scroll distance it always did; everything after it is
 *            genuinely new scroll runway, not a retiming of anything.
 *
 *            Only transform and opacity are touched, so nothing re-lays-out
 *            and nothing can jump.
 * Mobile   — below the pin gate (<1200px) there is no pin and no handover, but
 *            the hero still gets its own small scroll-tied zoom (scale
 *            1 → 1.08) as it scrolls past, tied to how much of the hero has
 *            scrolled rather than a fixed distance.
 * Hover    — the photo zooms slightly (scale 1 → 1.06) on a nested wrapper
 *            independent of the scroll-driven scale, so the two tweens never
 *            compete over the same property on the same element.
 * Pointer  — the stage drifts on mouse move.
 *
 * Returns a cleanup function.
 */
export function initHero(): () => void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return () => {};

  // Reduced motion: the CSS already renders the resolved end state, and the
  // scene stays in normal flow because we never set data-scene-mode.
  if (prefersReducedMotion()) return () => {};

  const title = hero.querySelector<HTMLElement>('[data-hero-title]');
  const base = hero.querySelector<HTMLElement>('[data-hero-base]');
  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]');
  const zoom = hero.querySelector<HTMLElement>('[data-hero-zoom]');
  const asideItems = gsap.utils.toArray<HTMLElement>('[data-hero-aside-item]', hero);
  const rules = gsap.utils.toArray<HTMLElement>('.hero__list-rule', hero);
  const textCols = gsap.utils.toArray<HTMLElement>(
    '.hero__col--title, .hero__col--aside',
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

  if (base) {
    tl.fromTo(
      base,
      { clipPath: 'inset(100% 0 0 0)' },
      { clipPath: 'inset(0% 0 0 0)', duration: 1.4, ease: 'power3.inOut' },
      0,
    );
  }

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

  // --- Handover across all five sections ------------------------------------
  const scene = document.querySelector<HTMLElement>('[data-scene]');
  const next = scene?.querySelector<HTMLElement>('[data-scene-next]');
  const overclockLayer = scene?.querySelector<HTMLElement>('[data-scene-overclock]');
  const bedfordLayer = scene?.querySelector<HTMLElement>('[data-scene-bedford]');
  const celpipLayer = scene?.querySelector<HTMLElement>('[data-scene-celpip]');

  const pixels = scene?.querySelector<HTMLElement>('[data-scene-pixels]');
  const showcase = next?.querySelector<HTMLElement>('.showcase');

  if (scene && next && overclockLayer && bedfordLayer && celpipLayer && stage) {
    // Desktop only. Below this the hero is content-height rather than exactly
    // one viewport, so stacking the layers into a viewport-tall pinned scene
    // would clip it. matchMedia tears the whole thing down when it stops
    // matching and rebuilds it when it matches again.
    const mm = gsap.matchMedia();

    mm.add('(min-width: 1200px)', () => {
      // Switches the layers to absolute stacking. Set from JS so the no-JS and
      // reduced-motion paths keep the sections in normal document flow.
      scene.dataset.sceneMode = 'pinned';

      // Every phase's length, in viewports, in playback order. Kept as one
      // flat list (rather than named constants per phase) specifically so
      // adding a 6th section later is "add two more numbers here", not a
      // rewrite of the fraction math below.
      const VIEWPORTS = {
        heroToShowcase: 1, // phase A — unchanged absolute timing
        // The three *Dwell phases used to carry that chapter's text sliding
        // up and out. With the copy no longer moving they schedule nothing;
        // they are the scroll a finished chapter holds the screen for before
        // the next one swaps in. Kept at their old lengths so the pin — and
        // the document — is exactly as long as it was.
        showcaseDwell: 0.6,
        overclockArrival: 0.5,
        overclockDwell: 0.5,
        bedfordArrival: 0.5,
        bedfordDwell: 0.5,
        celpipArrival: 0.5,
        settle: 1,
      } as const;

      const PIN_VIEWPORTS = Object.values(VIEWPORTS).reduce((a, b) => a + b, 0);

      // Running cursor over the list above, converting "N viewports long" into
      // "starts at fraction X of the whole pin" as it goes.
      let cursor = 0;
      const at = (viewports: number) => {
        const start = cursor / PIN_VIEWPORTS;
        cursor += viewports;
        return start;
      };

      // The dwell phases are advanced through, not stored: nothing is
      // scheduled in them, but the cursor still has to walk past them so every
      // later phase keeps its position.
      const atHeroToShowcase = at(VIEWPORTS.heroToShowcase);
      at(VIEWPORTS.showcaseDwell);
      const atOverclockArrival = at(VIEWPORTS.overclockArrival);
      at(VIEWPORTS.overclockDwell);
      const atBedfordArrival = at(VIEWPORTS.bedfordArrival);
      at(VIEWPORTS.bedfordDwell);
      const atCelpipArrival = at(VIEWPORTS.celpipArrival);
      // cursor is now at the start of "settle", i.e. 1 - VIEWPORTS.settle/PIN_VIEWPORTS

      const durHeroToShowcase = VIEWPORTS.heroToShowcase / PIN_VIEWPORTS;
      const durOverclockArrival = VIEWPORTS.overclockArrival / PIN_VIEWPORTS;
      const durBedfordArrival = VIEWPORTS.bedfordArrival / PIN_VIEWPORTS;
      const durCelpipArrival = VIEWPORTS.celpipArrival / PIN_VIEWPORTS;

      // Slot switches once each arrival's crossfade is complete — see the
      // docstring for why this is 4 slots covering 5 sections, and why an
      // onUpdate threshold sweep replaces the old onLeave/onEnterBack (there
      // are 3 internal transition points now, not 1 pin boundary).
      const slotThresholds: Array<[number, number]> = [
        [atOverclockArrival + durOverclockArrival, 2],
        [atBedfordArrival + durBedfordArrival, 3],
        [atCelpipArrival + durCelpipArrival, 4],
      ];

      const handover = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: scene,
          start: 'top top',
          end: () => `+=${window.innerHeight * PIN_VIEWPORTS}`,
          pin: true,
          anticipatePin: 1,
          /* 0.3, not 1. Lenis already eases the scroll position itself (see
             scroll.ts, duration 1.2), so a second full second of catch-up here
             put two smoothing stages in series: measured, the scene took just
             over a second to finish reacting to a single flick, which reads as
             lag rather than smoothness. This keeps a little smoothing of its
             own without re-damping what Lenis has already damped. */
          scrub: 0.3,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            let slot = 1;
            for (const [threshold, num] of slotThresholds) {
              if (self.progress >= threshold) slot = num;
            }
            setActiveChapter(slot, true);
          },
        },
      });

      // --- Phase A: hero → Showcase, the bespoke pixel reveal ------------------
      handover.to(
        textCols,
        { opacity: 0, y: -40, ease: 'power1.in', duration: durHeroToShowcase * 0.35 },
        atHeroToShowcase,
      );

      if (pixels) {
        // Tile size tied to the hero photo's own baked squares (roughly an
        // eighth of its width), spreading outward from its centre.
        const size = Math.max(36, Math.round(stage.getBoundingClientRect().width / 8));
        // +2 on each axis for the one-tile overspill the CSS insets rely on
        const cols = Math.ceil(window.innerWidth / size) + 2;
        const rows = Math.ceil(window.innerHeight / size) + 2;

        pixels.style.setProperty('--px-size', `${size}px`);
        pixels.style.setProperty('--px-cols', String(cols));

        const frag = document.createDocumentFragment();
        for (let i = 0; i < cols * rows; i++) {
          const tile = document.createElement('span');
          tile.className = 'scene__pixel';
          frag.appendChild(tile);
        }
        pixels.replaceChildren(frag);

        const c = pixels.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        const col = Math.floor((s.left + s.width / 2 - c.left) / size);
        const row = Math.floor((s.top + s.height / 2 - c.top) / size);
        const from = Math.min(cols * rows - 1, Math.max(0, row * cols + col));
        const tiles = Array.from(pixels.children) as HTMLElement[];

        // Each tile pops in over a short window of its own; the stagger
        // spreads those windows across the phase, so they arrive one by one
        // and the field is complete by ~82% of the way through it.
        handover.fromTo(
          tiles,
          { scale: 0.55, opacity: 0 },
          {
            // Slightly over 1 so neighbours overlap instead of meeting on a
            // fractional pixel boundary and letting the artwork behind show
            // through as a hairline.
            scale: 1.04,
            opacity: 1,
            duration: durHeroToShowcase * 0.22,
            ease: 'power2.out',
            stagger: { grid: [rows, cols], from, amount: durHeroToShowcase * 0.6 },
          },
          atHeroToShowcase,
        );
      }

      if (next) {
        // Onto the finished pixel field — same colour, so the swap is
        // invisible.
        handover.fromTo(
          next,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: durHeroToShowcase * 0.28 },
          atHeroToShowcase + durHeroToShowcase * 0.66,
        );

        // opacity 0 does not stop an element receiving clicks — see the CSS
        // comment on .scene__layer--next. Set once, never reset within this
        // phase, so Showcase stays clickable from here on.
        handover
          .set(next, { pointerEvents: 'none' }, atHeroToShowcase)
          .set(next, { pointerEvents: 'auto' }, atHeroToShowcase + durHeroToShowcase * 0.94);
      }

      // Eased in rather than linear so the zoom accelerates as the pixel field
      // closes over it. Ends at the end of phase A and holds at 1.22 for the
      // rest of the pin — the photo doesn't keep zooming once it's no longer
      // the thing in focus.
      handover.to(
        stage,
        { scale: 1.22, ease: 'power1.in', duration: durHeroToShowcase },
        atHeroToShowcase,
      );

      // Counter-zoom on the arriving section: it settles to 1 exactly as the
      // phase finishes, so the reveal has depth instead of being a flat wipe.
      if (showcase) {
        handover.fromTo(
          showcase,
          { scale: 1.06 },
          { scale: 1, duration: durHeroToShowcase },
          atHeroToShowcase,
        );
      }

      // Chapter text no longer travels (explicit direction: no scroll
      // animation on the copy). It belongs to its own layer, so the layer's
      // crossfade carries it in and out — the measuring helpers this used to
      // need (belowEdge / aboveEdge, and the GAP that kept a line from being
      // clipped mid-glyph) went with it.

      /**
       * Fraction of an arrival phase the image swap gets. The outgoing
       * section's layer never fades — the arriving one simply fades in on top
       * of it — so this fraction *is* the window where both are on screen at
       * once. At 1 (the whole phase, which is what this used to be) that was
       * half a viewport of scrolling with two device shots visibly stacked.
       * Short enough to read as a cut, not so short it strobes on a fast
       * scroll: the scrub is 1s, so this still resolves over a real moment.
       */
      const ARRIVAL_FADE = 0.18;

      /**
       * One plain-opacity arrival: `arriving` fades 0 → 1 over the opening
       * slice of the phase — the section handover itself stays a crossfade,
       * deliberately not phase A's mechanic and deliberately not a slide.
       * The whole layer swaps, copy included; nothing inside it moves on its
       * own any more.
       */
      const addArrival = (
        arriving: HTMLElement | null | undefined,
        start: number,
        duration: number,
      ) => {
        if (arriving) {
          const fade = duration * ARRIVAL_FADE;
          // autoAlpha, not opacity: it parks the layer at visibility:hidden
          // while it is transparent. These layers are full-viewport and
          // permanently promoted (will-change: opacity), so a merely
          // transparent one still costs a composited surface on every frame of
          // the scrub — four of them, for most of the pin.
          handover.fromTo(
            arriving,
            { autoAlpha: 0 },
            { autoAlpha: 1, ease: 'none', duration: fade },
            start,
          );
          // Tied to the swap, not to the end of the phase: the layer is fully
          // opaque from `start + fade` on, and an opaque layer that still
          // refuses clicks is a bug waiting to be filed.
          handover
            .set(arriving, { pointerEvents: 'none' }, start)
            .set(arriving, { pointerEvents: 'auto' }, start + fade);
        }
      };

      addArrival(overclockLayer, atOverclockArrival, durOverclockArrival);
      addArrival(bedfordLayer, atBedfordArrival, durBedfordArrival);

      // CELPIP is currently last — arrival only, no exit, nothing to hand off
      // to yet. The settle phase after it (implicit: nothing is scheduled
      // there) is what gives the finished page room to rest before the pin —
      // and the document — actually ends.
      addArrival(celpipLayer, atCelpipArrival, durCelpipArrival);

      // Runs when the query stops matching, and on mm.revert()
      return () => {
        pixels?.replaceChildren();
        delete scene.dataset.sceneMode;
      };
    });

    // Below the pin gate the hero scrolls normally with the rest of the page —
    // no pin, no pixel reveal, none of the handover mechanics above. It still
    // gets a small scroll-tied zoom of its own so the effect isn't desktop-only:
    // scaled to the hero scrolling past, not to a fixed scroll distance, so it
    // finishes at roughly the same point regardless of how tall the hero is at
    // that width.
    mm.add('(max-width: 1199px)', () => {
      const scrollZoom = gsap.fromTo(
        stage,
        { scale: 1 },
        {
          scale: 1.08,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        },
      );

      return () => {
        scrollZoom.scrollTrigger?.kill();
        scrollZoom.kill();
      };
    });

    cleanups.push(() => mm.revert());
  }

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
  if (stage && !isTouch()) {
    const xTo = gsap.quickTo(stage, 'x', { duration: 1, ease: 'power3' });
    const yTo = gsap.quickTo(stage, 'y', { duration: 1, ease: 'power3' });
    const AMOUNT = 24;
    const controller = new AbortController();

    hero.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
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

  return () => {
    tl.kill();
    split?.revert();
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
