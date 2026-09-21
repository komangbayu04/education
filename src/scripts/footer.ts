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
 * sections have ended, and that distance is the closing block's own height —
 * which is a screen less one cell of the pixel seam, since the block stops
 * short of the top so the section above keeps a strip of itself showing. The
 * stylesheet works that out on its own; this makes it exact, which matters on a
 * window too short for the block to fit in, where a spacer taken on trust would
 * leave part of the footer permanently above the top of the window.
 *
 * And the seam's colour, which belongs with the measuring for the same reason:
 * it is a fact about the page rather than about any animation. See paintSeam.
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
  /**
   * What colour the pixel seam at the top of the block is painted in.
   *
   * The block stops a cell short of the screen now, so the last strip of the
   * section above it stays visible and the squares fall out of that strip into
   * the footer. Which means they have to be ITS colour, and which section it is
   * is not fixed: chapter 8 ships as three variations and the reader picks one
   * in the browser, the film wall and the orbit grid on white and the scattered
   * one on the page's cream. A seam hard-coded to either is a band of the wrong
   * colour rather than a dissolve, on a third of the readers.
   *
   * So it is read rather than declared — walking back from the spacer past
   * whichever variations have switched themselves off, and taking the first
   * painted ground it finds. Re-read on every refresh, because the variation
   * can be changed without the page reloading.
   */
  const paintSeam = () => {
    let node = spacer?.previousElementSibling as HTMLElement | null;

    while (node) {
      const style = getComputedStyle(node);
      if (style.display !== 'none') {
        /* A section at the foot of a page wrapper can name itself as the strip
           the seam falls out of — the case-study pages sit inside one element
           with a white ground, and their last panel is a different colour. */
        const inner = node.querySelector<HTMLElement>('[data-footer-seam]');
        const ground = (inner ? getComputedStyle(inner) : style).backgroundColor;
        /* Transparent is not an answer — it means this element paints nothing
           and what shows through it is something else's ground. */
        if (ground && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(ground)) {
          close.style.setProperty('--close-seam', ground);
          return;
        }
      }
      node = node.previousElementSibling as HTMLElement | null;
    }

    close.style.removeProperty('--close-seam');
  };

  const measure = () => {
    const h = Math.round(close.getBoundingClientRect().height);
    if (h > 0) root.style.setProperty('--close-h', `${h}px`);
    paintSeam();
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
  /* NOT ON A PHONE. The block is in the page there rather than fixed behind
     it (see the note at the foot of Footer.astro), so its box is only under the
     bar when it really is under the bar — and the spacer this would be measured
     against is not displayed. The zone is simply left painted.

     `gsap.matchMedia` rather than one reading of the query, so a tablet turned
     across 768px swaps modes: each branch's tween and inline opacity are
     reverted by gsap when its query stops matching, and the other is built. */
  if (zone && spacer) {
    const mm = gsap.matchMedia();

    mm.add('(max-width: 48rem)', () => {
      gsap.set(zone, { opacity: 1 });
    });

    mm.add('(min-width: 48.0625rem)', () => {
      /* THE BLOCK IS NOT PAINTED UNTIL ITS SPACER IS ON SCREEN. It is behind the
         page and fully covered until then, so hiding it changes nothing a
         reader can see — except when something above has come up short. A pin
         left at an old window's height is exactly that, and the footer's
         copyright and links showed through the gap under the hero. An
         IntersectionObserver is asked by the browser on the real layout of the
         moment, so there are no stored measurements in it to go stale. */
      const guard = new IntersectionObserver(
        ([entry]) => {
          const below = !entry.isIntersecting && entry.boundingClientRect.top > 0;
          close.style.visibility = below ? 'hidden' : '';
        },
        { rootMargin: '0px 0px 1px 0px' },
      );
      guard.observe(spacer);

      gsap.fromTo(
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

      return () => {
        guard.disconnect();
        close.style.visibility = '';
      };
    });

    cleanups.push(() => {
      mm.revert();
      gsap.set(zone, { clearProps: 'opacity' });
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    root.style.removeProperty('--close-h');
    close.style.removeProperty('--close-seam');
  };
}
