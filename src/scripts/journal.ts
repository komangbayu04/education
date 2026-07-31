import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * From the Journal (chapter 9) — a single one-shot reveal, fired the first
 * time the section scrolls into view.
 *
 * Same contract as credibility.ts / twoWays.ts / testimonials.ts: explicitly
 * NOT scrubbed and NOT pinned, because the handover into this section is plain
 * document scroll and nothing here may hold the scrollbar or play backwards.
 * `once: true` means the timeline runs to its end and the trigger kills
 * itself; scrolling back up leaves the section finished.
 *
 * Returns a cleanup function.
 */
export function initJournal(): () => void {
  const section = document.querySelector<HTMLElement>('[data-jr]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const heading = section.querySelector<HTMLElement>('[data-jr-reveal]');
  const cards = gsap.utils.toArray<HTMLElement>('[data-jr-card]', section);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', once: true },
  });

  if (heading) {
    tl.fromTo(heading, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);
  }

  if (cards.length) {
    tl.fromTo(
      cards,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.85, stagger: 0.1 },
      0.15,
    );
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
