import { gsap, ScrollTrigger } from './gsap';
import { initScroll, destroyScroll, scrollToTop } from './scroll';
import { initMagnetic } from './magnetic';
import { initNav } from './nav';
import { initHero } from './hero';
import { initTimeline } from './timeline';
import { debounce, prefersReducedMotion } from './utils/device';

/**
 * Single entry point. Everything per-page is created inside a gsap.context()
 * so one revert() call tears the whole page down cleanly before a view
 * transition (PRD §4.6).
 */
let ctx: gsap.Context | null = null;

function initPage(): void {
  initScroll();

  ctx = gsap.context(() => {
    const cleanups = [initNav(), initHero(), initMagnetic(), initTimeline()];
    return () => cleanups.forEach((fn) => fn());
  });

  ScrollTrigger.refresh();
}

function destroyPage(): void {
  ctx?.revert();
  ctx = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  destroyScroll();
}

// Astro fires astro:page-load on first load and after every view transition.
document.addEventListener('astro:page-load', () => {
  initPage();
});

document.addEventListener('astro:before-swap', () => {
  destroyPage();
});

document.addEventListener('astro:after-swap', () => {
  scrollToTop();
});

// Layout shifts on resize invalidate every trigger's measurements.
window.addEventListener(
  'resize',
  debounce(() => {
    if (!prefersReducedMotion()) ScrollTrigger.refresh();
  }, 200),
);
