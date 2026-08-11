import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Two ways in (chapter 7) — a single one-shot reveal, fired the first time
 * the section scrolls into view. Same contract as credibility.ts: explicitly
 * NOT scrubbed and NOT pinned, because the handover into this section is
 * plain document scroll and nothing here may hold the scrollbar or play
 * backwards. `once: true` means the timeline runs to its end and the trigger
 * kills itself; scrolling back up leaves the section finished.
 *
 * Order: the left column's heading and copy, then the two cards, then the
 * "both models include" rows, then the note under the cards, the disclosure,
 * and the ask — reading order, left to right, top to bottom.
 *
 * Every `[data-two-reveal]` name below has to be animated by this file: the
 * component's CSS parks all of them at opacity 0 when JS is live, so a hook
 * added to the markup and not picked up here is invisible for good.
 *
 * Returns a cleanup function.
 */
export function initTwoWays(): () => void {
  const section = document.querySelector<HTMLElement>('[data-two]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const cards = gsap.utils.toArray<HTMLElement>('[data-two-card]', section);
  /* The "both models include" rows. Still `data-two-ritual` — the attribute
     outlived the pills it was named for, and renaming it would touch the
     component's pre-reveal CSS for nothing. */
  const rituals = gsap.utils.toArray<HTMLElement>('[data-two-ritual]', section);
  const pick = (name: string) => section.querySelector<HTMLElement>(`[data-two-reveal="${name}"]`);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: {
      trigger: section,
      /* Normally: a little before the section reaches the middle of the
         screen, so the reveal is already under way as it arrives.
         When the scene above is pinned, this section is pulled up underneath
         it (`data-scene-pulled` — see hero.ts) and is covered until the pin
         lets go. Measured against the viewport it would then be 28% of the
         way up the screen while nobody can see it, and `once: true` means it
         would be spent by the time the scene lifts: the section would appear
         already finished. Its top reaching the top of the viewport IS the
         moment it becomes visible, so that is where the reveal starts.

         This matters here now that Credibility is out of the page — this is
         the section the pull lands on. credibility.ts carries the same switch
         for the same reason. */
      start: () => (document.querySelector('[data-scene-pulled]') ? 'top top' : 'top 72%'),
      once: true,
      invalidateOnRefresh: true,
    },
  });

  const title = pick('title');
  if (title) tl.fromTo(title, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);

  const intro = pick('intro');
  if (intro) tl.fromTo(intro, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8 }, 0.12);

  if (cards.length) {
    tl.fromTo(
      cards,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.85, stagger: 0.12 },
      0.2,
    );
  }

  const includedTitle = pick('included-title');
  if (includedTitle) {
    tl.fromTo(includedTitle, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.42);
  }

  if (rituals.length) {
    tl.fromTo(
      rituals,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.07 },
      0.5,
    );
  }

  const note = pick('note');
  if (note) tl.fromTo(note, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.6);

  /* The disclosure animates as one block, open or closed — its body is inside
     it, so a separate hook on the copy would fight <details>' own hiding. */
  const details = pick('details');
  if (details) tl.fromTo(details, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.66);

  const ctaTitle = pick('cta-title');
  if (ctaTitle) {
    tl.fromTo(ctaTitle, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, 0.7);
  }

  const ctaCopy = pick('cta-copy');
  if (ctaCopy) {
    tl.fromTo(ctaCopy, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.78);
  }

  const cta = pick('cta');
  if (cta) tl.fromTo(cta, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.86);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
