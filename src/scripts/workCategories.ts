import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Two jobs, and only one of them is motion:
 *
 *   reveal     a one-shot entrance the first time the section scrolls in —
 *              same contract as journal.ts / twoWays.ts: not scrubbed, not
 *              pinned, `once: true`, because the handover into this section is
 *              plain document scroll and nothing here may hold the scrollbar.
 *
 *   accordion  clicking a row opens its strip and closes whichever was open.
 *              This half runs under reduced motion too — it is the section's
 *              only way to its own content, so it is behaviour, not decoration.
 *              All it does is move `data-open`; the opening itself is a CSS
 *              transition on that attribute, which is also what makes the
 *              reduced-motion case free.
 *
 * The panels are closed from CSS (`html[data-js='true'] .cat__panel`) rather
 * than from here, so there is no frame on first paint where seven open strips
 * are on screen before this file runs. Without JS they stay open, which is the
 * whole section reachable by scroll alone.
 *
 * Returns a cleanup function.
 */
export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const reduced = prefersReducedMotion();
  const items = gsap.utils.toArray<HTMLElement>('[data-cat-item]', section);
  const cleanups: Array<() => void> = [];

  // --- Accordion ----------------------------------------------------------
  /** The open row, or null. One at a time: two open strips put the second one
   *  most of a screen below the row that opened it. */
  let open: HTMLElement | null = null;

  /* The panel's own content height, written inline. The component's CSS holds
     it at max-height 0 and owns the easing; this is only the number.

     Inline, and not a `[data-open]` rule in the stylesheet, because that rule
     never animated: measured two seconds after the click with the section in
     view, the panel was still at 0, while the identical value set inline
     transitioned correctly with the same transition in place. See the note by
     the closed state in WorkCategories.astro for the other approach that
     failed before this one. */
  /* This file does not size the panel. `data-open` is the whole state: the
     component's CSS holds the panel at max-height 0 and opens it to a ceiling
     on that attribute, so there is nothing to measure here and nothing to
     re-measure when the strip reflows, the viewport changes, or an image
     finally loads. */
  const close = (item: HTMLElement) => {
    item.removeAttribute('data-open');
    item.querySelector('[data-cat-toggle]')?.setAttribute('aria-expanded', 'false');
    if (open === item) open = null;
  };

  const openItem = (item: HTMLElement) => {
    if (open && open !== item) close(open);
    item.setAttribute('data-open', '');
    item.querySelector('[data-cat-toggle]')?.setAttribute('aria-expanded', 'true');
    open = item;
  };

  items.forEach((item) => {
    const toggle = item.querySelector<HTMLElement>('[data-cat-toggle]');
    if (!toggle) return;

    const controller = new AbortController();
    toggle.addEventListener(
      'click',
      () => {
        if (item.hasAttribute('data-open')) close(item);
        else openItem(item);
        // The page below just moved by the height of a strip; every trigger
        // under it is measuring against the old layout until this runs.
        ScrollTrigger.refresh();
      },
      { signal: controller.signal },
    );
    cleanups.push(() => controller.abort());
  });

  // --- Reveal -------------------------------------------------------------
  // The CSS pre-reveal state is neutralised under the same query, so the
  // section already renders finished and a timeline here would only re-do it.
  if (!reduced) {
    const heading = section.querySelector<HTMLElement>('[data-cat-reveal]');

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: { trigger: section, start: 'top 75%', once: true },
    });

    if (heading) {
      tl.fromTo(heading, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9 }, 0);
    }

    if (items.length) {
      // Down the list, one after another — the rows are a list and a list
      // arrives in order.
      tl.fromTo(
        items,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.06 },
        0.2,
      );
    }

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
