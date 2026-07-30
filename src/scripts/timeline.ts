import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

let instances: HTMLElement[] = [];
let current = 1;

/**
 * Updates every `<Timeline />` instance on the page to the given chapter —
 * moves each instance's dot to the target rule and toggles `.is-active`
 * (plain class, not an attribute selector — see Timeline.astro for why).
 *
 * Exported rather than kept private: chapters 1 (hero) → 2 (Showcase) → 3
 * (Overclock) are driven directly by hero.ts's own scroll handover, because
 * both transitions happen mid-scrub inside the same pin that already runs
 * the pixel reveal — there is no separate, independent scroll position to
 * watch from out here. See hero.ts's docstring for the full sequence.
 */
export function setActiveChapter(chapter: number, animate: boolean): void {
  if (chapter === current && animate) return;
  current = chapter;

  instances.forEach((instance) => {
    const rules = gsap.utils.toArray<HTMLElement>('.timeline__rule', instance);
    const dot = instance.querySelector<HTMLElement>('[data-timeline-dot]');
    const target = rules.find((r) => Number(r.dataset.chapter) === chapter);
    if (!target) return;

    rules.forEach((r) => r.classList.toggle('is-active', r === target));

    if (!dot) return;
    // Distance from the stack's own top to the target rule's centre — each
    // instance measures its own layout, so this stays correct even though
    // the marker appears at a different size/position in every section.
    const y = target.offsetTop + target.offsetHeight / 2;

    if (animate && !prefersReducedMotion()) {
      gsap.to(dot, { y, duration: 0.5, ease: 'expo.out' });
    } else {
      gsap.set(dot, { y });
    }
  });
}

/**
 * Finds every rendered `<Timeline />` instance and sets the resting state
 * (chapter 1). Returns a no-op cleanup — there are no ScrollTriggers created
 * here for it to tear down; hero.ts owns the one that actually drives this.
 */
export function initTimeline(): () => void {
  instances = gsap.utils.toArray<HTMLElement>('[data-timeline]');
  if (!instances.length) return () => {};

  current = 1;
  setActiveChapter(1, false);

  return () => {};
}
