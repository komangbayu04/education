const reducedMotionQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** True when the visitor asked the OS to reduce motion. Checked at call time, not cached. */
export const prefersReducedMotion = (): boolean => reducedMotionQuery().matches;

/** Fires whenever the reduced-motion preference flips. Returns an unsubscribe fn. */
export function onReducedMotionChange(handler: (reduced: boolean) => void): () => void {
  const mq = reducedMotionQuery();
  const listener = (e: MediaQueryListEvent) => handler(e.matches);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

/** Coarse pointer — no hover, so no custom cursor and no magnetic elements. */
export const isTouch = (): boolean =>
  window.matchMedia('(hover: none), (pointer: coarse)').matches;

/** Debounce helper — used for resize handlers (PRD §4.6: min 150ms). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 150) {
  let timer: number | undefined;
  return (...args: A) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
