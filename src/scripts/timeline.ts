import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

let instances: HTMLElement[] = [];
let current = 1;

/**
 * Updates every `<Timeline />` instance on the page to the given chapter —
 * moves each instance's dot to the target rule and toggles `.is-active`
 * (plain class, not an attribute selector — see Timeline.astro for why).
 *
 * Exported because the one thing that drives it lives elsewhere: hero.ts's
 * pinned handover, mid-scrub, at every width (there is no independent scroll
 * position to watch from out here — see its docstring).
 */
export function setActiveChapter(chapter: number, animate: boolean): void {
  if (chapter === current && animate) return;
  current = chapter;

  instances.forEach((instance) => {
    const rules = gsap.utils.toArray<HTMLElement>('.timeline__rule', instance);
    const dot = instance.querySelector<HTMLElement>('[data-timeline-dot]');
    const target = rules.find((r) => Number(r.dataset.chapter) === chapter);
    if (!target) return;

    // Widths, read *before* the class flip. The rules animate their width with
    // a CSS transition, so every offsetLeft/offsetWidth taken straight after
    // the flip still describes the outgoing layout — which is what used to put
    // the dot a whole rule away from its target in the horizontal layout
    // (measured: 12px off). Only the two widths are needed; CSS stays the one
    // place they are defined.
    const activeWidth = (rules.find((r) => r.classList.contains('is-active')) ?? target).offsetWidth;
    const inactiveWidth = (rules.find((r) => !r.classList.contains('is-active')) ?? target)
      .offsetWidth;
    const gap = parseFloat(getComputedStyle(target.parentElement as HTMLElement).columnGap) || 0;

    rules.forEach((r) => r.classList.toggle('is-active', r === target));

    if (!dot) return;

    // Which way the rules are stacked decides which way the dot travels. Read
    // from the rendered layout rather than from a breakpoint, so the CSS in
    // Timeline.astro stays the only place that decision is made — and so a
    // stray offsetLeft (the rules are different widths, and right-aligned on
    // desktop) can never be mistaken for a horizontal layout.
    const vertical = rules.length < 2 || Math.abs(rules[1].offsetTop - rules[0].offsetTop) > 2;

    // Distance from the stack's own edge to the target rule's centre — each
    // instance measures its own layout, so this stays correct even though the
    // marker appears at a different size and position in every section.
    //
    // Vertical can be measured directly: the rules only ever animate their
    // width, so offsetTop is already final. Horizontal has to be derived from
    // the widths captured above, because every rule to the left of the target
    // ends up inactive and the target ends up active.
    const to = vertical
      ? { x: 0, y: target.offsetTop + target.offsetHeight / 2 }
      : { x: rules.indexOf(target) * (inactiveWidth + gap) + activeWidth / 2, y: 0 };

    if (animate && !prefersReducedMotion()) {
      gsap.to(dot, { ...to, duration: 0.5, ease: 'expo.out' });
    } else {
      gsap.set(dot, to);
    }
  });
}

/**
 * Finds every rendered `<Timeline />` instance and sets the resting state.
 *
 * The handover is no longer gated to desktop, so it is the only thing that
 * moves the marker; there is nothing width-specific left to set up here.
 *
 * Returns a cleanup function.
 */
export function initTimeline(): () => void {
  instances = gsap.utils.toArray<HTMLElement>('[data-timeline]');
  if (!instances.length) return () => {};

  current = 1;
  setActiveChapter(1, false);

  // Nothing to wire up: the pinned handover in hero.ts drives the marker at
  // every width now, calling setActiveChapter from its own onUpdate. The
  // per-section ScrollTriggers that used to cover <1200px would double-drive
  // it — and disagree, since they turn over mid-viewport while the handover
  // turns over as a chapter finishes fading in.
  return () => {};
}
