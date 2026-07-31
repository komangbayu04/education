import { gsap, ScrollTrigger } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

/** Pixels per second the rail drifts on its own. */
const AUTO_SPEED = 42;
/** How long after a manual interaction before the drift picks back up. */
const RESUME_DELAY = 1400;

/**
 * Featured accordion — exactly one note open at a time.
 *
 * The open state is an attribute on the person, and the width change is a CSS
 * transition on flex-basis (see Testimonials.astro); this only decides *which*
 * one is open. Index 0 is the default, and releasing returns to it.
 *
 * Hover is the stated interaction, but focus is wired to the same path so the
 * notes are reachable by keyboard — every other hover state in this project
 * has a focus equivalent.
 *
 * Skipped entirely on touch: there is no hover there, and the CSS at that
 * width already lays every note out open.
 */
function initFeature(section: HTMLElement, cleanups: Array<() => void>): void {
  const feature = section.querySelector<HTMLElement>('[data-tm-feature]');
  if (!feature || isTouch()) return;

  const people = gsap.utils.toArray<HTMLElement>('[data-tm-person]', feature);
  if (people.length < 2) return;

  const DEFAULT_INDEX = 0;
  const controller = new AbortController();
  const { signal } = controller;

  const open = (index: number) => {
    people.forEach((person, i) => {
      if (i === index) person.setAttribute('data-open', '');
      else person.removeAttribute('data-open');
    });
  };

  people.forEach((person, i) => {
    person.addEventListener('pointerenter', () => open(i), { signal });
    person.addEventListener('focusin', () => open(i), { signal });
  });

  feature.addEventListener('pointerleave', () => open(DEFAULT_INDEX), { signal });
  feature.addEventListener(
    'focusout',
    (event: FocusEvent) => {
      // Only reset once focus has actually left the whole row, not when it
      // moves between two controls inside it.
      if (!feature.contains(event.relatedTarget as Node | null)) open(DEFAULT_INDEX);
    },
    { signal },
  );

  cleanups.push(() => controller.abort());
}

/**
 * Marquee — a native scroller that also drifts on its own.
 *
 * Native `overflow-x: auto` does the heavy lifting, so trackpad, touch and
 * scrollbar all work for free and correctly. On top of that:
 *   - the card list is rendered twice, and scrollLeft wraps at the halfway
 *     point, so the loop is seamless in both directions
 *   - a ticker callback adds the drift, paused only while the user is actually
 *     moving the rail — dragging it, or scrolling it sideways — and resumed a
 *     beat after they stop. Hovering does NOT pause it (explicit direction):
 *     the rail keeps travelling under a resting cursor.
 *   - pointer drag is added by hand, because a mouse otherwise has no way to
 *     scroll a horizontal rail
 *
 * Under reduced motion the drift never starts; the rail stays fully scrollable
 * by hand.
 */
