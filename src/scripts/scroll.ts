import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

let lenis: Lenis | null = null;
let rafHandler: ((time: number) => void) | null = null;

/**
 * Single smooth-scroll engine for the site. Lenis owns the scroll position,
 * GSAP's ticker owns the RAF loop — one loop total (PRD §4.6).
 */
export function initScroll(): Lenis | null {
  if (lenis) return lenis;

  // Reduced motion: leave the browser's native scrolling completely alone.
  if (prefersReducedMotion()) return null;

  lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    syncTouch: false, // native scroll on touch devices
    touchMultiplier: 2,
  });

  lenis.on('scroll', ScrollTrigger.update);

  rafHandler = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(rafHandler);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

/** Torn down before every Astro view transition so nothing leaks between pages. */
export function destroyScroll(): void {
  if (rafHandler) {
    gsap.ticker.remove(rafHandler);
    rafHandler = null;
  }
  lenis?.destroy();
  lenis = null;
}

export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
