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
import { initIncluded } from './included';
import { initTestimonials } from './testimonials';
import { initTestimonialsFloat } from './testimonialsFloat';
import { initTestimonialsSphere } from './testimonialsSphere';
import { initJournal } from './journal';
import { initFooter } from './footer';
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
      /* A no-op on the home page: Overclock is Our work's first item now and
         its opening lives in initWorkCategories. Kept for a page that still
         renders the chapter on its own. */
      initOverclock(),
      initCredibility(),
      initWorkCategories(),
      initTwoWays(),
      initIncluded(),
      /* One of these three builds its section and the other two return a
         no-op — whichever cut of chapter 8 the reader has picked. */
      initTestimonials(),
      initTestimonialsFloat(),
      initTestimonialsSphere(),
      initJournal(),
      initFooter(),
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

/**
 * The LARGE viewport's height, in pixels — what `100lvh` resolves to.
 *
 * It is the one height a browser's collapsing bars do not move: when the URL
 * bar slides away the visible height grows, and `lvh` was already the height
 * with it gone. So a change in it means the screen itself changed.
 */
const lvhProbe = document.createElement('div');
lvhProbe.setAttribute('aria-hidden', 'true');
lvhProbe.style.cssText =
  'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
document.body.appendChild(lvhProbe);
const largeHeight = () => Math.round(lvhProbe.getBoundingClientRect().height);

let viewportWidth = window.innerWidth;
let viewportLarge = largeHeight();

window.addEventListener(
  'resize',
  debounce(() => {
    if (prefersReducedMotion()) return;
    const nextWidth = window.innerWidth;
    const nextLarge = largeHeight();

    /* A touch screen skips the refresh when ONLY ITS BARS moved, and nothing
       else. iOS fires resize as the URL bar shows or hides, by ~80px, and
       refreshing every pin and rebuilding the scene's tile fields on that is a
       long frame right as the reader is scrolling.

       It used to skip whenever the width was unchanged, and that also swallowed
       every real change of height: a tablet's split screen, a desktop browser's
       device mode resized by its frame. The hero's pin writes its height into
       the page in pixels when it is refreshed, so without one the pinned hero
       kept the old, shorter height and the fixed footer showed through the gap
       under it — reported at 801x698. The bars never change `lvh`; a real
       resize does. */
    const onlyBars = nextWidth === viewportWidth && nextLarge === viewportLarge;
    if (isTouch() && onlyBars) return;

    viewportWidth = nextWidth;
    viewportLarge = nextLarge;
    ScrollTrigger.refresh();
  }, 200),
);

/* THE SAME CHECK, TAKEN WHILE SCROLLING — in case the resize never arrived.

   Everything above hangs on a resize event, and a resize that is missed leaves
   every pin at the old screen's height in pixels: the hero stops short of the
   bottom of the window and the fixed footer shows through under it. Reported
   again at 1208x698 after the listener was fixed, so it is not enough to be
   right about the event; the page has to notice the screen changed on its own.
   Reading one fixed box every quarter second while the reader scrolls is
   nothing, and the first scroll after any change of size re-measures. Bars
   alone still do not count: `lvh` does not move with them. */
let lastCheck = 0;
window.addEventListener(
  'scroll',
  () => {
    const now = performance.now();
    if (now - lastCheck < 250) return;
    lastCheck = now;
    const nextWidth = window.innerWidth;
    const nextLarge = largeHeight();
    if (nextWidth === viewportWidth && nextLarge === viewportLarge) return;
    viewportWidth = nextWidth;
    viewportLarge = nextLarge;
    ScrollTrigger.refresh();
  },
  { passive: true },
);
