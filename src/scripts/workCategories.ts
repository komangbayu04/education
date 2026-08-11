import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Four jobs, and only three of them are motion:
 *
 *   hold       the section pins for about two-thirds of a screen as it arrives,
 *              so the scroll coming out of the scene does not carry straight
 *              through it. The one thing here that touches the scrollbar, and
 *              the reason this file is no longer "nothing may hold the scroll"
 *              like its neighbours — see `Hold` below for why this section is
 *              the exception.
 *
 *   reveal     a one-shot entrance the first time the section scrolls in —
 *              same contract as journal.ts / twoWays.ts: not scrubbed and
 *              `once: true`.
 *
 *   accordion  clicking a row opens its strip and closes whichever was open.
 *              This half runs under reduced motion too — it is the section's
 *              only way to its own content, so it is behaviour, not decoration.
 *              All it does is move `data-open`; the opening itself is a CSS
 *              transition on that attribute, which is also what makes the
 *              reduced-motion case free.
 *
 *   shuffle    while a row is hovered, its stack of preview cards cycles: the
 *              front card shrinks away, the two behind it step forward, and it
 *              reappears at the back. First swap a second in, then one every
 *              1.2s — see the constants above `startShuffle`.
 *
 * The panels are closed from CSS (`html[data-js='true'] .cat__panel`) rather
 * than from here, so there is no frame on first paint where seven open strips
 * are on screen before this file runs. Without JS they stay open, which is the
 * whole section reachable by scroll alone.
 *
 * Returns a cleanup function.
 */
