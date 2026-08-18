import { gsap, ScrollTrigger } from './gsap';
import { initScroll, destroyScroll, scrollToTop, scrollToHash } from './scroll';
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
import { initPageTransition } from './pageTransition';
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

  /* Only now, after the refresh. Every section below the scene is moved by the
     pin, so a fragment resolved before that measurement points at where the
     section used to be — and on a first load the browser has already made that
     wrong jump itself. Immediate, because this is an arrival: the reader asked
     for that section, not to watch the page travel to it. */
  scrollToHash(true);
}

function destroyPage(): void {
  ctx?.revert();
  ctx = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  destroyScroll();
}

/* Once for the tab, not once per page: its listeners are the router's own and
   registering them again on every load would stack a wipe per navigation. */
initPageTransition();

// Astro fires astro:page-load on first load and after every view transition.
document.addEventListener('astro:page-load', () => {
  initPage();
});

document.addEventListener('astro:before-swap', () => {
  destroyPage();
});

document.addEventListener('astro:after-swap', () => {
  /* A fragment is a destination, and the top of the page is not it. Left
     unconditional this put every `/#section` navigation at the top and then
     initPage scrolled away from it a moment later, which reads as the page
     overshooting and correcting itself. */
  if (!location.hash) scrollToTop();
});

// Layout shifts on resize invalidate every trigger's measurements.
window.addEventListener(
  'resize',
  debounce(() => {
    if (!prefersReducedMotion()) ScrollTrigger.refresh();
  }, 200),
);
