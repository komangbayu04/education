import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

let instances: HTMLElement[] = [];
let current = 1;

/**
 * Updates every `<Timeline />` instance on the page to the given chapter —
 * moves each instance's dot to the target rule and toggles `.is-active`
 * (plain class, not an attribute selector — see Timeline.astro for why).
 *
 * Exported rather than kept private because two different things drive it,
 * depending on width:
 *   - ≥1200px, hero.ts's pinned handover, mid-scrub (there is no independent
 *     scroll position to watch from out here — see its docstring)
 *   - <1200px, the plain ScrollTriggers set up in initTimeline below, since
 *     that pin never runs at those widths
 * The two are mutually exclusive by media query, so they can never fight.
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
 * Finds every rendered `<Timeline />` instance, sets the resting state, and —
 * below the pin gate — wires up the scroll triggers that advance it.
 *
 * That second part matters: hero.ts's handover, which is what moves the marker
 * on desktop, is built inside a `(min-width: 1200px)` matchMedia. Below that it
 * never runs, so without these triggers the marker would render on mobile and
 * then sit frozen on slot 1 forever — worse than not showing it at all.
 *
 * Returns a cleanup function.
 */
export function initTimeline(): () => void {
  instances = gsap.utils.toArray<HTMLElement>('[data-timeline]');
  if (!instances.length) return () => {};

  current = 1;
  setActiveChapter(1, false);

  const mm = gsap.matchMedia();

  mm.add('(max-width: 1199px)', () => {
    const sections = gsap.utils.toArray<HTMLElement>('[data-chapter-section]');

    const triggers = sections.map((section) => {
      const chapter = Number(section.dataset.chapterSection);
      // The marker has 4 slots for 5 sections: hero and Showcase share slot 1,
      // so everything past Showcase shifts down by one. See Timeline.astro.
      const slot = chapter <= 2 ? 1 : chapter - 1;

      return ScrollTrigger.create({
        trigger: section,
        // Mid-viewport, so the marker turns over as a section takes the screen
        // rather than as its first pixel appears.
        start: 'top 60%',
        end: 'bottom 40%',
        onEnter: () => setActiveChapter(slot, true),
        onEnterBack: () => setActiveChapter(slot, true),
      });
    });

    return () => triggers.forEach((t) => t.kill());
  });

  return () => mm.revert();
}
