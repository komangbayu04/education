import { gsap } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * The small "View work" tile that rides the pointer across a project's artwork
 * and takes you to that project's page.
 *
 * The link is real markup, not something this builds: the artwork is wrapped in
 * an `<a>` in the section itself, so the destination is reachable by keyboard,
 * by screen reader and with JS off. All this adds is the tile that follows the
 * pointer — decoration on top of a working control, never the control itself.
 *
 * The tile is always there, parked in the middle of the artwork, and follows
 * the pointer while the pointer is over it. It used to be summoned by
 * `pointerenter` and dismissed by `pointerleave`, which meant it was missing
 * exactly as often as it was present: a boundary event only fires when the
 * pointer crosses the edge, and the commonest way to arrive at one of these
 * sections is to scroll it up under a cursor that never moves. No crossing, no
 * tile — the artwork read as a plain picture with nothing to click.
 *
 * Skipped on touch, where there is no pointer to follow and the CSS hides it.
 * Under reduced motion it stays parked in the middle rather than chasing.
 */
export function initWorkCursor(): () => void {
  const links = gsap.utils.toArray<HTMLElement>('[data-work-link]');
  if (!links.length || isTouch()) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();
  const observers: ResizeObserver[] = [];

  links.forEach((link) => {
    const tile = link.querySelector<HTMLElement>('[data-work-tile]');
    if (!tile) return;

    // quickTo keeps one tween per axis alive and re-targets it, rather than
    // spawning a new tween on every pointermove — the difference is visible as
    // soon as the pointer moves fast.
    const toX = gsap.quickTo(tile, 'x', { duration: 0.45, ease: 'power3' });
    const toY = gsap.quickTo(tile, 'y', { duration: 0.45, ease: 'power3' });

    /** Where it waits: the middle of the artwork.
     *
     *  offsetWidth, not getBoundingClientRect().width. The tile's x and y are
     *  written in the link's own coordinate space, and a rect is in the
     *  screen's: these chapters are layers inside the pinned scene, which
     *  scales them, so the rect is the size the chapter is being drawn at
     *  rather than the size it is. Parked off a rect the tile sat at 573,381
     *  in a box that measured 678,424. */
    const park = (animate: boolean) => {
      const x = link.offsetWidth / 2;
      const y = link.offsetHeight / 2;
      if (animate) {
        toX(x);
        toY(y);
      } else {
        gsap.set(tile, { x, y });
      }
    };

    /* Shown from the start rather than on first hover. The CSS still ships it
       hidden, so a page with no JS gets no stray label in the corner — this is
       the one line that makes it visible, and it only runs where it can also
       be placed. */
    park(false);
    gsap.set(tile, { autoAlpha: 1, scale: 1 });

    if (!reduced) {
      link.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
          if (event.pointerType === 'touch') return;
          /* The pointer arrives in screen space and the tile is placed in the
             link's own, so the difference has to be divided back out by
             whatever the scene is scaling this chapter by. Without it the tile
             trailed the cursor by more the further from the top-left corner it
             got — the same scale mismatch `park` describes. */
          const box = link.getBoundingClientRect();
          const scaleX = box.width / link.offsetWidth || 1;
          const scaleY = box.height / link.offsetHeight || 1;
          toX((event.clientX - box.left) / scaleX);
          toY((event.clientY - box.top) / scaleY);
        },
        { signal },
      );

      // Back to the middle when the pointer goes, rather than away with it.
      link.addEventListener('pointerleave', () => park(true), { signal });
    }

    /* The park point is a measurement, so it goes stale when the artwork is
       re-laid — a resize, or one of the chapter sections changing height. Only
       re-parked while nothing is hovering it, so this can never yank the tile
       out from under a moving pointer. */
    let hovering = false;
    link.addEventListener('pointerenter', () => void (hovering = true), { signal });
    link.addEventListener('pointerleave', () => void (hovering = false), { signal });

    const observer = new ResizeObserver(() => {
      if (!hovering) park(false);
    });
    observer.observe(link);
    observers.push(observer);

    // Keyboard users get the same affordance — it is already in the middle, so
    // focus only has to make sure nothing has moved it.
    link.addEventListener('focusin', () => park(true), { signal });
    link.addEventListener('focusout', () => park(true), { signal });
  });

  return () => {
    controller.abort();
    observers.forEach((observer) => observer.disconnect());
  };
}
