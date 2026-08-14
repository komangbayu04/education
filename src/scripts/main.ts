import { gsap, ScrollTrigger } from './gsap';
import { initScroll, destroyScroll, scrollToTop } from './scroll';
import { initMagnetic } from './magnetic';
import { initNav } from './nav';
import { initHero } from './hero';
import { initVideoSources } from './videoSources';
import { initTimeline } from './timeline';
import { initWorkCursor } from './workCursor';
import { initCaseStudy } from './caseStudy';
import { initCredibility } from './credibility';
import { initWorkCategories } from './workCategories';
import { initTwoWays } from './twoWays';
import { initTestimonials } from './testimonials';
import { initJournal } from './journal';
import { initFounderQuote } from './founderQuote';
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
    const cleanups = [
      initNav(),
      initHero(),
      initVideoSources(),
      initMagnetic(),
      initTimeline(),
      initWorkCursor(),
      initCaseStudy(),
      initCredibility(),
      initWorkCategories(),
      initTwoWays(),
      initTestimonials(),
      initJournal(),
      initFounderQuote(),
    ];
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
