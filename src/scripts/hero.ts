import { gsap, ScrollTrigger, SplitText } from './gsap';
import { setActiveChapter } from './timeline';
import { getLenis, onBeforeScrollTo } from './scroll';
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
    if (isTouch()) {
      /* The phone cut's canopy sits above the sky-box. A clip-path, even
         `inset(0%)`, shears it — so the intro does not clip on touch. */
      gsap.set(base, { clipPath: 'none' });
    } else {
      tl.fromTo(
        base,
        { clipPath: 'inset(100% 0 0 0)' },
        { clipPath: 'inset(0% 0 0 0)', duration: 1.4, ease: 'power3.inOut' },
        0,
      );
      tl.set(base, { clipPath: 'none' }, 1.4);
    }
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
  /* Our work sits outside the scene (it has to, so it can scroll at its own
     height after the pin). During the last step it is pinned over the
     viewport like a scene layer so it can fade in on the cream field the
     same way Overclock fades in on its own. */
  const workSection = document.querySelector<HTMLElement>('[data-cat]');

  if (scene && overclockLayer && stage) {
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
      //
      // Showcase is optional: when `[data-scene-next]` is missing, the first
      // scroll is hero → Overclock and the pin is one viewport shorter.
      const VIEWPORTS = next
        ? { heroToShowcase: 1, overclockArrival: 1, exitReveal: 1 }
        : { overclockArrival: 1, exitReveal: 1 };

      const PIN_VIEWPORTS = Object.values(VIEWPORTS).reduce((a, b) => a + b, 0);

      // Running cursor over the list above, converting "N viewports long" into
      // "starts at fraction X of the whole pin" as it goes.
      let cursor = 0;
      const at = (viewports: number) => {
        const start = cursor / PIN_VIEWPORTS;
        cursor += viewports;
        return start;
      };

      const atHeroToShowcase = next ? at(1) : 0;
      const atOverclockArrival = at(VIEWPORTS.overclockArrival);
      const atExitReveal = at(VIEWPORTS.exitReveal);
      // cursor is now at the end of the pin: the exit reveal is the last phase

      /** Rest points, one per phase boundary. With Showcase: 0, 1/3, 2/3, 1
       *  (hero, Nerd Apply, Overclock, exit). Without it: 0, 1/2, 1 (hero,
       *  Overclock, exit). */
      const STEPS = Object.keys(VIEWPORTS).length;

      const durHeroToShowcase = next ? 1 / PIN_VIEWPORTS : 0;
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

      /* Assigned once the stepper below exists. A scroll that the stepper did
         not make — a menu link to a section past the scene, a restored
         position, a jump — moves through the pin without ever advancing the
         step, and the timeline would still be showing the chapter the reader
         left. Declared here only because the trigger is built before the
         stepper it has to call. */
      let resync: (() => void) | undefined;

      /* Called when the scroll crosses back up over the pin's end — see the
         trigger's onEnterBack, and `stepBackIn` where it is defined. */
      let enterBack: (() => void) | undefined;
      /* Declared before the trigger: onLeave/onEnterBack close over them, and
         the trigger refreshes as it is created. */
      let step = 0;
      let busy = false;

      /* Our work is not a scene layer — it lives in the page so it can be
         taller than one viewport once the pin is over. For the arrival it
         has to occupy the same box the Overclock layer does, so it is
         parked over the viewport for the length of that step and released
         the moment the scene is marked done. */
      const WORK_OVERLAY = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        zIndex: 6,
        overflow: 'hidden',
        margin: 0,
      } as const;

      /* Taking Our work out of flow (position: fixed) collapses the eight
         screens it occupies. Everything below it jumps up into the viewport
         for the length of the last step — Two ways' `once` reveal fires
         behind the overlay, then the section is gone again when the space
         comes back. A spacer of the same height keeps the page the shape it
         was. */
      let workPlaceholder: HTMLElement | null = null;
      let releasingWork = false;

      const holdWorkSpace = () => {
        if (!workSection || workPlaceholder) return;
        workPlaceholder = document.createElement('div');
        workPlaceholder.setAttribute('aria-hidden', 'true');
        workPlaceholder.style.cssText = `display:block;height:${workSection.offsetHeight}px;pointer-events:none`;
        workSection.after(workPlaceholder);
      };

      const dropWorkSpace = () => {
        workPlaceholder?.remove();
        workPlaceholder = null;
      };

      const overlayWork = (visible: boolean) => {
        if (!workSection) return;
        holdWorkSpace();
        gsap.set(workSection, { ...WORK_OVERLAY, autoAlpha: visible ? 1 : 0 });
      };

      const releaseWork = () => {
        if (!workSection) return;
        gsap.set(workSection, {
          clearProps: 'position,top,left,right,bottom,width,zIndex,overflow,margin,pointerEvents',
          autoAlpha: 1,
        });
        dropWorkSpace();
        /* The overlay is `position: fixed`, so every panel's start/end was
           cached against the viewport rather than the page. A jump to #work
           then sits past those ends: the first headline is on screen and the
           second pitch is the one showing. Remeasure now the section is back
           in flow. Guarded, because this refresh re-enters the pin's
           onRefresh, which calls setSceneDone, which would call this again. */
        if (releasingWork) return;
        releasingWork = true;
        ScrollTrigger.refresh();
        releasingWork = false;
      };

      const setSceneDone = (done: boolean) => {
        if (done) {
          /* Snapping the timeline to 1 while the exit is still playing is
             the missing handover: the field never lands, the scene hides, and
             Our work is just there. The tween marks this itself when it
             finishes. */
          if (!busy) handover?.progress(1);
          releaseWork();
          scene.setAttribute('data-scene-done', '');
        } else {
          /* Cover the scene with Our work before it is shown again, or
             Overclock flashes through for a frame. */
          if (step >= STEPS) overlayWork(true);
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

      /* Length of one step, and of the pin. Taken off the scene itself
         (100svh) rather than `window.innerHeight`: on iOS those diverge when
         the URL bar shows or hides, and a pin measured in innerHeight against
         a scene measured in svh is how a flick skipped Overclock or got stuck
         on the hero — the rest points were not where the stepper thought. */
      const stepLength = () => scene.offsetHeight || window.innerHeight;

      const st = ScrollTrigger.create({
          trigger: scene,
          start: 'top top',
          end: () => `+=${stepLength() * PIN_VIEWPORTS}`,
          pin: true,
          anticipatePin: 1,
          /* Refreshed before every trigger below it, and that ordering is
             load-bearing rather than a tuning knob.
             
             Pinning wraps this scene in a spacer, and that spacer is what puts
             every section after it at its real scroll position. ScrollTrigger
             refreshes in creation order by default, so without this the
             triggers further down the page measure themselves against a
             document that does not have the spacer in it yet — and they all
             land exactly the pin's own runway too early. Measured: the work
             category crossfades and the Two ways in join were starting 1440px
             (two viewports, this pin's length) before their sections were
             anywhere near the window, which is a category dissolving while the
             next section is still a screen and a half below the fold. A later
             `ScrollTrigger.refresh()` does not undo it — the order is the
             fix, not the retry. */
          refreshPriority: 1,
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
          onLeave: () => {
            /* The last step plays the exit field first and only then moves
               the scroll to the pin's end. If this fires while that tween is
               still running, snapping the timeline to 1 is what cut the
               handover to a hard join with Our work. Leave the tween to
               finish; it marks the scene done itself. */
            if (busy && step >= STEPS) return;
            setSceneDone(true);
          },
          onEnterBack: (self) => {
            /* iOS rubber-bands a few pixels back over the pin's end the
               instant it releases. That is not a request to restore Overclock.
               A real swipe up from Our work overshoots by more than a bounce. */
            if (self.end - self.scroll() < 40) {
              setSceneDone(true);
              return;
            }
            setSceneDone(false);
            enterBack?.();
          },
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
            // Nothing while a step is running — it is the thing moving the
            // scroll, and `resync` is a no-op then by its own guard.
            resync?.();
          },
      });

      // --- Phase A: hero → Showcase, the bespoke pixel reveal ------------------
      // Skipped while Showcase is out of the page. The hero still recedes on
      // the first scroll — that motion is attached to Overclock's arrival
      // below, so the photo does not sit still under the scatter.
      if (next) {
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
      } else {
        handover.to(
          textCols,
          { opacity: 0, y: -40, ease: 'power1.in', duration: durOverclockArrival * 0.35 },
          atOverclockArrival,
        );
        handover.to(
          stage,
          { scale: 1.22, ease: 'power1.in', duration: durOverclockArrival },
          atOverclockArrival,
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
          /* Coarser on a phone: a 40px grid is ~280 tweens, and they all
             start together as the pin releases — a long frame that reads as
             the page freezing after Overclock. Larger tiles are the same
             language with less work. Height comes off the scene (100svh),
             not innerHeight, so the URL bar showing or hiding cannot change
             the count and rebuild the field mid-scroll. */
          const touch = isTouch();
          const size = Math.max(touch ? 64 : 40, Math.round(window.innerWidth / (touch ? 9 : 14)));
          // +2 on each axis for the one-tile overspill the CSS insets rely on
          const cols = Math.ceil(window.innerWidth / size) + 2;
          const rows = Math.ceil((scene.offsetHeight || window.innerHeight) / size) + 2;
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
            {
              autoAlpha: 1,
              ease: 'none',
              duration: fade,
              /* Overclock is already hidden by CSS; Our work is in the page
                 and must stay visible until this phase actually starts. */
              immediateRender: false,
            },
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

      /* --- Overclock → Our work -------------------------------------------
         Same arrival as hero → Overclock, not a cut onto the page. Overclock
         recedes the way the hero does (copy up, ground zooms), the cream
         field scatters over it, then Our work fades in on that field.

         Our work is not a scene layer — see overlayWork. It is parked over
         the viewport for this phase so addArrival can treat it like one, and
         released when the scene is marked done. */

      const ocText = overclockLayer.querySelector<HTMLElement>('[data-chapter-text]');
      const ocGround = overclockLayer.querySelector<HTMLElement>('.project__ground');

      if (ocText) {
        handover.to(
          ocText,
          { opacity: 0, y: -40, ease: 'power1.in', duration: durExitReveal * 0.35 },
          atExitReveal,
        );
      }
      if (ocGround) {
        handover.to(
          ocGround,
          { scale: 1.22, ease: 'power1.in', duration: durExitReveal, transformOrigin: '50% 50%' },
          atExitReveal,
        );
      }

      if (workSection) {
        /* Just after Overclock's rest, not on it — landing on Overclock is
           progress === atExitReveal, and a set there would park Our work
           over the viewport for the whole time that chapter is on screen. */
        handover.call(holdWorkSpace, undefined, atExitReveal + 1e-4);
        handover.set(workSection, { ...WORK_OVERLAY, autoAlpha: 0 }, atExitReveal + 1e-4);
        addArrival(workSection, atExitReveal, durExitReveal, 'exit');
      } else {
        addTileReveal('exit', atExitReveal, durExitReveal);
      }

      /** Where in the exit phase the scene stops being painted at all.

       *  It is a cut, not a fade, and it waits until Our work has finished
       *  fading in on the field — REVEAL_DONE, the same moment Overclock
       *  itself is fully on screen after its own arrival. Cutting any
       *  earlier hides the tiles while Our work is still coming in, and
       *  the cream field is gone before the section that matches it is
       *  opaque. */
      const EXIT_CUT_AT = REVEAL_DONE;

      /** Where that cut falls on the whole timeline, rather than within its own
       *  phase — see stepBackIn, which has to land just short of it. */
      const exitCut = atExitReveal + durExitReveal * EXIT_CUT_AT;

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
      /** Seconds one chapter change takes, whatever the gesture was.
          Touch is slower: 0.9s reads as a cut on a phone, where a swipe is
          one deliberate beat rather than a trackpad flick. */
      const STEP_SECONDS = isTouch() ? 1.45 : 0.9;
      /** Ignored after a step lands. A trackpad keeps sending momentum events
       *  for some time after the fingers have left it, and without this the
       *  tail of one flick starts the next chapter the moment the last one
       *  arrives. */
      const COOLDOWN = 220;
      /** A gesture has to mean it. Momentum tails and stray horizontal-ish
       *  scrolls come in well under this. */
      const THRESHOLD = 8;

      let idleAt = 0;
      let stepTween: gsap.core.Tween | null = null;
      /* A finger is down. iOS will not honour scrollTo until it lifts, and
         `touchmove` fires many times per swipe — without these, one gesture
         either stacks two chapters or native-scrolls through the pin. */
      let touching = false;
      let touchUsed = false;
      let pendingRest: number | null = null;

      /* --- Chapter films -------------------------------------------------
         A chapter's film starts when you arrive at that chapter, not when the
         page loads.

         Every layer is in the document from the first frame — they are stacked
         and faded, not mounted — so a chapter's `autoplay` fired while it was
         still invisible behind the hero. By the time you reached Nerd Apply
         its film was most of a minute in, or had looped back to the start at
         some arbitrary point; either way what opened the chapter was the
         middle of a shot. The markup keeps `autoplay` so a reader without JS
         still gets moving footage; this takes it back and hands playback to
         the step instead.

         Rewound on arrival, so stepping back into a chapter opens it the same
         way stepping forward did. `play()` is a promise that rejects if the
         browser declines — a chapter's film is scenery, so a refusal is
         nothing to recover from. */
      const stepLayers = [
        scene.querySelector<HTMLElement>('[data-scene-hero]'),
        ...(next ? [next] : []),
        overclockLayer,
      ];

      const setChapterFilms = (index: number) => {
        stepLayers.forEach((layer, i) => {
          if (!layer) return;
          gsap.utils.toArray<HTMLVideoElement>('video', layer).forEach((video) => {
            if (i !== index) {
              video.pause();
              return;
            }
            // Only once there is something to seek in: setting currentTime on
            // a video that has not read its metadata yet throws.
            if (video.readyState > 0) video.currentTime = 0;
            void video.play().catch(() => {});
          });
        });
      };

      const restScroll = (index: number) =>
        st ? st.start + ((st.end - st.start) * index) / STEPS : 0;

      const goToStep = (target: number) => {
        const next = Math.min(STEPS, Math.max(0, target));
        if (next === step) return;

        /* Only one chapter at a time. Native momentum through the pin used to
           ask for hero from Overclock in a single leap, and `progress()` would
           cut there with nothing in between. */
        const from = step;
        const clamped = next > step ? step + 1 : step - 1;
        const goingOut = clamped === STEPS;

        if (clamped < STEPS) setSceneDone(false);
        if (from === STEPS && clamped === STEPS - 1) {
          handover.progress(Math.min(handover.progress(), exitCut - 0.001));
        }

        step = clamped;
        busy = true;
        stepTween?.kill();
        /* Keep Overclock's film running under the exit field — there is no
           chapter at STEPS, and pausing it mid-handover flashes a still. */
        setChapterFilms(Math.min(step, STEPS - 1));

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
            /* Last step: jump to the pin's end while Our work is still
               parked over the viewport, then release it into flow and hide
               the scene. Releasing first leaves a frame of the pin spacer
               showing through; scrolling first while `busy` is still true
               is what stops onLeave from hiding the scene mid-jump. */
            if (step >= STEPS) {
              scrollToRest(STEPS, true);
              setSceneDone(true);
            }
            busy = false;
            idleAt = performance.now();
            getLenis()?.start();
          },
        });

        /* Do not move the scroll to the pin's end until the field has landed.
           Jumping there at the start is what fired onLeave mid-tween, hid the
           scene, and left Overclock → Our work with no handover at all. */
        if (!goingOut) scrollToRest(step);
      };

      const scrollToRest = (index: number, immediate = false) => {
        const y = restScroll(index);
        const lenis = getLenis();

        /* iOS ignores programmatic scroll while a finger is down. Remember
           where we need to be and apply it on touchend; doing it now would
           no-op, leave the pin at the previous rest, and `resync` would snap
           the timeline back — the "stuck on hero" case. */
        if (touching) {
          pendingRest = index;
          return;
        }

        pendingRest = null;

        /* Native on touch. Lenis.scrollTo with `lock` preventDefaults every
           subsequent swipe for the length of the tween, which is the freeze
           after Overclock; even without lock, mixing it with a cancelled
           touchmove leaves iOS native scrolling dead until the next gesture
           settles. */
        if (!lenis || isTouch()) {
          window.scrollTo({ top: y, left: 0, behavior: 'auto' });
          return;
        }

        /* `force`, because the reader's own scrolling is locked for the
           length of the step and Lenis refuses a scrollTo while it is
           stopped; `lock`, so nothing else can move the page underneath the
           one that is running. Immediate on touchend: the timeline has
           already been playing during the swipe, and a second 0.9s scroll
           would land late. */
        lenis.scrollTo(y, {
          duration: immediate ? 0 : STEP_SECONDS,
          immediate,
          force: true,
          lock: !immediate,
        });
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

      /** Cancel native scroll so a chapter change can play.
       *
       *  `owns` is false going forward once the last step has started, because
       *  that swipe is how the reader leaves. While the exit field is still
       *  playing, though, native scroll would race the tween, fire onLeave,
       *  and cut to Our work with the field never seen. Catch until `busy`
       *  clears; after that the page is theirs. */
      const catching = (direction: number) => {
        if (busy) return !(direction < 0 && step <= 0);
        return owns(direction);
      };

      const holdPin = () => {
        if (!busy || !isTouch()) return;
        /* Last step holds Overclock's rest until the field has landed. Any
           other step holds the rest it is travelling to. */
        const index = step >= STEPS ? STEPS - 1 : step;
        window.scrollTo({ top: restScroll(index), left: 0, behavior: 'auto' });
      };

      const advance = (direction: number, event: Event) => {
        if (!inScene() && !busy) return;

        if (busy || performance.now() - idleAt < COOLDOWN) {
          if (catching(direction)) {
            event.preventDefault();
            event.stopPropagation();
            holdPin();
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
          const direction = event.deltaY > 0 ? 1 : -1;
          if (
            direction < 0 &&
            step >= STEPS &&
            !busy &&
            st &&
            st.scroll() > st.end &&
            st.scroll() <= st.end + stepLength()
          ) {
            event.preventDefault();
            event.stopPropagation();
            setSceneDone(false);
            handover.progress(Math.min(handover.progress(), exitCut - 0.001));
            goToStep(STEPS - 1);
            return;
          }
          advance(direction, event);
        },
        listen,
      );

      let touchY = 0;
      window.addEventListener(
        'touchstart',
        (event: TouchEvent) => {
          touchY = event.touches[0]?.clientY ?? 0;
          touching = true;
          touchUsed = false;
        },
        { signal, passive: true, capture: true },
      );

      window.addEventListener(
        'touchmove',
        (event: TouchEvent) => {
          const y = event.touches[0]?.clientY ?? 0;
          const delta = touchY - y;
          if (Math.abs(delta) < 2) return;

          const direction = delta > 0 ? 1 : -1;

          /* A swipe that starts on Our work and re-enters the pin has already
             committed to native scroll before `inScene` is true. Claim it as
             soon as it is heading back in, or the momentum skips Overclock
             and lands on the hero. */
          const reentering =
            direction < 0 &&
            step >= STEPS &&
            !!st &&
            st.scroll() > st.end &&
            st.scroll() <= st.end + stepLength();

          if (!inScene() && !busy && !reentering) return;

          /* Claim the gesture on the first real move. iOS locks in a native
             scroll if the first `touchmove` is not cancelled, and after that
             `preventDefault` is ignored — which is how a swipe scrolled the
             pin *and* advanced a step, then skipped the one in between. */
          if (catching(direction) || reentering) {
            event.preventDefault();
            event.stopPropagation();
            holdPin();
          }

          if (touchUsed || Math.abs(delta) < THRESHOLD * 2) return;
          if (busy || performance.now() - idleAt < COOLDOWN) return;

          if (reentering) {
            touchUsed = true;
            setSceneDone(false);
            handover.progress(Math.min(handover.progress(), exitCut - 0.001));
            goToStep(STEPS - 1);
            return;
          }

          if (!owns(direction)) return;

          touchUsed = true;
          goToStep(step + direction);
        },
        listen,
      );

      const endTouch = () => {
        touching = false;
        if (pendingRest === null) return;
        const index = pendingRest;
        pendingRest = null;
        /* Next frame, not this one: iOS still treats scrollTo as a no-op
           inside the touchend handler itself. */
        requestAnimationFrame(() => scrollToRest(index, true));
      };
      window.addEventListener('touchend', endTouch, { signal, capture: true });
      window.addEventListener('touchcancel', endTouch, { signal, capture: true });

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
        if (!st || busy || touching) return;
        const span = st.end - st.start;
        const at = span > 0 ? (st.scroll() - st.start) / span : 0;
        step = Math.round(Math.min(1, Math.max(0, at)) * STEPS);
        stepTween?.kill();
        handover.progress(step / STEPS);
        setChapterFilms(step);
      };

      /* The scroll is the authority whenever the stepper is not driving it. Kept
         cheap: it only rewrites the timeline when the scroll has actually
         crossed into another step's screen, so the common case — a step
         landing exactly on its own rest point — costs a comparison. */
      resync = () => {
        if (busy || touching) return;
        const span = st ? st.end - st.start : 0;
        if (span <= 0) return;
        const at = ((st as ScrollTrigger).scroll() - (st as ScrollTrigger).start) / span;
        const where = Math.round(Math.min(1, Math.max(0, at)) * STEPS);
        if (where === step) return;
        /* After the exit, the page owns the scroll. Pulling the timeline back
           from whatever rest iOS has not applied yet is Overclock returning
           on its own; jumping from there to 0 is the snap to the hero. */
        if (step >= STEPS) return;
        /* One chapter, not a leap. Native momentum through the pin used to
           round from Overclock's rest all the way to the hero. */
        goToStep(where > step ? step + 1 : step - 1);
      };

      /* Coming back up out of the section below.
       *
       * The pin's last step leaves the scene finished: the exit field is
       * complete and the scene has been cut to invisible, because at that
       * point the section pulled up underneath it is the only thing that
       * should be on screen. Scrolling back up put the reader inside the pin
       * again with the scene still in that state — a full-height invisible box
       * across the top of the screen, with the section it covers sliding down
       * away from it. What showed in the space between was nothing: measured
       * at 2360 the work section had already moved 40px down the screen, and
       * by 2000 it was 400px down with bare page above it.
       *
       * Rounding is what left that band dead. The step is derived from the
       * scroll, and every position from 2000 up to the pin's end rounds to the
       * last step — so the timeline sat at its end through 400px of scrolling
       * that had visibly left it.
       *
       * So crossing the end upwards is a step, the same one a scroll inside
       * the pin would make: the exit undoes itself, Overclock comes back, and
       * the scroll is carried to that chapter's own resting place rather than
       * being left in between. It is the transition running backwards, which
       * is what the way in looks like in reverse. */
      const stepBackIn = () => {
        if (busy || step < STEPS) return;

        /* Put the playhead just under the exit's cut before easing away from
           it, rather than easing across it.
           The last 14% of the exit phase is the frame where the scene stops
           being painted at all, and going backwards the timeline has to travel
           through it before anything is drawn again. Eased, that took about a
           fifth of a second — during which the scene was still an invisible
           full-height box and the section below it slid 700px down the screen
           behind it, which is the gap.
           Landing under the cut first costs nothing to look at: the exit field
           is complete there, and a complete field is painted in the ground
           colour of the very section that was on screen. So the frame that
           replaces it is the same flat colour, and what the reader sees is the
           field starting to scatter — the way in, backwards. */
        handover.progress(Math.min(handover.progress(), exitCut - 0.001));
        goToStep(STEPS - 1);
      };

      enterBack = stepBackIn;

      /* A menu link to a section below the scene is not a gesture. Without
         this the stepper sees the scroll moving through the pin, plays the
         next chapter, and the reader stops on Overclock with `#work` in the
         bar. Finish the scene first, stand at its end, then let the jump
         measure a page that is already the right shape. */
      const unBeforeScroll = onBeforeScrollTo((target) => {
        if (scene.contains(target)) return;
        if (step >= STEPS && scene.hasAttribute('data-scene-done')) return;

        stepTween?.kill();
        step = STEPS;
        busy = false;
        handover.progress(1);
        setSceneDone(true);
        getLenis()?.start();

        if (st.scroll() < st.end) {
          const lenis = getLenis();
          if (lenis) lenis.scrollTo(st.end, { immediate: true, force: true });
          else window.scrollTo({ top: st.end, left: 0, behavior: 'auto' });
        }
      });

      ScrollTrigger.addEventListener('refresh', syncFromScroll);
      syncFromScroll();

      // Runs when the query stops matching, and on mm.revert()
      return () => {
        unBeforeScroll();
        controller.abort();
        stepTween?.kill();
        dropWorkSpace();
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
