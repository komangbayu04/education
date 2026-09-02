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
 * Order: the title, then the two stages, then the "both models include"
 * label, the iconed cells, and the coverage note — reading order, top to
 * bottom, left to right.
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
  /* The "both models include" cells. Still `data-two-ritual` — the attribute
     outlived the pills it was named for, and renaming it would touch the
     component's pre-reveal CSS for nothing. */
  const rituals = gsap.utils.toArray<HTMLElement>('[data-two-ritual]', section);
  const pick = (name: string) => section.querySelector<HTMLElement>(`[data-two-reveal="${name}"]`);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: {
      trigger: section,
      /* A little before the section arrives, so the reveal is already under
         way by the time it is properly on screen.

         The exception is the one section the scene's pull lands on. That one
         is dragged up underneath the pinned scene (`data-scene-pulled` — see
         hero.ts) and is covered until the pin lets go, so a viewport-relative
         start fires while nobody can see it and `once: true` spends it: the
         section then appears already finished. For that section, its top
         reaching the top of the viewport IS the moment it becomes visible.

         Which section that is has to be asked, not assumed. This used to
         switch on the attribute merely existing anywhere on the page, and it
         was written when this was the section the pull landed on. Work
         categories sits between the scene and this one now, so the attribute
         is still there but the reasoning no longer applies here — and this
         section was waiting for its top to reach the top of the screen when
         most of it was already in view, which is why its copy and cards were
         missing under a photograph that had clearly arrived. */
      start: () => {
        const marker = document.querySelector('[data-scene-pulled]');
        return marker?.nextElementSibling === section ? 'top top' : 'top 90%';
      },
      once: true,
      invalidateOnRefresh: true,
    },
  });

  const title = pick('title');
  if (title) tl.fromTo(title, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);

  if (cards.length) {
    tl.fromTo(
      cards,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.85, stagger: 0.12 },
      0.16,
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

  const details = pick('details');
  if (details) tl.fromTo(details, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.66);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
