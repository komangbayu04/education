import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Footer quote — a single one-shot reveal, fired the first time the quote
 * itself scrolls into view.
 *
 * Same contract as the other post-scene sections: not scrubbed, not pinned,
 * `once: true`. Triggered on the figure rather than the footer: the footer is
 * tall (the overlay and the photograph) and firing from its top would start
 * the tween before the copy is on screen.
 *
 * Only the copy and the portrait animate. The overlay is a structural
 * edge and stays static.
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

  const trigger = section.querySelector<HTMLElement>('.ft__figure') ?? section;

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger, start: 'top 80%', once: true },
  });

  tl.fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
