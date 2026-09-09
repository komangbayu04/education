import { gsap, ScrollTrigger } from './gsap';

/**
 * The closing screen, which the page does not scroll to.
 *
 * It is fixed to the bottom of the window and sits behind everything; the last
 * section slides off it. So there is no animation here and there is nothing to
 * time — the reveal IS the scroll. What this file does is the two things that
 * cannot be done in a stylesheet.
 *
 * ONE: the spacer's height. The page needs somewhere to scroll once the
 * sections have ended, and that distance is the closing block's own height. A
 * screen is the right answer nearly always and it is what the stylesheet says
 * on its own; this makes it exact, which matters on a window too short for the
 * block to fit in one, where a screen of spacer would leave part of the footer
 * permanently above the top of the window.
 *
 * TWO: telling the nav when the footer is actually visible. The block is
 * `position: fixed`, so its box has been in the window since the first pixel
 * of the page — and the nav's watcher decides by box and painted opacity, not
 * by what is on top of what. Declared on the footer itself, the capsule would
 * turn to glass over the hero. So the declarations sit on a marker that draws
 * nothing and is faded up as the block is uncovered: `painted()` reads that
 * opacity, and the nav learns about the footer exactly when the reader does.
 *
 * The founder-quote animation this replaces is gone entirely — the photograph
 * arriving as a card and opening into the band, the copy written on after it,
 * the wordmark drawing itself in pen strokes. A fixed footer is uncovered
 * rather than played.
 *
 * Returns a cleanup function.
 */
export function initFooter(): () => void {
  const close = document.querySelector<HTMLElement>('[data-close]');
  if (!close) return () => {};

  const spacer = document.querySelector<HTMLElement>('.close__spacer');
  const zone = close.querySelector<HTMLElement>('[data-close-zone]');
  const root = document.documentElement;

  const cleanups: Array<() => void> = [];

  // --- The spacer ----------------------------------------------------------
  const measure = () => {
    const h = Math.round(close.getBoundingClientRect().height);
    if (h > 0) root.style.setProperty('--close-h', `${h}px`);
  };

  measure();

  /* Three ways to hear about the same change, because no one of them covers
     every case and the cost of missing one is a spacer that no longer matches
     the block it is standing in for.

     The observer is the general answer: the block is a screen tall, so it
     changes when the window does — and on a phone the window changes when the
     address bar slides away, which fires no resize event at all.

     `resize` is the ordinary case, and it is here as well as the observer
     because a ResizeObserver's callback is delivered in the browser's
     rendering steps. That is exactly the right place for it and exactly the
     place I could not exercise: the preview this was built against has its
     rendering loop frozen, so the observer never fired there and the spacer sat
     at the old window's height through every resize. A plain listener runs
     whether anything is being painted or not.

     And ScrollTrigger's own refresh, which is when every other measurement on
     this page is retaken. */
  const observer = new ResizeObserver(() => {
    measure();
    ScrollTrigger.refresh();
  });
  observer.observe(close);
  cleanups.push(() => observer.disconnect());

  window.addEventListener('resize', measure);
  cleanups.push(() => window.removeEventListener('resize', measure));

  ScrollTrigger.addEventListener('refreshInit', measure);
  cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', measure));

  // --- The nav's reading ---------------------------------------------------
  /* Faded up across the last screen before the block is fully uncovered, so the
     capsule turns as the dark ground becomes what the reader is looking at
     rather than a screen early or a screen late.

     Measured against the spacer, which is the only element on the page whose
     position IS the reveal: the block itself never moves. */
  if (zone && spacer) {
    const tween = gsap.fromTo(
      zone,
      { opacity: 0 },
      {
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: spacer,
          start: 'top bottom',
          end: 'top 35%',
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );

    cleanups.push(() => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(zone, { clearProps: 'opacity' });
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    root.style.removeProperty('--close-h');
  };
}
