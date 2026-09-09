import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Three jobs, and none of them touches the scroll:
 *
 *   change    the sticky screen holds every category stacked on top of one
 *             another and the scroll crossfades between them in place. Nothing
 *             travels: the copy and the artwork are one layer per category and
 *             the whole layer changes over. An earlier cut carried each block
 *             up the window with the scroll and crossfaded only the ground
 *             behind it; that is gone with the layout it dressed.
 *
 *   outro     the join below it: the whole screen dissolves as Two ways in is
 *             pulled up over it.
 *
 * The join ABOVE the section is not here. It belongs to Overclock's pin — this
 * section is pulled up underneath it and dissolved into, rather than arriving
 * under anything of its own — so it lives with the pin, in
 * src/scripts/overclock.ts. `--cat-join` in WorkCategories.astro is the one
 * number the two sides share.
 *
 * What is deliberately not here is a pin. Sticky is the browser holding an
 * element still inside a scroll it is not otherwise touching, which is exactly
 * what this section wants and is why nothing here takes the scrollbar from the
 * reader.
 *
 * The layout stands up without any of this: the sticking is CSS, and a script
 * that never runs leaves the first category on the screen and the rest unpainted.
 *
 * Returns a cleanup function.
 */
export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const panels = gsap.utils.toArray<HTMLElement>('[data-cat-panel]', section);
  const screens = gsap.utils.toArray<HTMLElement>('[data-cat-screen]', section);
  if (panels.length < 2 || screens.length !== panels.length) return () => {};

  const reduced = prefersReducedMotion();
  const cleanups: Array<() => void> = [];

  // --- The change ----------------------------------------------------------
  /**
   * Each step in the track is one category's worth of scroll, and its top
   * reaching the top of the window is the moment that category is the screen.
   * So the crossfade is measured backwards from there.
   *
   * The change is a handover in two halves, not a crossfade: the category
   * leaving goes first, and the one arriving comes in after it has gone.
   *
   * A crossfade was what stood here and it could not work. These layers have
   * no ground of their own — the section's black is the ground, and a screen
   * is a shot on the right and some words on the left over it. Stacked
   * transparencies do not replace each other, they add up: fading one in over
   * another left both sets of words on the page, and by the fifth category
   * there were five headlines printed on top of one another. Even done
   * properly, in opposite directions at once, the middle of a crossfade is two
   * headlines at half strength, which is the same illegibility with a
   * shorter run.
   *
   * So: out over the first 45%, a beat of bare ground, in over the last 45%.
   * The ground is one flat black, so a moment with nothing on it reads as a
   * pause between two states rather than as a hole.
   *
   * Measured at 1440x900: 190px out, 42px of black, 190px in, and 342px of
   * the step left over with the category simply standing there.
   */
  const START = 'top 55%';
  const END = 'top 8%';

  /** Where the two halves sit inside that stretch. */
  const OUT = 0.45;
  const IN = 0.55;

  for (let i = 1; i < panels.length; i += 1) {
    const panel = panels[i];
    const screen = screens[i];
    const leaving = screens[i - 1];
    if (!panel || !screen || !leaving) continue;

    if (reduced) {
      /* A cut rather than a crossfade, in the middle of the window the fade
         would have used. Each category still gets its own screen — that is
         content, not decoration — it just arrives without being animated. */
      const swap = ScrollTrigger.create({
        trigger: panel,
        start: 'top 40%',
        onEnter: () => gsap.set([leaving, screen], { autoAlpha: gsap.utils.wrap([0, 1]) }),
        onLeaveBack: () => gsap.set([leaving, screen], { autoAlpha: gsap.utils.wrap([1, 0]) }),
      });

      cleanups.push(() => swap.kill());
      continue;
    }

    /* This renders on creation, and has to: it is what parks the screen at 0 in
       step with the stylesheet, so the section looks the same before this file
       runs and after. */
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: panel,
        start: START,
        end: END,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    /* The one leaving. `immediateRender: false` — its resting state is on, and
       the stylesheet already says so; rendering this at build would switch off
       whichever category the section is currently showing. */
    tl.fromTo(
      leaving,
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: OUT, ease: 'none', immediateRender: false },
      0,
    );

    /* And the one arriving. This one does render on creation, and has to: it
       is what parks the screen at 0 in step with the stylesheet, so the
       section looks the same before this file runs and after. */
    tl.fromTo(screen, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 - IN, ease: 'none' }, IN);

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
    });
  }

  // --- The outro -----------------------------------------------------------
  /**
   * The whole sticky screen dissolves as Two ways in arrives over it — artwork
   * and copy together, because they are one layer now and neither of them
   * scrolls away by itself. In the travelling cut this faded the ground alone
   * and left the headline to leave by being scrolled off the top; there is
   * nothing to scroll off any more, so a screen that did not fade would simply
   * still be there, at full strength, underneath the next section.
   *
   * Both ends sit inside `--work-outro`, the hold this section buys at its
   * foot: the last category arrives, is held still and legible for a beat, and
   * only then starts to go. Two ways in's title crosses into the window just as
   * that begins, so the reader is watching the next section arrive for the whole
   * of the fade — which makes the join read as direct rather than as a section
   * winding down.
   *
   * Linear rather than eased. An ease-in spends its first half doing almost
   * nothing, which against a beat that has just ended reads as a second pause.
   */
  const twoSection = document.querySelector<HTMLElement>('[data-two]');
  const dissolve = section.querySelector<HTMLElement>('[data-cat-dissolve]');

  if (!reduced && dissolve && twoSection) {
    const sink = gsap.to(dissolve, {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: twoSection,
        start: 'top 76%',
        end: 'top 12%',
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    cleanups.push(() => {
      sink.scrollTrigger?.kill();
      sink.kill();
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
