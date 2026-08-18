import { gsap, ScrollTrigger, SplitText } from './gsap';
import { setActiveChapter } from './timeline';
import { getLenis } from './scroll';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Hero motion.
 *
 * Intro    — the video clips open from the bottom, headline lines unmask, aside
 *            rows fade up and their rules draw in.
 * Handover — the scene pins once (so nothing in it ever scrolls away on its
 *            own) and every transition across all three sections happens
 *            inside that one pin, one scroll at a time:
 *
 *              A. hero → Showcase        THE bespoke transition: pixel reveal
 *                                         spreading from the hero photo,
 *                                         photo pushes in, Showcase crossfades
 *                                         in late underneath the tiles.
 *              B. Showcase → Overclock    the same pixel language, scattered
 *                                         rather than spreading from a point:
 *                                         a field of tiles in Overclock's own
 *                                         ground colour lands in random order,
 *                                         then the layer swaps in behind the
 *                                         finished field, same colour, no seam.
 *              C. Overclock → the page    the same field again, in the ground
 *                                         colour of the section below the
 *                                         scene. The pin ends as it finishes,
 *                                         and the scene is hidden in the same
 *                                         frame — the field is already that
 *                                         section's colour, so there is no
 *                                         seam to see.
 *
 *            One scroll plays one of those end to end and lands on the chapter
 *            after it; anything that arrives while one is playing is swallowed.
 *            See "Stepping" below for why it is not scrubbed, and what the
 *            scroll position is still for.
 *
 *            The chapters used to have a dwell phase each — scroll room a
 *            finished chapter held the screen for. A stepped scene has no use
 *            for one: a chapter holds until the next scroll, however long that
 *            is. They are gone, and the three phases above are one viewport
 *            each.
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
        heroToShowcase: 1,
        /* The *Dwell phases are gone. They were the scroll a finished chapter
           held the screen for before the next one swapped in, which is a thing
           only a scrubbed scene needs: with the handover stepped rather than
           scrubbed (see "Stepping" below) a chapter holds the screen until the
           next scroll, however long that is, and a stretch of scroll that
           schedules nothing is just distance to get through.

           One viewport each now, and equal, so each step owns exactly one
           screen of the pin and the scroll position and the step index stay in
           step with each other without any arithmetic. */
        overclockArrival: 1,
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
        exitReveal: 1,
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

      const atHeroToShowcase = at(VIEWPORTS.heroToShowcase);
      const atOverclockArrival = at(VIEWPORTS.overclockArrival);
      const atExitReveal = at(VIEWPORTS.exitReveal);
      // cursor is now at the end of the pin: the exit reveal is the last phase

      /** Rest points, one per phase boundary — 0, 1/3, 2/3, 1. Step 0 is the
       *  hero, 1 is Nerd Apply, 2 is Overclock, 3 is the finished exit field,
       *  which is also the end of the pin. */
      const STEPS = Object.keys(VIEWPORTS).length;

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

      /* Whether the scene is spent, as one function rather than a pair of edge
         callbacks — so every route to that state agrees, and any of them can
         set it in either direction.

         Landing the timeline by hand before hiding the scene is the ordering
         that matters here. The field being hidden is driven by the scrub,
         which lags the scroll by 0.3s; a flick crosses the end while the
         timeline is still catching up, and the scene was being hidden with the
         field part-laid and the next section coming up through the gaps.
         Measured mid-flick: the scroll at the pin's end, the timeline still at
         0.86, one tile of 276 down. `progress(1)` finishes it in the same
         frame, so what is on screen when the scene goes is the completed field
         — the next section's own ground colour, and therefore nothing to look
         at. The scrub still owns the value either side of this; it is only
         being told where it was always heading. */
      /* Declared before it is built, and read defensively below, because the
         trigger refreshes as it is created — so `onRefresh` calls this once
         while the timeline it names is still being constructed. `let` with no
         initialiser gives a binding that reads as undefined at that moment; a
         `const` here would be in its temporal dead zone and throw. */
      let handover: gsap.core.Timeline | undefined;

      const setSceneDone = (done: boolean) => {
        if (done) {
          handover?.progress(1);
          scene.setAttribute('data-scene-done', '');
        } else {
          scene.removeAttribute('data-scene-done');
        }
      };

      /* Paused, and deliberately not handed to the trigger.
         A timeline passed as a ScrollTrigger's `animation` without a `scrub`
         is a timeline the trigger owns: it gets the default toggleActions and
         is played on enter, start to finish, at its own speed. That is not a
         detail to work around — it means the playhead has two authors. It was
         measured doing exactly that: `paused: false`, `toggleActions: "play"`,
         sitting at progress 1 with the exit field fully laid while the step
         tweens tried to put it back. Built standalone instead, so the only
         thing that ever moves it is `goToStep`. */
      handover = gsap.timeline({ defaults: { ease: 'none' }, paused: true });

      const st = ScrollTrigger.create({
          trigger: scene,
          start: 'top top',
          end: () => `+=${window.innerHeight * PIN_VIEWPORTS}`,
          pin: true,
          anticipatePin: 1,
          /* No scrub. The handover is not tied to the scroll position any
             more — one scroll plays one whole chapter change at its own speed,
             and the trigger's job is reduced to holding the scene still,
             telling us when it is the thing on screen, and keeping the scroll
             position honest either side of it. See "Stepping" below. */
          invalidateOnRefresh: true,
          /* The scene has nothing left to show once the exit field has covered
             it, and it is a full screen tall — so it is hidden the instant the
             pin lets go, and the section pulled up underneath it (see
             `data-scene-pulled`) is what the scroll continues on. The field
             was already painted in that section's own colour, so there is
             nothing to see in the swap. */
          /* The timeline is landed by hand before the scene is hidden, and
             that ordering is the whole point.

             This callback fires on the scroll crossing the pin's end. The
             field it is hiding, though, is driven by the scrub — which lags
             the scroll by 0.3s. A flick, which is how a phone is scrolled,
             crosses the end while the timeline is still catching up, so the
             scene was being hidden with the field part-laid and the next
             section came up through the gaps. Measured mid-flick: the scroll
             was at the pin's end with the timeline still at 0.86 and one tile
             of 276 down.

             `progress(1)` finishes the handover in the same frame, so whatever
             is on screen at the moment the scene goes is the completed field —
             which is the next section's own ground colour, and therefore no
             transition at all to look at. The scrub still owns the value
             either side of this; it is only being told where it was always
             heading. */
          onLeave: () => setSceneDone(true),
          onEnterBack: () => setSceneDone(false),
          /* And the same state re-derived whenever the trigger re-measures,
             which is the case the two callbacks above cannot cover.

             They fire on the scroll crossing the pin's end. A resize crosses
             nothing: `invalidateOnRefresh` recomputes start and end — both are
             viewport multiples, so a narrower or shorter window moves the end
             a long way — while the scroll position stays exactly where it was.
             Drag a window while parked just above the join and the end can
             land above the current scroll: past the end, with `onLeave` never
             having fired. The scene is then never marked done, so it stays
             painted, in flow, with the section that is pulled up over it
             showing through — both at once, and stuck that way until a reload,
             because nothing else will ever set the attribute.

             Asking the trigger where it actually is costs nothing and cannot
             go stale, which a latch set only at the edges always can. */
          onRefresh: (self) => setSceneDone(self.progress >= 1),
          onUpdate: (self) => {
            let slot = 1;
            for (const [threshold, num] of slotThresholds) {
              if (self.progress >= threshold) slot = num;
            }
            setActiveChapter(slot, true);
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
      /* Every field built above, and how to build it again. The viewport is an
         input to the count, and the viewport changes after the build: rotating
         a phone, dragging a window, or — the common one — a mobile browser
         hiding its URL bar, which is worth 80-odd pixels of height without any
         event a layout would normally care about.

         Nothing re-ran this, so the field stayed the size it was born at.
         Measured: after an 88px height change the exit field stopped 19px
         short of the bottom of the screen, and that strip is Overclock, read
         straight through while the scene dissolves over the section below —
         two chapters at once, which is the one thing the handover exists to
         prevent. A rotation, or any larger change, uncovers proportionally
         more: at 1280 wide with a field built for 375 it covered 43%. */
      const tileFields: Array<() => void> = [];

      const addTileReveal = (
        key: string,
        start: number,
        duration: number,
        tl: gsap.core.Timeline = handover,
      ) => {
        const grid = scene.querySelector<HTMLElement>(`[data-scene-grid="${key}"]`);
        if (!grid) return 0;

        // 0.72 of the phase for the scatter, leaving the rest for the layer to
        // take over — the swap has to land while the field still covers
        // everything, or the outgoing chapter flashes back through.
        const spread = duration * 0.72;
        let tween: gsap.core.Tween | null = null;
        let builtCols = 0;
        let builtRows = 0;

        const build = () => {
          const size = Math.max(40, Math.round(window.innerWidth / 14));
          // +2 on each axis for the one-tile overspill the CSS insets rely on
          const cols = Math.ceil(window.innerWidth / size) + 2;
          const rows = Math.ceil(window.innerHeight / size) + 2;
          // Refreshes are frequent — every accordion click below calls one —
          // and almost none of them change the viewport. Rebuilding a few
          // hundred spans on each would be work for nothing.
          if (cols === builtCols && rows === builtRows) return;
          builtCols = cols;
          builtRows = rows;

          grid.style.setProperty('--px-size', `${size}px`);
          grid.style.setProperty('--px-cols', String(cols));

          const frag = document.createDocumentFragment();
          for (let i = 0; i < cols * rows; i++) frag.appendChild(document.createElement('span'));
          grid.replaceChildren(frag);

          // The old tween still points at spans that are no longer in the
          // document, so it goes with them.
          tween?.kill();
          tween = gsap.fromTo(
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
          );
          /* Absolute position, so a rebuild lands the field in exactly the
             phase it was scheduled for. Added in the same call stack that
             created it, so it is re-parented off the global timeline before a
             tick can render it there. */
          tl.add(tween, start);
        };

        build();
        tileFields.push(build);
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

      /** Where in the exit phase the scene stops being painted at all.

       *  It is a cut, not a fade. Everything before it is the field landing;
       *  at it, the scene goes and the section under it is simply what is
       *  there. 0.86 because that is where the scatter finishes — see below —
       *  so what is on screen at the moment of the cut is a complete field and
       *  nothing else. */
      const EXIT_CUT_AT = 0.86;

      /* The scatter gets the whole phase now, not 55% of it.

         It used to get 55% and the scene then cross-faded out over the
         remaining 45%. That fade is what put two chapters on screen together:
         for a third of a viewport of scroll the scene sat at a low opacity
         with Overclock still legible through the thinning tiles while the next
         section's rows were already crisp underneath. Reported twice, and both
         times the complaint was the same — the transition had not finished but
         the section below was already up.

         There is nothing to fade to. The exit field is painted in the next
         section's own ground colour (see the note in WorkCategories.astro), so
         a complete field and that section's empty ground are the same flat
         colour. Cutting between them shows no seam, which is what makes the
         fade unnecessary rather than merely unwanted.

         The scatter ends at 0.86 of whatever duration it is given — 0.72 of it
         staggering the tiles in, plus the 0.14 the last tile takes to arrive —
         so handing it the whole phase puts the finished field exactly at the
         cut. */
      addTileReveal('exit', atExitReveal, durExitReveal);

      /* And then the scene is gone, in one frame.

         `set`, not `to`: a tween would reintroduce the very window this is
         removing. Scrubbed like everything else here, so scrolling back up
         puts the scene straight back — hence the pair, one either side of the
         cut, rather than a single set that the scrub could not undo. */
      handover
        .set(scene, { autoAlpha: 1 }, atExitReveal)
        .set(scene, { autoAlpha: 0 }, atExitReveal + durExitReveal * EXIT_CUT_AT);

      /* And it stops taking the pointer at the same moment.
         `autoAlpha` only parks visibility at the very end of that fade, so
         from the first frame of the dissolve to the last there was a stretch —
         measured, a third of a viewport of scroll — where the scene was down
         to 0.5% opacity, the section underneath was plainly visible through
         it, and every hover and click still landed on the chapter's
         full-bleed `.project__link`. Pointing at the list below it reported
         /work/overclock.

         On the LAYERS, not on the scene. `pointer-events: none` on an ancestor
         is undone by `auto` on a descendant, and `addArrival` above sets
         exactly that on each layer as it swaps in — so scoping this to the
         scene alone changed the computed value and nothing else: the hit test
         still came back .project__link at 0.4% opacity.

         Three levels have to be switched, not one, and each was found by
         probing what `document.elementFromPoint` actually returned mid-fade:
           the layers   `pointer-events: none` on an ancestor is undone by
                        `auto` on a descendant, and `addArrival` sets exactly
                        that on each layer as it swaps in
           the scene    a pinned, full-viewport box with the default `auto`
           the spacer   ScrollTrigger's own wrapper around the pinned scene —
                        once the scene stops taking the pointer it falls
                        straight through to its parent, which is the same box
                        at the same size
         Stopping at any one of them changed which element answered and not
         whether the rows below could be reached.

         Set, not tweened, and paired so the scrub restores it on the way back
         up: before the dissolve each layer is opaque and is the thing on
         screen, so it should still be clickable there. */
      const pinSpacer = scene.parentElement?.classList.contains('pin-spacer')
        ? scene.parentElement
        : null;

      const sceneHitTargets = [
        scene,
        ...(pinSpacer ? [pinSpacer] : []),
        ...gsap.utils.toArray<HTMLElement>('.scene__layer', scene),
      ];

      handover
        .set(sceneHitTargets, { pointerEvents: 'auto' }, atExitReveal)
        .set(
          sceneHitTargets,
          { pointerEvents: 'none' },
          atExitReveal + durExitReveal * EXIT_CUT_AT,
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

      /* ScrollTrigger fires this on resize, which is exactly when a field can
         stop covering the screen — see the note by `tileFields`. `refreshInit`
         rather than `refresh`: it runs before positions are recalculated, so
         the new spans are in place by the time the timeline is re-rendered at
         the current scroll. */
      const rebuildTileFields = () => tileFields.forEach((build) => build());
      ScrollTrigger.addEventListener('refreshInit', rebuildTileFields);

      /* --- Stepping -----------------------------------------------------------
         One scroll, one chapter.

         The scene used to be scrubbed: the handover's progress was the pin's
         progress, so a chapter change was three viewports of scrolling and you
         got as much of it as you scrolled. Half a gesture left half a pixel
         field on screen, and a flick threw the whole thing away at once.

         Now the scroll is a trigger, not a dial. A gesture inside the pin
         plays the next transition end to end at its own speed and lands on the
         chapter after it; anything that arrives while it is playing is
         swallowed, so a burst of wheel events — which is what one flick of a
         trackpad actually is — advances one chapter and not three.

         The scroll position still travels with the step, and that is not
         decoration: the pin releases at a scroll position, so the last step
         has to leave the reader standing at the end of it. Each step is worth
         exactly one viewport because every phase in VIEWPORTS is one viewport,
         which is why that list is equal now. */
      /** Seconds one chapter change takes, whatever the gesture was. */
      const STEP_SECONDS = 0.9;
      /** Ignored after a step lands. A trackpad keeps sending momentum events
       *  for some time after the fingers have left it, and without this the
       *  tail of one flick starts the next chapter the moment the last one
       *  arrives. */
      const COOLDOWN = 220;
      /** A gesture has to mean it. Momentum tails and stray horizontal-ish
       *  scrolls come in well under this. */
      const THRESHOLD = 8;

      let step = 0;
      let busy = false;
      let idleAt = 0;
      let stepTween: gsap.core.Tween | null = null;

      const restScroll = (index: number) =>
        st ? st.start + ((st.end - st.start) * index) / STEPS : 0;

      const goToStep = (target: number) => {
        const next = Math.min(STEPS, Math.max(0, target));
        if (next === step) return;

        step = next;
        busy = true;
        stepTween?.kill();

        /* The timeline and the scroll are two separate animations of the same
           length rather than one driving the other — which is the whole point
           of dropping the scrub. They start together and finish together, so
           what is on screen and where the page thinks it is agree at both
           ends, and in between the transition plays at the speed it was
           designed at instead of the speed of somebody's thumb. */
        stepTween = gsap.to(handover, {
          progress: step / STEPS,
          duration: STEP_SECONDS,
          ease: 'power2.inOut',
          overwrite: true,
          onComplete: () => {
            busy = false;
            idleAt = performance.now();
          },
        });

        const lenis = getLenis();
        if (lenis) {
          /* `force`, because the reader's own scrolling is locked for the
             length of the step and Lenis refuses a scrollTo while it is
             stopped; `lock`, so nothing else can move the page underneath the
             one that is running. */
          lenis.scrollTo(restScroll(step), {
            duration: STEP_SECONDS,
            force: true,
            lock: true,
          });
        } else {
          window.scrollTo(0, restScroll(step));
        }
      };

      /* Inside the pin, ends included — not `st.isActive`, which is false at
         exactly the end. That one pixel matters because the end is where every
         reader stands after the last chapter: from there a scroll back up is
         how they return to Overclock, and with `isActive` the gesture was not
         the scene's, so it scrolled the page a little instead and the chapter
         only came back on the one after it. */
      const inScene = () => {
        if (!st) return false;
        const y = st.scroll();
        return y >= st.start && y <= st.end;
      };

      /** Whether this gesture is the scene's to answer, or the page's.
       *
       *  At either end of the scene it is the page's: forward from the last
       *  chapter is how the reader leaves, backward from the hero is how they
       *  get back to the top. Taking those would trap them in it. */
      const owns = (direction: number) =>
        inScene() && !(direction > 0 && step >= STEPS) && !(direction < 0 && step <= 0);

      const advance = (direction: number, event: Event) => {
        if (!inScene()) return;

        // Mid-step, or in the moment after one: eaten, so the gesture cannot
        // stack up. Still cancelled, or the page would scroll under the pin.
        if (busy || performance.now() - idleAt < COOLDOWN) {
          if (owns(direction) || busy) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }

        if (!owns(direction)) return;

        /* Cancelled and stopped, not just cancelled. Lenis has its own wheel
           listener and it is registered first — initScroll runs before
           initHero — so bubbling on would let it scroll the page through the
           pin while this plays a chapter over the top. Capture phase plus
           stopPropagation is what gets there before it. */
        event.preventDefault();
        event.stopPropagation();
        goToStep(step + direction);
      };

      const controller = new AbortController();
      const { signal } = controller;
      const listen = { signal, passive: false, capture: true } as const;

      window.addEventListener(
        'wheel',
        (event: WheelEvent) => {
          if (Math.abs(event.deltaY) < THRESHOLD) return;
          advance(event.deltaY > 0 ? 1 : -1, event);
        },
        listen,
      );

      let touchY = 0;
      window.addEventListener(
        'touchstart',
        (event: TouchEvent) => void (touchY = event.touches[0]?.clientY ?? 0),
        { signal, passive: true, capture: true },
      );

      window.addEventListener(
        'touchmove',
        (event: TouchEvent) => {
          const y = event.touches[0]?.clientY ?? 0;
          const delta = touchY - y;
          if (Math.abs(delta) < THRESHOLD * 2) return;
          advance(delta > 0 ? 1 : -1, event);
        },
        listen,
      );

      const KEYS: Record<string, number> = {
        ArrowDown: 1,
        PageDown: 1,
        ' ': 1,
        ArrowUp: -1,
        PageUp: -1,
      };

      window.addEventListener(
        'keydown',
        (event: KeyboardEvent) => {
          const direction = KEYS[event.key];
          // Not while something else is reading the keystroke.
          const target = event.target as HTMLElement | null;
          if (!direction || event.metaKey || event.ctrlKey) return;
          if (target?.closest('input, textarea, select, [contenteditable]')) return;
          advance(direction, event);
        },
        listen,
      );

      /* Where the step index comes from when the reader did not step: a
         reload part way down, a resize moving the pin, or arriving at the
         scene from below. The scroll position is the authority there — it is
         the one thing that survives all three — and the timeline is put where
         that position says it should be. */
      const syncFromScroll = () => {
        if (!st) return;
        const span = st.end - st.start;
        const at = span > 0 ? (st.scroll() - st.start) / span : 0;
        step = Math.round(Math.min(1, Math.max(0, at)) * STEPS);
        stepTween?.kill();
        handover.progress(step / STEPS);
      };

      ScrollTrigger.addEventListener('refresh', syncFromScroll);
      syncFromScroll();

      // Runs when the query stops matching, and on mm.revert()
      return () => {
        controller.abort();
        stepTween?.kill();
        getLenis()?.start();
        ScrollTrigger.removeEventListener('refresh', syncFromScroll);
        ScrollTrigger.removeEventListener('refreshInit', rebuildTileFields);
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
