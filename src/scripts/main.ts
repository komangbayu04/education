import { gsap, ScrollTrigger } from './gsap';
import { initScroll, destroyScroll, scrollToTop, scrollToHash } from './scroll';
import { initMagnetic } from './magnetic';
import { initNav } from './nav';
import { initHero } from './hero';
import { initVideoSources } from './videoSources';
import { initTimeline } from './timeline';
import { initOverclock } from './overclock';
import { initWorkCursor } from './workCursor';
import { initCaseStudy } from './caseStudy';
import { initCredibility } from './credibility';
import { initWorkCategories } from './workCategories';
import { initTwoWays } from './twoWays';
import { initTestimonials } from './testimonials';
import { initTestimonialsFloat } from './testimonialsFloat';
import { initTestimonialsSphere } from './testimonialsSphere';
import { initJournal } from './journal';
import { initFounderQuote } from './founderQuote';
import { initPageTransition } from './pageTransition';
import { debounce, isTouch, prefersReducedMotion } from './utils/device';

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
      /* Overclock's own pinned scrub — it arrives small on black with its film
         running, opens to the screen, then speaks. The stepped scene that used
         to carry it is gone; see the note at the end of initHero. */
      initOverclock(),
      initCredibility(),
      initWorkCategories(),
      initTwoWays(),
      /* One of these three builds its section and the other two return a
         no-op — whichever cut of chapter 8 the reader has picked. */
      initTestimonials(),
      initTestimonialsFloat(),
      initTestimonialsSphere(),
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

  /* And with no fragment asked for, the top — but only the first time this
     tab loads the page. Later runs of this function are view transitions,
     which have their own rule a few lines down (`astro:after-swap`), and
     resetting here as well would take the reader back to the top of every
     page they navigate to rather than only the one they refreshed. */
  if (firstLoad && !location.hash) scrollToTop();
  firstLoad = false;
}

/** Whether initPage has run yet in this tab. See the reset above. */
let firstLoad = true;

function destroyPage(): void {
  ctx?.revert();
  ctx = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  destroyScroll();
}

/* Claimed at module scope, which is as early as this file runs and earlier
   than anything that reads it.

   The browser restores the scroll position of a refreshed page by itself, and
   it does so before any of the page's own code gets a say. Astro's router sets
   this too, but it sets it during its own start-up — after the restore has
   already happened on a hard refresh. What that looked like: F5 anywhere past
   the hero and the page came back mid-animation, the artwork half revealed and
   the copy gone, because the scrubbed pin was rendering the position the
   browser had put the reader back at.

   A reload of this page is not a return to a place, it is a return to the
   start — the opening is a sequence, and dropping the reader into the middle
   of one is not where they were, it is a state they never scrolled to. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

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
let viewportWidth = window.innerWidth;
window.addEventListener(
  'resize',
  debounce(() => {
    if (prefersReducedMotion()) return;
    /* iOS fires resize when the URL bar shows or hides. Width does not
       change; height does, by ~80px. Refreshing every pin and rebuilding the
       scene's tile fields on that is a long frame right as the reader leaves
       Overclock — the scroll freezes until the work finishes. */
    const next = window.innerWidth;
    if (isTouch() && next === viewportWidth) return;
    viewportWidth = next;
    ScrollTrigger.refresh();
  }, 200),
);
