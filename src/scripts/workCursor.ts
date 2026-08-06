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
 * Skipped on touch, where there is no pointer to follow, and under reduced
 * motion, where the tile is pinned to the centre instead of chasing the cursor.
 */
export function initWorkCursor(): () => void {
  const links = gsap.utils.toArray<HTMLElement>('[data-work-link]');
  if (!links.length || isTouch()) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();

  links.forEach((link) => {
    const tile = link.querySelector<HTMLElement>('[data-work-tile]');
    if (!tile) return;

    // quickTo keeps one tween per axis alive and re-targets it, rather than
    // spawning a new tween on every pointermove — the difference is visible as
    // soon as the pointer moves fast.
    const toX = gsap.quickTo(tile, 'x', { duration: 0.45, ease: 'power3' });
    const toY = gsap.quickTo(tile, 'y', { duration: 0.45, ease: 'power3' });

    const move = (event: PointerEvent) => {
      const box = link.getBoundingClientRect();
      toX(event.clientX - box.left);
      toY(event.clientY - box.top);
    };

    link.addEventListener(
      'pointerenter',
      (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        if (!reduced) {
          // Placed before it is shown, so it fades in under the pointer rather
          // than flying in from wherever it was left last time.
          const box = link.getBoundingClientRect();
          gsap.set(tile, { x: event.clientX - box.left, y: event.clientY - box.top });
        }
        gsap.to(tile, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' });
      },
      { signal },
    );

    link.addEventListener(
      'pointerleave',
      () => void gsap.to(tile, { autoAlpha: 0, scale: 0.8, duration: 0.25, ease: 'power2.in' }),
      { signal },
    );

    if (!reduced) link.addEventListener('pointermove', move, { signal });

    // Keyboard users get the same affordance: the tile appears while the link
    // holds focus, parked in the middle since there is no pointer to follow.
    link.addEventListener(
      'focusin',
      () => {
        const box = link.getBoundingClientRect();
        gsap.set(tile, { x: box.width / 2, y: box.height / 2 });
        gsap.to(tile, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' });
      },
      { signal },
    );

    link.addEventListener(
      'focusout',
      () => void gsap.to(tile, { autoAlpha: 0, scale: 0.8, duration: 0.25 }),
      { signal },
    );
  });

  return () => controller.abort();
}
