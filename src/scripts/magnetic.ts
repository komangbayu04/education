import { gsap } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Elements marked [data-magnetic] lean toward the pointer and spring back on
 * exit. The optional attribute value sets the strength (default 0.35). A child
 * marked [data-magnetic-inner] moves a little further for a layered feel.
 *
 * This is a button behaviour, not a cursor — the pointer stays native.
 */
export function initMagnetic(): () => void {
  if (isTouch() || prefersReducedMotion()) return () => {};

  const els = gsap.utils.toArray<HTMLElement>('[data-magnetic]');
  if (!els.length) return () => {};

  const controller = new AbortController();
  const { signal } = controller;

  els.forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.35;
    const inner = el.querySelector<HTMLElement>('[data-magnetic-inner]');

    el.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        const { left, top, width, height } = el.getBoundingClientRect();
        const dx = (e.clientX - (left + width / 2)) * strength;
        const dy = (e.clientY - (top + height / 2)) * strength;
        gsap.to(el, { x: dx, y: dy, duration: 0.4, ease: 'power3.out' });
        if (inner) gsap.to(inner, { x: dx * 0.3, y: dy * 0.3, duration: 0.4, ease: 'power3.out' });
      },
      { signal, passive: true },
    );

    el.addEventListener(
      'pointerleave',
      () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
        if (inner) gsap.to(inner, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      },
      { signal },
    );
  });

  return () => controller.abort();
}
