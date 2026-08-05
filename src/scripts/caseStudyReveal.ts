import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/** Roughly the cell size, in px. The grid rounds to whole cells from here. */
const CELL = 52;
/** Cap, so a very tall section can't spawn a thousand nodes. */
const MAX_TILES = 260;

/**
 * Case-study pixel reveal.
 *
 * Each marked section is covered by a curtain of squares in its own ground
 * colour, and scrolling the section into view clears them in random order. It
 * is the site's pixel language — the same squares the home page's chapters
 * hand over with — used here as an entrance, because the case study was
 * arriving flat: everything simply existed as you got to it.
 *
 * Scrubbed rather than fired once: the clearing is tied to how far the section
 * has come up the viewport, so it reads as a consequence of scrolling rather
 * than an animation that happens near it.
 *
 * The curtain is built in JS and never exists without it, so a page with no
 * scripts shows every section plainly rather than behind a cover that will
 * never lift. Same under reduced motion.
 */
export function initCaseStudyReveal(): () => void {
  const sections = gsap.utils.toArray<HTMLElement>('[data-cs-reveal]');
  if (!sections.length || prefersReducedMotion()) return () => {};

  const triggers: ScrollTrigger[] = [];
  const curtains: HTMLElement[] = [];

  sections.forEach((section) => {
    const width = section.offsetWidth;
    const height = section.offsetHeight;
    if (!width || !height) return;

    let cols = Math.max(4, Math.round(width / CELL));
    let rows = Math.max(3, Math.round(height / CELL));

    // Keep the node count sane on the tall sections by growing the cells
    // instead of the grid.
    while (cols * rows > MAX_TILES && cols > 4 && rows > 3) {
      cols = Math.max(4, Math.round(cols * 0.85));
      rows = Math.max(3, Math.round(rows * 0.85));
    }

    /* The section's own colour, so the curtain is invisible as a thing — what
       reads is the content arriving, not a grey sheet lifting. Sections that
       don't paint a background inherit the page's. */
    const own = getComputedStyle(section).backgroundColor;
    const ground =
      own && own !== 'rgba(0, 0, 0, 0)' && own !== 'transparent'
        ? own
        : getComputedStyle(document.body).backgroundColor;

    const curtain = document.createElement('div');
    curtain.className = 'cs-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.style.cssText = `position:absolute;inset:0;z-index:5;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);pointer-events:none;`;

    const tiles = Array.from({ length: cols * rows }, () => {
      const tile = document.createElement('span');
      tile.style.background = ground;
      return tile;
    });
    curtain.append(...tiles);

    // The curtain has to be able to sit over the section it covers.
    if (getComputedStyle(section).position === 'static') section.style.position = 'relative';
    section.appendChild(curtain);
    curtains.push(curtain);

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        // A section takes about 70% of the viewport's height of scrolling to
        // clear, up from 45%: the squares were going before they had been
        // seen. The scrub's own lag is up with it, so a fast flick still
        // resolves rather than snapping.
        end: 'top 25%',
        scrub: 0.7,
      },
    });

    timeline.to(tiles, {
      opacity: 0,
      duration: 0.4,
      ease: 'none',
      stagger: { amount: 0.6, from: 'random' },
      // Once a section is open it stays open — the curtain would otherwise
      // close again on the way back up, which nobody asked for.
      onComplete: () => curtain.remove(),
    });

    if (timeline.scrollTrigger) triggers.push(timeline.scrollTrigger);
  });

  return () => {
    triggers.forEach((trigger) => trigger.kill());
    curtains.forEach((curtain) => curtain.remove());
  };
}
