import { gsap, ScrollTrigger, SplitText } from './gsap';
import { setActiveChapter } from './timeline';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Hero motion.
 *
 * Intro    — photo clips open from the bottom, headline lines unmask, aside
 *            rows fade up and their rules draw in.
 * Handover — the scene pins once (so nothing in it ever scrolls away on its
 *            own) for every transition across all three sections, all sharing
 *            that one pin:
 *
 *              A. hero → Showcase        THE bespoke transition: pixel reveal
 *                                         spreading from the hero photo,
 *                                         photo pushes in, Showcase crossfades
 *                                         in late underneath the tiles. Kept
 *                                         exactly as originally tuned.
 *              B. Showcase holds          nothing is scheduled; scroll room
 *                                         for a finished chapter.
 *              C. Showcase → Overclock    the same pixel language, scattered
 *                                         rather than spreading from a point:
 *                                         a field of tiles in Overclock's own
 *                                         ground colour lands in random order,
 *                                         then the layer swaps in behind the
 *                                         finished field, same colour, no seam.
 *              D. Overclock holds
 *              The pin ends there, on Overclock.
 *              E. Overclock → the page    the same field again, in the ground
 *                                         colour of the section below the
 *                                         scene — but on its own trigger,
 *                                         outside the pin, running across the
 *                                         viewport of scroll the scene takes
 *                                         to leave. Overclock dissolves as it
 *                                         goes, with Credibility already
 *                                         rising into view behind it.
 *
 *            Nothing is scheduled inside the pin after the last chapter, and
 *            nothing can be: a pinned scene cannot show the section under it,
 *            so any phase there is scroll that produces no movement.
 *
 *            Bedford and CELPIP were chapters here until their case studies
 *            were ready; see index.astro for what putting them back involves.
 *
 *            Chapter marker: 2 slots, NOT 3 — hero and Showcase share slot 1
 *            (an earlier explicit direction), so slot 2 = Overclock. See
 *            Timeline.astro's docstring for why this doesn't line up 1:1 with
 *            each section's own `data-chapter-section` index. Switching slots
 *            requires an `onUpdate` threshold check (not a single
 *            onLeave/onEnterBack) because the transition points are *internal*
 *            to one continuous pin, not pin boundaries — `setActiveChapter`
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

  const pixels = scene?.querySelector<HTMLElement>('[data-scene-pixels]');
  const showcase = next?.querySelector<HTMLElement>('.showcase');

  /* The zero-height marker sitting between the scene and the page (see
     index.astro). Queried by attribute, not as the scene's next sibling:
     pinning wraps the scene in a spacer, and from inside that wrapper it has
     no siblings — a sibling lookup returns null on any run where the pin
     already exists, and then the exit field gets built and never animated. */
  const afterScene = document.querySelector<HTMLElement>('[data-scene-after]');

  if (scene && next && overclockLayer && stage) {
    // Every width. This used to be desktop-only because the hero and Showcase
    // were content-height below 1200px and would have been clipped by a
    // viewport-tall pinned scene; both are one viewport at every width now
    // (see their own responsive blocks), so the handover runs on phones too.
    // matchMedia is kept for the teardown it gives on an orientation change.
    const mm = gsap.matchMedia();

    mm.add('(min-width: 1px)', () => {
      // Switches the layers to absolute stacking. Set from JS so the no-JS and
      // reduced-motion paths keep the sections in normal document flow.
      scene.dataset.sceneMode = 'pinned';

      /* Pulls everything below the scene up by exactly the scene's own height,
         so the section after it sits where the scene does rather than a screen
         further down. The pin's spacer is (scene height + pin distance), which
         is why the pin used to release onto a whole viewport of scene that
         still had to be scrolled past. With this, the pin ending and the next
         section being fully in frame are the same scroll position.

         JS-only, and paired with the scene being hidden at that moment — the
         two overlap in the document from here on, and only one may be seen. */
      afterScene?.setAttribute('data-scene-pulled', '');

      // Every phase's length, in viewports, in playback order. Kept as one
      // flat list (rather than named constants per phase) specifically so
      // adding a 6th section later is "add two more numbers here", not a
      // rewrite of the fraction math below.
      const VIEWPORTS = {
        heroToShowcase: 1, // phase A — unchanged absolute timing
        // The *Dwell phases used to carry that chapter's text sliding up and
        // out. With the copy no longer moving they schedule nothing; they are
        // the scroll a finished chapter holds the screen for before the next
        // one swaps in.
        showcaseDwell: 0.6,
        overclockArrival: 0.5,
        overclockDwell: 0.5,
        /* The way out, and it belongs in here: Overclock has to hold still
           while the field lands on it, the same way every other chapter does.
           Run outside the pin instead, the field scattered over a section that
           was already sliding away — two things moving at once.

           What used to make this phase unusable was the viewport of scroll
           that followed it: the scene is a full screen tall, so the pin
           releasing still left that screen — by then flat colour — to be
           scrolled past before anything new arrived. That viewport is gone
           now; the section below is pulled up over it (`data-scene-pulled`)
           and the scene is hidden the moment the pin lets go, so the field
           finishing and the next section being fully on screen are the same
           moment. */
        exitReveal: 0.5,
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
      const atExitReveal = at(VIEWPORTS.exitReveal);
      // cursor is now at the end of the pin: the exit reveal is the last phase

      const durHeroToShowcase = VIEWPORTS.heroToShowcase / PIN_VIEWPORTS;
      const durOverclockArrival = VIEWPORTS.overclockArrival / PIN_VIEWPORTS;
      const durExitReveal = VIEWPORTS.exitReveal / PIN_VIEWPORTS;

      /**
       * Fraction of an arrival phase the image swap gets. The outgoing
       * section's layer never fades — the arriving one simply fades in on top
       * of it — so this fraction *is* the window where both are on screen at
       * once. At 1 (the whole phase, which is what this used to be) that was
       * half a viewport of scrolling with two device shots visibly stacked.
       * Short enough to read as a cut, not so short it strobes on a fast
       * scroll: the scrub still resolves it over a real moment.
       */
      const ARRIVAL_FADE = 0.18;

      /** Where the tile field has finished and the chapter behind it is the
       *  thing on screen: the 0.72 scatter, plus one tile's own 0.14 pop, plus
       *  the 0.08 swap. Shared with the marker so it turns over then. */
      const REVEAL_DONE = 0.94;

      // Slot switches the moment its chapter finishes fading in — the marker
      // names the section on screen, so it turns over with the artwork, not at
      // the end of the phase the artwork arrived in. See the docstring for why
      // this is 4 slots covering 5 sections.
      const slotThresholds: Array<[number, number]> = [
        [atOverclockArrival + durOverclockArrival * REVEAL_DONE, 2],
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
          /* The scene has nothing left to show once the exit field has covered
             it, and it is a full screen tall — so it is hidden the instant the
             pin lets go, and the section pulled up underneath it (see
             `data-scene-pulled`) is what the scroll continues on. The field
             was already painted in that section's own colour, so there is
             nothing to see in the swap. */
          onLeave: () => scene.setAttribute('data-scene-done', ''),
          onEnterBack: () => scene.removeAttribute('data-scene-done'),
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
       * One plain-opacity arrival: `arriving` fades 0 → 1 over the opening
       * slice of the phase — the section handover itself stays a crossfade,
       * deliberately not phase A's mechanic and deliberately not a slide.
       * The whole layer swaps, copy included; nothing inside it moves on its
       * own any more.
       */
      /**
       * Lays a field of square tiles in the arriving chapter's own ground
       * colour, in random order, across the front of its phase — then the
       * chapter itself swaps in behind the finished field, same colour, no
       * visible seam. The same pixel language as the hero handover; scattered
       * rather than spreading from a point, so it reads as a different beat.
       *
       * Built here rather than in markup because the count depends on the
       * viewport, and rebuilt on every matchMedia pass for the same reason.
       */
      const addTileReveal = (
        key: string,
        start: number,
        duration: number,
        tl: gsap.core.Timeline = handover,
      ) => {
        const grid = scene.querySelector<HTMLElement>(`[data-scene-grid="${key}"]`);
        if (!grid) return 0;

        const size = Math.max(40, Math.round(window.innerWidth / 14));
        // +2 on each axis for the one-tile overspill the CSS insets rely on
        const cols = Math.ceil(window.innerWidth / size) + 2;
        const rows = Math.ceil(window.innerHeight / size) + 2;
        grid.style.setProperty('--px-size', `${size}px`);
        grid.style.setProperty('--px-cols', String(cols));

        const frag = document.createDocumentFragment();
        for (let i = 0; i < cols * rows; i++) frag.appendChild(document.createElement('span'));
        grid.replaceChildren(frag);

        // 0.72 of the phase for the scatter, leaving the rest for the layer to
        // take over — the swap has to land while the field still covers
        // everything, or the outgoing chapter flashes back through.
        const spread = duration * 0.72;
        tl.fromTo(
          Array.from(grid.children) as HTMLElement[],
          { scale: 0.55, autoAlpha: 0 },
          {
            // Slightly over 1 so neighbours overlap instead of meeting on a
            // fractional pixel boundary and letting the old chapter show
            // through as a hairline.
            scale: 1.04,
            autoAlpha: 1,
            duration: duration * 0.14,
            ease: 'power2.out',
            stagger: { grid: [rows, cols], from: 'random', amount: spread },
          },
          start,
        );

        return spread;
      };

      const addArrival = (
        arriving: HTMLElement | null | undefined,
        start: number,
        duration: number,
        gridKey?: string,
      ) => {
        if (arriving) {
          // With a tile field in front, the layer swaps once the field has
          // finished covering the screen; without one it is a plain crossfade.
          const spread = gridKey ? addTileReveal(gridKey, start, duration) : 0;
          const swapAt = spread ? start + spread + duration * 0.14 : start;
          const fade = spread ? duration * 0.08 : duration * ARRIVAL_FADE;
          // autoAlpha, not opacity: it parks the layer at visibility:hidden
          // while it is transparent. These layers are full-viewport and
          // permanently promoted (will-change: opacity), so a merely
          // transparent one still costs a composited surface on every frame of
          // the scrub — four of them, for most of the pin.
          handover.fromTo(
            arriving,
            { autoAlpha: 0 },
            { autoAlpha: 1, ease: 'none', duration: fade },
            swapAt,
          );
          // Tied to the swap, not to the end of the phase: the layer is fully
          // opaque from `start + fade` on, and an opaque layer that still
          // refuses clicks is a bug waiting to be filed.
          handover
            .set(arriving, { pointerEvents: 'none' }, start)
            .set(arriving, { pointerEvents: 'auto' }, swapAt + fade);
        }
      };

      addArrival(overclockLayer, atOverclockArrival, durOverclockArrival, 'overclock');

      /* --- The way out ------------------------------------------------------
         Same mechanic as the way between chapters, and in the same timeline:
         Overclock holds still while the field lands on it, exactly as every
         chapter before it did. Run on a trigger of its own, outside the pin,
         the field scattered over a section that was already sliding out of
         frame — the section moving and the effect playing at once.

         No `addArrival`: the field is not covering for a layer about to swap
         in. It is the last thing the scene paints, and once it has, the pin is
         over and the scene is hidden — see the trigger's onLeave, and the pull
         that puts the next section exactly where the scene was. */
      addTileReveal('exit', atExitReveal, durExitReveal);

      /** Where in the exit phase the scene starts giving way to what is under
       *  it. Just past halfway: late enough that the field reads as a field
       *  first, early enough that the next section is arriving well before the
       *  pin lets go rather than at the instant it does. */
      const EXIT_DISSOLVE_AT = 0.55;

      /* And then the scene itself goes. The field alone only got as far as a
         screen of flat colour: the next section was already in position
         underneath, and nothing let it through until the pin released. Fading
         the scene out is what lets it through — the tiles dissolve along with
         everything they were covering, and what is behind them is the section
         that was there all along.

         Started once the scatter is essentially done, so the two read as one
         movement: Overclock breaks up into tiles, the tiles thin out, the next
         section is what is left. It is scrubbed like everything else here, so
         scrolling back up brings the scene straight back. */
      handover.to(
        scene,
        {
          autoAlpha: 0,
          ease: 'none',
          duration: durExitReveal * (1 - EXIT_DISSOLVE_AT),
        },
        atExitReveal + durExitReveal * EXIT_DISSOLVE_AT,
      );

      /**
       * Pins the timeline's own duration to exactly 1.
       *
       * Every position above is written as a fraction of the pin, but GSAP
       * reads them as seconds and the scrub maps the pin's progress onto
       * `0..duration`. The last tween ends well short of 1 — Overclock's dwell
       * schedules nothing — so without this the timeline would end at its last
       * tween and every position would be silently stretched to fill the pin.
       * That is what once put the chapter marker a whole slot ahead of the
       * artwork: the marker reads the scroll directly, the layers were
       * arriving 38% later than the numbers said.
       *
       * An empty `set` at 1 costs nothing and makes the two scales the same.
       */
      handover.set({}, {}, 1);

      // Runs when the query stops matching, and on mm.revert()
      return () => {
        pixels?.replaceChildren();
        delete scene.dataset.sceneMode;
        scene.removeAttribute('data-scene-done');
        afterScene?.removeAttribute('data-scene-pulled');
      };
    });

    // Below the pin gate the hero scrolls normally with the rest of the page —
    // no pin, no pixel reveal, none of the handover mechanics above. It still
    // gets a small scroll-tied zoom of its own so the effect isn't desktop-only:
    // scaled to the hero scrolling past, not to a fixed scroll distance, so it
    // finishes at roughly the same point regardless of how tall the hero is at
    // that width.
    // (The <1200px branch that used to live here — a small scroll-tied zoom
    // standing in for the handover — is gone: the handover itself runs at
    // those widths now, and the two would have fought over the same element.)

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