export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const reduced = prefersReducedMotion();
  const items = gsap.utils.toArray<HTMLElement>('[data-cat-item]', section);
  const cleanups: Array<() => void> = [];

  // --- Accordion ----------------------------------------------------------
  /** The open row, or null. One at a time: two open strips put the second one
   *  most of a screen below the row that opened it. */
  let open: HTMLElement | null = null;

  /* Rows whose stack is currently cycling, and how to stop each one. Declared
     up here because opening a row has to stop its shuffle: the stack is hidden
     while the strip is open, and a cycle nobody can see is work for nothing —
     and it would still be running when the row closes again. */
  const shuffles = new Map<HTMLElement, () => void>();

  const stopShuffle = (item: HTMLElement) => {
    shuffles.get(item)?.();
    shuffles.delete(item);
  };

  /** The same, for the open row's drifting strip — see `startDrift`. */
  const drifts = new Map<HTMLElement, () => void>();

  const stopDrift = (item: HTMLElement) => {
    drifts.get(item)?.();
    drifts.delete(item);
  };

  /* This file does not size the panel. `data-open` is the whole state: the
     component's CSS holds the panel at max-height 0 and opens it to a ceiling
     on that attribute, so there is nothing to measure here and nothing to
     re-measure when the strip reflows, the viewport changes, or an image
     finally loads. */
  const close = (item: HTMLElement) => {
    stopDrift(item);
    item.removeAttribute('data-open');
    item.querySelector('[data-cat-toggle]')?.setAttribute('aria-expanded', 'false');
    if (open === item) open = null;
  };

  /**
   * `drift: false` opens the row without starting its strip moving. Only the
   * row that is open before anyone has scrolled to the section uses it — see
   * the foot of this file.
   */
  const openItem = (item: HTMLElement, { drift = true } = {}) => {
    if (open && open !== item) close(open);
    stopShuffle(item);
    item.setAttribute('data-open', '');
    item.querySelector('[data-cat-toggle]')?.setAttribute('aria-expanded', 'true');
    open = item;

    /* Started here and not a frame later: the panel opens from max-height 0,
       but the strip inside it is already laid out at full height and clipped,
       so its tiles have their offsets and its scrollLeft takes a value from
       the first frame — nothing to wait for. */
    if (drift && !reduced) drifts.set(item, startDrift(item));
  };

  /* Where the row's own hover preview is switched off and the strip is the only
     preview there is — see the matching query in WorkCategories.astro. Below
     this width "See Work" opens the row instead of leaving for /work. */
  const compact = window.matchMedia('(max-width: 48rem)');

  const toggleItem = (item: HTMLElement) => {
    if (item.hasAttribute('data-open')) close(item);
    else openItem(item);
    // The page below just moved by the height of a strip; every trigger under
    // it is measuring against the old layout until this runs.
    ScrollTrigger.refresh();
  };

  items.forEach((item) => {
    const toggle = item.querySelector<HTMLElement>('[data-cat-toggle]');
    if (!toggle) return;

    const controller = new AbortController();
    toggle.addEventListener('click', () => toggleItem(item), { signal: controller.signal });

    /* On a phone this opens the row rather than following its href.
       There is no hover there, so the fan of preview cards never appears and
       the strip is the only way to see any of the work without leaving the
       page — which made "See Work" the one control that could not show you
       any. The href stays exactly as it is: it is what a desktop click still
       does, and what a click with this script absent does at any width. */
    const link = item.querySelector<HTMLAnchorElement>('.cat__link');
    link?.addEventListener(
      'click',
      (event) => {
        if (!compact.matches) return;
        event.preventDefault();
        toggleItem(item);
      },
      { signal: controller.signal },
    );

    cleanups.push(() => controller.abort());
  });

  // --- Shuffle ------------------------------------------------------------
  /* The three places a card can be, front to back. These mirror the CSS
     that lays the fan out for the no-JS case; from here on GSAP owns the
     transform, so the two only have to agree closely, not exactly. (They
     differ by a hair: CSS rotates then translates, GSAP translates then
     rotates, which turns a 4% offset by four degrees — about a pixel.) */
  const SLOTS = [
    { rotation: -1, xPercent: 0, yPercent: 0, zIndex: 3 },
    { rotation: 2.5, xPercent: 3, yPercent: -2, zIndex: 2 },
    { rotation: -4, xPercent: -4, yPercent: 4, zIndex: 1 },
  ];

  /** Seconds before the first card gives way, once the row is hovered. Long
   *  enough that a pointer crossing the list on its way somewhere else never
   *  sets anything moving; short enough that stopping on a row shows you what
   *  it does almost at once. */
  const FIRST = 1;

  /** Seconds a card holds the front between cycles, after that first one. */
  const HOLD = 1.2;

  /** How long the swap itself takes: the front card leaving, and the two
   *  behind stepping up into the space. Kept under the hold, so the stack is
   *  always still for a beat before it moves again rather than running
   *  continuously. */
  const STEP = 0.38;
  const OUT = 0.28;
  const IN = 0.32;

  /**
   * One row's stack, cycling for as long as it is hovered.
   *
   * `order` is the cards front-to-back, so the slot a card is in is its index
   * — advancing is one shift/push and re-placing everything. Rotating an array
   * rather than reordering the DOM: the cards are absolutely stacked and their
   * z-index comes from the slot, so nothing about the markup needs to move.
   *
   * Returns the teardown, which is also what pointerleave calls.
   */
  const startShuffle = (item: HTMLElement) => {
    const cards = gsap.utils.toArray<HTMLElement>('.cat__card', item);
    // Fewer than two and there is nothing to cycle between.
    if (cards.length < 2) return () => {};

    // The DOM runs back → front; the fan runs front → back.
    const order = [...cards].reverse();
    let call: gsap.core.Tween | null = null;
    let cycle: gsap.core.Timeline | null = null;

    const place = (card: HTMLElement, slot: number, duration: number) =>
      gsap.to(card, { ...SLOTS[slot], duration, ease: 'power3.inOut', overwrite: 'auto' });

    const advance = () => {
      const leaving = order.shift();
      if (!leaving) return;
      order.push(leaving);

      // The two behind step forward while the front one is still shrinking, so
      // the gap it leaves is already being filled rather than opening first.
      order.forEach((card, slot) => {
        if (card !== leaving) place(card, slot, STEP);
      });

      cycle = gsap
        .timeline()
        .to(leaving, { scale: 0, opacity: 0, duration: OUT, ease: 'power2.in' })
        // Parked at the back with no transition — it is invisible at this
        // point, so the jump costs nothing and saves it travelling across the
        // fan in view.
        .set(leaving, { ...SLOTS[order.length - 1] })
        .to(leaving, { scale: 1, opacity: 1, duration: IN, ease: 'power2.out' });
    };

    const tick = () => {
      advance();
      call = gsap.delayedCall(HOLD, tick);
    };

    // The first one waits FIRST, every one after it waits HOLD.
    call = gsap.delayedCall(FIRST, tick);

    return () => {
      call?.kill();
      cycle?.kill();
      call = null;
      cycle = null;

      /* Back to the fan it started in, and animated rather than snapped: the
         stack is still fading out under its own CSS transition when this runs,
         so a hard reset is three cards visibly jumping inside it. */
      order.forEach((card) => gsap.killTweensOf(card));
      cards.forEach((card, i) => {
        gsap.to(card, {
          ...SLOTS[cards.length - 1 - i],
          scale: 1,
          opacity: 1,
          duration: 0.35,
          ease: 'power2.out',
        });
      });
    };
  };

  /* Hover only, and not while the row is open — the stack is hidden then (see
     the component's CSS), and cycling something nobody can see is work for
     nothing. Skipped entirely under reduced motion: this is decoration, and
     the row's own hover state already says which one is under the pointer. */
  if (!reduced) {
    items.forEach((item) => {
      const row = item.querySelector<HTMLElement>('.cat__row');
      if (!row) return;

      const controller = new AbortController();

      row.addEventListener(
        'pointerenter',
        (event: PointerEvent) => {
          // Touch fires this on tap and never fires the leave, which would
          // leave one row cycling for the rest of the visit.
          if (event.pointerType === 'touch') return;
          if (item.hasAttribute('data-open') || shuffles.has(item)) return;
          shuffles.set(item, startShuffle(item));
        },
        { signal: controller.signal },
      );

      row.addEventListener('pointerleave', () => stopShuffle(item), {
        signal: controller.signal,
      });

      cleanups.push(() => {
        controller.abort();
        stopShuffle(item);
      });
    });
  }

  // --- Drift ---------------------------------------------------------------
  /** Pixels a second the open strip travels on its own. */
  const DRIFT = 22;
  /** Seconds between surges. */
  const SURGE_EVERY = 2;
  /** How long a surge takes to cover one tile. */
  const SURGE_TIME = 0.9;

  /**
   * The open strip, moving left: a slow constant drift with a surge every two
   * seconds that carries it exactly one tile further.
   *
   * Two accumulators rather than one changing speed. Tweening a px/s value up
   * and back down covers whatever distance the ease happens to integrate to,
   * which is not a tile and drifts further off every cycle; adding a fixed tile
   * width on top of a constant drift lands on the next piece of work every
   * time, and the ease is then free to be about how it feels.
   *
   * It drives `scrollLeft` rather than a transform, so the strip stays the
   * native scroller it already is — a trackpad flick still works, and the tiles
   * still snap. Same approach as the testimonials rail.
   */
  const startDrift = (item: HTMLElement) => {
    const strip = item.querySelector<HTMLElement>('[data-cat-strip]');
    const tiles = strip ? gsap.utils.toArray<HTMLElement>('.cat__shot', strip) : [];
    // The list is rendered twice; one copy is the loop's length. Without the
    // second copy there is nothing to wrap into.
    const half = Math.floor(tiles.length / 2);
    if (!strip || half < 1) return () => {};

    /* Measured from the tiles themselves — the strip's own scrollWidth
       includes the right-hand padding that lets the last tile scroll in, so
       halving it would drift out of true by that much every lap. */
    const lap = tiles[half].offsetLeft - tiles[0].offsetLeft;
    const step = tiles[1] ? tiles[1].offsetLeft - tiles[0].offsetLeft : lap;
    if (lap <= 0) return () => {};

    /* Snapping fights a scroll position written every frame — it drags the
       strip back to the nearest tile mid-drift. Off while this runs, restored
       when it stops and the strip is a plain scroller again. */
    const snap = strip.style.scrollSnapType;
    strip.style.scrollSnapType = 'none';

    let base = strip.scrollLeft;
    /* The surge, split in two: `done` is the tiles it has already covered and
       `p` is how far through the current one it is. Two values because a
       repeating tween replays itself — `to(surge, { by: '+=step', repeat: -1 })`
       reads its start once and returns there on every repeat, so the strip
       sprang back a full tile every two seconds instead of going on. Traced:
       it climbed to ~945 and dropped to ~485. The distance travelled has to
       live outside the tween for that reason. */
    const surge = { p: 0 };
    let done = 0;

    const tick = (_time: number, delta: number) => {
      base += (DRIFT * delta) / 1000;
      strip.scrollLeft = (base + done + surge.p * step) % lap;
    };

    gsap.ticker.add(tick);

    const pulse = gsap.to(surge, {
      p: 1,
      duration: SURGE_TIME,
      /* Slow out of the drift, fast through the middle, easing into the next
         hold — an acceleration rather than a jump, which is what makes it read
         as the strip getting on with it rather than skipping. */
      ease: 'power2.inOut',
      repeat: -1,
      repeatDelay: Math.max(0, SURGE_EVERY - SURGE_TIME),
      /* Same wait as between surges, so the row opens on the plain drift and
         the first surge lands on the two-second mark like every one after it.
         Without it the strip lurched a whole tile while the panel was still
         opening, which read as the open animation overshooting. */
      delay: Math.max(0, SURGE_EVERY - SURGE_TIME),
      /* Fires as the next cycle starts, the same moment gsap puts `p` back to
         0 — so `done + p * step` is the same number either side of it and the
         handover is invisible. Through the repeatDelay `p` sits at 1, which is
         the strip holding on the tile it just brought in. */
      onRepeat: () => {
        done += step;
      },
    });

    /* It does not stop under the pointer. It used to: the strip is a scroller,
       and the thinking was that a cursor resting in it meant reading rather
       than watching. In practice the open row is the one thing on screen and
       stopping it the moment the pointer crossed into it read as the animation
       breaking — so it runs for as long as the row is open, hover or not.

       Closing the row is what ends it now — see the teardown below. The cost
       is that the strip cannot be scrolled by hand while it runs: a position
       rewritten every frame overrides one set by a drag. If that is wanted
       back, the place for it is a pause on real scroll intent (wheel, touch,
       drag), not on hover. */
    return () => {
      gsap.ticker.remove(tick);
      pulse.kill();
      strip.style.scrollSnapType = snap;
    };
  };

  // --- Hold ---------------------------------------------------------------
  /**
   * The section stands still for a beat when it arrives.
   *
   * It comes straight out of the pinned scene, so it inherits that scene's
   * momentum: the scroll that ends the pin carries on into this section and
   * through it, and a list of seven quiet rows goes by without registering.
   * People were scrolling past a whole section without knowing it was there.
   *
   * A pin, and not a snap: a snap decides where the reader ends up, which is
   * the reader's business. This only makes the page stop moving for about
   * two-thirds of a screen's worth of scrolling and then hand it straight back
   * — long enough to be noticed, short enough that nobody has to fight it.
   *
   * `top top`. The section's own top sits against the top of the window and it
   * fills the screen downwards, which leaves whatever it does not fill showing
   * at the foot — a band of the section below, which is the right thing to see
   * while the page is held: it says there is more.
   *
   * It was anchored `bottom bottom` first, so the hold could not begin until
   * the whole section was in frame. That reads backwards: the section is a
   * screen tall and the window is a little taller, so aligning its foot with
   * the window's put the leftover *above* it, and the page held with a band of
   * white over the heading.
   *
   * Gated to the widths that still use the desktop row layout. Below that the
   * rows stack, the section grows well past a screen, and a hold anchored to
   * its top is a hold with its last rows off the bottom of the window — worse
   * than not holding at all.
   *
   * Not under reduced motion. Holding the scrollbar is the strongest thing on
   * this page and it is exactly what that preference is about — there, the
   * section is simply a section.
   */
  if (!reduced) {
    const mm = gsap.matchMedia();

    mm.add('(min-width: 48rem)', () => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * 0.66)}`,
        pin: true,
        pinSpacing: true,
        // The pin is set up a frame early, so the first frame of the hold is
        // not the one that has to do the layout.
        anticipatePin: 1,
        invalidateOnRefresh: true,
        /* Below the scene's own pin (default 0), so this one re-measures after
           it. The scene pulls the whole page up by a viewport as it releases —
           measured before that settles, this pin starts a screen too early. */
        refreshPriority: -1,
      });
    });

    cleanups.push(() => mm.revert());
  }

  // --- Reveal -------------------------------------------------------------
  // The CSS pre-reveal state is neutralised under the same query, so the
  // section already renders finished and a timeline here would only re-do it.
  if (!reduced) {
    const heading = section.querySelector<HTMLElement>('[data-cat-reveal]');

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
    });

    if (heading) {
      tl.fromTo(heading, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);
    }

    if (items.length) {
      // Down the list, one after another — the rows are a list and a list
      // arrives in order.
      tl.fromTo(
        items,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.06 },
        0.2,
      );
    }

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
    });
  }

  // --- The row that starts open --------------------------------------------
  /* Row one is open before anyone touches the section, so it arrives showing
     work rather than a list of seven closed titles. Everything else about it
     is ordinary: clicking it shuts it, clicking another moves the open state
     across, and the whole section is still reachable by keyboard.
     Set here rather than in the markup so it stays a JS-only state, like the
     closed rows it sits among — without JS every panel is open already.
     Opened without its drift, and the drift started when the section first
     comes into view. Started at load it would run against a strip nobody can
     see: by the time the reader arrived it would be some arbitrary distance
     into a lap, and the two-second beat — which is the point of it — would
     have been spent on an empty room. */
  /* Desktop only. On a phone the strip is most of a screen and the row above
     it carries no hover preview, so a row that opens itself puts the reader
     partway into one category before they have seen the list — the list is the
     section there, and it should arrive whole and closed. */
  const [firstItem] = items;
  if (firstItem && !compact.matches) {
    openItem(firstItem, { drift: false });

    /* The panel is mid-transition from max-height 0, so everything below it is
       still moving. Measure the triggers once it has settled, not now. */
    const panel = firstItem.querySelector<HTMLElement>('[data-cat-panel]');
    panel?.addEventListener('transitionend', () => ScrollTrigger.refresh(), { once: true });

    if (!reduced) {
      const start = ScrollTrigger.create({
        trigger: section,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          // It may have been clicked shut, or another row opened, on the way
          // down — whoever is open now is the one that should be moving.
          if (open && !drifts.has(open)) drifts.set(open, startDrift(open));
        },
      });
      cleanups.push(() => start.kill());
    }
  }

  return () => {
    cleanups.forEach((fn) => fn());
    items.forEach(stopDrift);
    ScrollTrigger.refresh();
  };
}
