import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Credibility (chapter 6) — a single one-shot reveal, fired the first time the
 * section scrolls into view.
 *
 * Explicitly NOT scrubbed and NOT pinned: the handover out of the scene into
 * this section is plain document scroll, so nothing here may hold the
 * scrollbar or play backwards. The scene's exit field lands in this section's
 * own ground colour, so by the time the pin releases the join is already
 * covered — this reveal is what happens next, not part of that handover. `once: true` means the timeline runs to its end and the
 * trigger kills itself; scrolling back up leaves the section finished.
 *
 * Order: frame draws (column rules, then the axis through the centre), the
 * ring appears, then the copy — outside in, so the structure exists before
 * anything is written into it.
 *
 * Returns a cleanup function.
 */
export function initCredibility(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cred]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const rules = gsap.utils.toArray<HTMLElement>('.cred__rules span', section);
  const axis = section.querySelector<HTMLElement>('[data-cred-axis]');
  const circle = section.querySelector<HTMLElement>('[data-cred-circle]');
  const nodes = gsap.utils.toArray<HTMLElement>('[data-cred-node]', section);
  const pick = (name: string) => section.querySelector<HTMLElement>(`[data-cred-reveal="${name}"]`);

  /**
   * Everything animated with `y` here is also positioned by CSS that changes
   * across the 61.25rem breakpoint — .cred__intro and .cred__core carry a
   * centring translate on the ring layout and none (or a different one) on the
   * mobile fan. GSAP writes its result as an inline `transform`, and an inline
   * style outranks any media query, so the desktop translate stayed clamped on
   * after the viewport narrowed: the intro sat half its own width to the left,
   * off the screen (measured: glyphs starting at -155px in a 390px viewport).
   *
   * Clearing the transform once the reveal has finished hands positioning back
   * to CSS, which is the only thing that knows about the breakpoint. Only the
   * transform, and only these elements: their pre-reveal CSS sets opacity
   * alone, so nothing is undone by this. The rules, axis and circle are left
   * out on purpose — their pre-reveal state *is* a transform, and clearing it
   * would put them straight back to hidden.
   */
  const settled: HTMLElement[] = [];
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: {
      trigger: section,
      /* Normally: a little before the section reaches the middle of the
         screen, so the reveal is already under way as it arrives.
         When the scene above is pinned, this section is pulled up underneath
         it (`data-scene-pulled` — see hero.ts) and is covered until the pin
         lets go. Measured against the viewport it would then be 28% of the way
         up the screen while nobody can see it, and `once: true` means it would
         be spent by the time the scene lifts: the section would appear already
         finished. Its top reaching the top of the viewport IS the moment it
         becomes visible, so that is where the reveal starts instead. */
      start: () =>
        document.querySelector('[data-scene-pulled]') ? 'top top' : 'top 72%',
      once: true,
      invalidateOnRefresh: true,
    },
    onComplete: () => gsap.set(settled, { clearProps: 'transform' }),
  });

  const title = pick('title');
  if (title) settled.push(title);
  if (title) tl.fromTo(title, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);

  if (rules.length) {
    tl.to(rules, { scaleY: 1, duration: 1.1, ease: 'power2.inOut', stagger: 0.06 }, 0.1);
  }

  if (axis) {
    // scaleX only — the -50% centring translate has to survive, so it's
    // restated here rather than left to GSAP's transform parsing.
    tl.fromTo(
      axis,
      { scaleX: 0, xPercent: -50 },
      { scaleX: 1, xPercent: -50, duration: 1, ease: 'power2.inOut' },
      0.25,
    );
  }

  if (circle) {
    tl.fromTo(circle, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.1 }, 0.3);
  }

  // Mobile fan only — display:none above 61.25rem, where the ring's circle
  // and axis do this job instead. Fading it is harmless there.
  const wires = pick('wires');
  if (wires) tl.fromTo(wires, { opacity: 0 }, { opacity: 1, duration: 0.9 }, 0.3);

  const intro = pick('intro');
  if (intro) settled.push(intro);
  if (intro) tl.fromTo(intro, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8 }, 0.55);

  const core = pick('core');
  if (core) settled.push(core);
  if (core) tl.fromTo(core, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7 }, 0.65);

  if (nodes.length) {
    // Nodes carry a positioning transform of their own (see the
    // .cred__node--left/right/top rules), so this fades them only — animating
    // y here would fight that transform and land them off their anchor.
    tl.to(nodes, { opacity: 1, duration: 0.55, stagger: 0.07 }, 0.7);
  }

  const outro = pick('outro');
  if (outro) settled.push(outro);
  if (outro) tl.fromTo(outro, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 1.05);

  const cta = pick('cta');
  if (cta) settled.push(cta);
  if (cta) tl.fromTo(cta, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7 }, 1.15);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}
