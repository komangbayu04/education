import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/** Roughly the cell size, in px. The grid rounds to whole cells from here. */
const CELL = 52;
/**
 * Cap, so a very tall section can't spawn a thousand nodes.
 *
 * 150, down from 260. Every tile in the section being revealed has its opacity
 * written on every frame of the scroll that reveals it, and each one is an
 * opaque square the compositor then has to paint over whatever is underneath —
 * which on this page includes sections carrying four videos. At 260 a reveal
 * was dropping frames, and a dropped frame is not a cosmetic problem here:
 * Lenis interpolates the scroll position between frames, so a long frame reads
 * as the page lurching or slipping backwards rather than as jank.
 *
 * The squares are random and their whole job is to be a texture, so a coarser
 * grid costs the effect nothing you can name.
 */
const MAX_TILES = 150;
/**
 * How far ahead of the viewport a section's curtain is built.
 *
 * It has to be up before the reveal starts, and the reveal starts the instant
 * the section's top edge appears — so this is measured against a section that
 * is still entirely below the fold. Wide enough that a fast scroll doesn't
 * arrive first; see `cover` for what happens when it does anyway.
 */
const AHEAD = '800px';

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
 *
 * Built one section ahead rather than all at once. Six curtains up front is
 * 1276 nodes standing in the document for the whole visit, most of them
 * covering sections nobody has reached — and each one is a live scrubbed
 * timeline besides. Now a curtain exists only from shortly before its section
 * arrives until the moment it has cleared.
 */
export function initCaseStudyReveal(): () => void {
  const sections = gsap.utils.toArray<HTMLElement>('[data-cs-reveal]');
  if (!sections.length || prefersReducedMotion()) return () => {};

  const triggers: ScrollTrigger[] = [];
  /** The ones that build a curtain, as opposed to the ones that clear it. */
  const builders: ScrollTrigger[] = [];
  const curtains: HTMLElement[] = [];

  const cover = (section: HTMLElement) => {
    /* Already on screen — which happens on a fast scroll, and on a reload part
       way down the page. Covering it now would put a sheet over content that
       has been visible for a frame already, and that flash is worse than the
       entrance is good. The section simply arrives plainly, as it does with no
       JS at all. */
    if (section.getBoundingClientRect().top < window.innerHeight) return;

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
      // close again on the way back up, which nobody asked for. The trigger
      // goes with it: there is nothing left for it to scrub.
      onComplete: () => {
        curtain.remove();
        timeline.scrollTrigger?.kill();
      },
    });

    if (timeline.scrollTrigger) triggers.push(timeline.scrollTrigger);
  };

  /* What builds them, one section ahead.
   *
   * ScrollTrigger rather than an IntersectionObserver, though this is exactly
   * the job an observer is for: everything else on this page is already driven
   * from ScrollTrigger's tick, which runs off Lenis, and an observer would add
   * a second clock reporting the same scroll a beat apart. `once` retires each
   * one the moment it has fired.
   *
   * The first screenful is covered synchronously instead, because the reveal's
   * own trigger starts the instant the section's top edge appears and a
   * builder scheduled for the next tick can lose that race. */
  const reach = window.innerHeight + parseInt(AHEAD, 10);

  sections.forEach((section) => {
    if (section.getBoundingClientRect().top < reach) {
      cover(section);
      return;
    }

    builders.push(
      ScrollTrigger.create({
        trigger: section,
        start: `top bottom+=${AHEAD}`,
        once: true,
        onEnter: () => cover(section),
      }),
    );
  });

  return () => {
    builders.forEach((builder) => builder.kill());
    triggers.forEach((trigger) => trigger.kill());
    curtains.forEach((curtain) => curtain.remove());
  };
}