function initMarquee(section: HTMLElement, cleanups: Array<() => void>): void {
  const rail = section.querySelector<HTMLElement>('[data-tm-rail]');
  const track = section.querySelector<HTMLElement>('[data-tm-track]');
  if (!rail || !track) return;

  const segments = gsap.utils.toArray<HTMLElement>('[data-tm-seg]', section);
  const controller = new AbortController();
  const { signal } = controller;

  /** Width of one copy of the list — the point scrollLeft wraps at. */
  let loopWidth = 0;
  const measure = () => {
    loopWidth = track.scrollWidth / 2;
  };
  measure();

  // Guard so the wrap, which writes scrollLeft, doesn't recurse through its
  // own scroll event.
  let wrapping = false;
  const wrap = () => {
    if (wrapping || loopWidth <= 0) return;
    if (rail.scrollLeft >= loopWidth) {
      wrapping = true;
      rail.scrollLeft -= loopWidth;
      wrapping = false;
    } else if (rail.scrollLeft <= 0) {
      wrapping = true;
      rail.scrollLeft += loopWidth;
      wrapping = false;
    }
  };

  const syncProgress = () => {
    if (!segments.length || loopWidth <= 0) return;
    const ratio = (rail.scrollLeft % loopWidth) / loopWidth;
    const active = Math.min(segments.length - 1, Math.floor(ratio * segments.length));
    segments.forEach((seg, i) => {
      if (i === active) seg.setAttribute('data-active', '');
      else seg.removeAttribute('data-active');
    });
  };

  rail.addEventListener(
    'scroll',
    () => {
      wrap();
      syncProgress();
    },
    { signal, passive: true },
  );

  syncProgress();

  // --- Manual drag ---------------------------------------------------------
  let dragging = false;
  let startX = 0;
  let startScroll = 0;
  let moved = false;

  rail.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      // Let touch use the native scroller; this is for mouse and pen.
      if (event.pointerType === 'touch') return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.setAttribute('data-dragging', '');
    },
    { signal },
  );

  rail.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) > 3) {
        moved = true;
        // Only capture once it's clearly a drag, so a plain click on a link
        // inside the rail still behaves like a click.
        if (!rail.hasPointerCapture(event.pointerId)) rail.setPointerCapture(event.pointerId);
      }
      if (moved) rail.scrollLeft = startScroll - delta;
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    rail.removeAttribute('data-dragging');
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  };

  rail.addEventListener('pointerup', endDrag, { signal });
  rail.addEventListener('pointercancel', endDrag, { signal });

  // Suppress the click that follows a drag, so dragging across a card never
  // triggers something inside it.
  rail.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    },
    { signal, capture: true },
  );

  // --- Auto drift ----------------------------------------------------------
  if (prefersReducedMotion()) {
    cleanups.push(() => controller.abort());
    return;
  }

  let resumeAt = 0;

  const hold = () => {
    resumeAt = performance.now() + RESUME_DELAY;
  };

  // Sideways wheels only. This listener fires for *every* wheel over the rail,
  // including the plain vertical ones that are just scrolling the page past
  // this section — holding on those stopped the marquee for as long as the
  // cursor happened to rest here, which is the same complaint as the hover
  // pause, arriving by a different route.
  rail.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) hold();
    },
    { signal, passive: true },
  );
  rail.addEventListener('touchstart', hold, { signal, passive: true });
  rail.addEventListener('touchmove', hold, { signal, passive: true });

  let last = performance.now();
  const tick = (time: number) => {
    const dt = Math.min(64, time - last);
    last = time;

    if (dragging || time < resumeAt || loopWidth <= 0) return;

    rail.scrollLeft += (AUTO_SPEED * dt) / 1000;
    wrap();
  };

  // gsap.ticker passes elapsed time in seconds; performance.now() is what the
  // hold timestamps use, so the callback reads the clock itself rather than
  // mixing the two units.
  const tickerHandler = () => tick(performance.now());
  gsap.ticker.add(tickerHandler);

  // The loop width depends on layout, so it has to be re-measured whenever
  // that changes.
  const observer = new ResizeObserver(() => {
    measure();
    syncProgress();
  });
  observer.observe(track);

  cleanups.push(() => {
    controller.abort();
    gsap.ticker.remove(tickerHandler);
    observer.disconnect();
  });
}

/**
 * Testimonials (chapter 8) — the hover accordion, the marquee, and a one-shot
 * reveal when the section first scrolls into view.
 *
 * Same contract as the other post-scene sections: the reveal is not scrubbed
 * and not pinned, because the handover into this section is plain document
 * scroll.
 *
 * Returns a cleanup function.
 */
export function initTestimonials(): () => void {
  const section = document.querySelector<HTMLElement>('[data-tm]');
  if (!section) return () => {};

  const cleanups: Array<() => void> = [];

  initFeature(section, cleanups);
  initMarquee(section, cleanups);

  if (prefersReducedMotion()) {
    // CSS already renders the finished section under the same query.
    return () => cleanups.forEach((fn) => fn());
  }

  const people = gsap.utils.toArray<HTMLElement>('[data-tm-person]', section);
  const cards = gsap.utils.toArray<HTMLElement>('.tm__quote-card', section);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', once: true },
  });

  if (people.length) {
    tl.fromTo(people, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0);
  }

  if (cards.length) {
    // Only the first few are on screen; staggering all of them (including the
    // duplicated copy) would run long after the rail has scrolled past.
    tl.fromTo(
      cards.slice(0, 6),
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 },
      0.25,
    );
    tl.set(cards.slice(6), { opacity: 1 }, 0.25);
  }

  cleanups.push(() => {
    tl.scrollTrigger?.kill();
    tl.kill();
  });

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
