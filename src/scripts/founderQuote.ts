import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Founder quote (chapter 10) — a single one-shot reveal, fired the first time
 * the section scrolls into view.
 *
 * Same contract as the other post-scene sections: not scrubbed, not pinned,
 * `once: true`.
 *
 * Only the copy and the portrait animate. The two pixel bands are deliberately
 * left static: the bottom one is the seam this section shares with the footer,
 * and animating a structural edge would read as the page still loading rather
 * than as an effect.
 *
 * Returns a cleanup function.
 */
export function initFounderQuote(): () => void {
  const section = document.querySelector<HTMLElement>('[data-quote]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const items = gsap.utils.toArray<HTMLElement>('[data-quote-reveal]', section);
  if (!items.length) return () => {};

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 70%', once: true },
  });

  tl.fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
