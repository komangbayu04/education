import { gsap, ScrollTrigger, SplitText } from './gsap';
import { prefersReducedMotion } from './utils/device';

/* --- Stage motion, from the Figma animation (node 2568:27220) -------------
   `get_motion_context` returned a 2s looping timeline with three nodes.
   The title is kept as the existing SplitText reveal (user instruction).

   Figma keyframes (2s timeline, linear, loop):

   Sprint (2568:27222):
     0%     → y: +419      (below viewport)
     0.75%  → y: +419      (brief hold)
     20.05% → y: -60       (arrived, slightly past resting)
     24.35% → y: -99       (final = arrived + 39px parallax drift)

   Retainer (2568:27240):
     0%     → y: +549      (further below)
     4.05%  → y: +549      (delayed start)
     20.3%  → y: -51       (arrived)
     24.35% → y: -90       (final = arrived + 39px drift)

   On the page, "resting position" = y: 0 (the CSS grid row). The Figma
   values are relative to a Figma origin, so we normalise: the stage starts
   at +startY, slides to 0, then drifts to −driftEnd. The total scroll
   distance maps to the 24.35% active window of the Figma timeline.

   Each stage gets its own scrubbed GSAP timeline with keyframes at the
   normalised Figma positions. */

/* Below 48rem the grid stacks to one column — parallax dropped. */
const STAGE_MQ = '(min-width: 48rem)';

/* Reference width. Everything scales proportionally below this. */
const REF_WIDTH = 1440;
const vwScale = (): number => Math.min(window.innerWidth, REF_WIDTH) / REF_WIDTH;

/* Per-stage config derived from the Figma keyframes. Percentages are
   normalised to the 0–24.35% active window (÷ 0.2435). */
const STAGES: Array<{
  startY: number;
  holdEnd: number;
  arriveAt: number;
  driftY: number;
}> = [
  {
    startY: 419,           // starting offset below grid row
    holdEnd: 0.031,        // 0.75 / 24.35 — brief hold
    arriveAt: 0.823,       // 20.05 / 24.35 — arrives at grid row
    driftY: -39,           // -99 − -60 — continued parallax after arriving
  },
  {
    startY: 549,           // further below
    holdEnd: 0.166,        // 4.05 / 24.35 — delayed start
    arriveAt: 0.834,       // 20.3 / 24.35 — arrives at grid row
    driftY: -39,           // -90 − -51
  },
];

/**
 * Two ways in (chapter 7).
 *
 * Title: scrubbed SplitText line reveal (kept as-is).
 * Stages: scrubbed slide-in from below + parallax drift, matching the Figma
 *   animation at node 2568:27220. Each stage starts translated far below its
 *   grid row and rises as the section scrolls in — Retainer lagging Sprint.
 *   After arriving, both continue a small upward drift (parallax). The whole
 *   motion is scrubbed to the scroll, runs backwards on the way up.
 * Include row + details: one-shot reveal on a fixed timeline.
 *
 * Returns a cleanup function.
 */
export function initTwoWays(): () => void {
  const section = document.querySelector<HTMLElement>('[data-two]');
  if (!section) return () => {};
  if (prefersReducedMotion()) return () => {};

  const cards = gsap.utils.toArray<HTMLElement>('[data-two-card]', section);
  const rituals = gsap.utils.toArray<HTMLElement>('[data-two-ritual]', section);
  const pick = (name: string) => section.querySelector<HTMLElement>(`[data-two-reveal="${name}"]`);
  const inner = section.querySelector<HTMLElement>('.two__inner') ?? section;

  const oneShotStart = (): string => {
    const marker = document.querySelector('[data-scene-pulled]');
    return marker?.nextElementSibling === section ? 'top top' : 'top 90%';
  };

  const cleanups: Array<() => void> = [];

  // --- Title: scrubbed line reveal (unchanged) ------------------------
  const title = pick('title');
  if (title) {
    const split = SplitText.create(title, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) => {
        gsap.set(title, { opacity: 1 });
        return gsap.fromTo(
          self.lines,
          { yPercent: 120 },
          {
            yPercent: 0,
            ease: 'none',
            stagger: 0.4,
            scrollTrigger: {
              trigger: inner,
              start: 'top bottom',
              end: 'top 42%',
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      },
    });
    cleanups.push(() => split.revert());
  }

  // --- Stages: scrubbed slide-in + parallax drift ---------------------
  if (cards.length) {
    const mm = gsap.matchMedia();
    mm.add(STAGE_MQ, () => {
      cards.forEach((card, i) => {
        const cfg = STAGES[i];
        if (!cfg) return;

        /* Each stage gets its own timeline scrubbed to one shared scroll
           window. The keyframes within the timeline reproduce the Figma
           timing: hold → slide up → drift. */
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: inner,
            start: 'top bottom',
            end: 'top 20%',
            scrub: true,
            invalidateOnRefresh: true,
          },
        });

        /* Phase 1: Start below, hold there (Retainer holds longer). */
        tl.fromTo(
          card,
          { y: () => cfg.startY * vwScale(), opacity: 0 },
          { y: () => cfg.startY * vwScale(), opacity: 0, duration: cfg.holdEnd, ease: 'none' },
          0,
        );

        /* Phase 2: Slide up to the grid row while fading in. This is the
           main entrance — the stage rises from far below to its resting
           position. power2.out gives a slight decel feel even within the
           linear scrub, making the arrival feel cushioned. */
        tl.to(
          card,
          {
            y: 0,
            opacity: 1,
            duration: cfg.arriveAt - cfg.holdEnd,
            ease: 'power2.out',
          },
          cfg.holdEnd,
        );

        /* Phase 3: Parallax drift — continued upward movement after
           arriving. Linear because this is pure scroll-rate difference. */
        tl.to(
          card,
          {
            y: () => cfg.driftY * vwScale(),
            duration: 1 - cfg.arriveAt,
            ease: 'none',
          },
          cfg.arriveAt,
        );
      });
    });
    cleanups.push(() => mm.revert());
  }

  // --- Include row + details: one-shot reveal -------------------------
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: inner, start: oneShotStart, once: true, invalidateOnRefresh: true },
  });

  const includedTitle = pick('included-title');
  if (includedTitle) {
    tl.fromTo(includedTitle, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.1);
  }

  if (rituals.length) {
    tl.fromTo(
      rituals,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.07 },
      0.2,
    );
  }

  const details = pick('details');
  if (details) tl.fromTo(details, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 0.36);

  cleanups.push(() => {
    tl.scrollTrigger?.kill();
    tl.kill();
  });

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
