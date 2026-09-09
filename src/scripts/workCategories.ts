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
 *   handover  the join above the section. A black curtain rises from the foot
 *             of the window as the section arrives and then fades off it —
 *             see initWorkHandover.
 *
 *   outro     the join below it: the whole screen dissolves as Two ways in is
 *             pulled up over it.
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
   * About a third of the step, and the other two thirds are the hold. The
   * balance matters more here than it did in the travelling cut, because what
   * crossfades now is the whole layer — the words included. Two sets of words
   * at half strength on top of each other is not a dissolve, it is unreadable,
   * so the stretch where that is true has to be short and the stretch where
   * one category simply stands there has to be long. Measured at 1440x900:
   * 315px of change against 450px of hold.
   */
  const START = 'top 45%';
  const END = 'top 10%';

  for (let i = 1; i < panels.length; i += 1) {
    const panel = panels[i];
    const screen = screens[i];
    if (!panel || !screen) continue;

    if (reduced) {
      /* A cut rather than a crossfade, in the middle of the window the fade
         would have used. Each category still gets its own screen — that is
         content, not decoration — it just arrives without being animated. */
      const swap = ScrollTrigger.create({
        trigger: panel,
        start: 'top 40%',
        onEnter: () => gsap.set(screen, { autoAlpha: 1 }),
        onLeaveBack: () => gsap.set(screen, { autoAlpha: 0 }),
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

    tl.fromTo(screen, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, ease: 'none' }, 0);

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

  cleanups.push(initWorkHandover(section, reduced));

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}

/**
 * Overclock → Our work: a black curtain, rising and then gone.
 *
 * Black comes up from the foot of the window, covers it, and fades off to leave
 * the reader already inside the next section. It replaces a crossfade — the two
 * chapters used to dissolve into each other over the tail of Overclock's pin —
 * and it does a job the crossfade could not: for the length of the join there
 * are two chapters on the screen at once, Overclock's copy still legible at the
 * top and Our work's arriving under it, and a dissolve shows both of them at
 * half strength while a curtain shows neither.
 *
 * Both grounds are black, so the rise is not a shape moving across a picture —
 * it is the last of Overclock being taken away. What the reader sees is the
 * words going and the words arriving, with nothing in between.
 *
 * Driven off the arriving section rather than off Overclock's timeline, which
 * is why it is reliable. Overclock's sequence is scrubbed against a pin whose
 * release lands somewhere in the middle of it, so a position in that timeline
 * is only loosely a position on the page. This section's own top is exactly a
 * position on the page: the range is its top entering the foot of the window to
 * its top reaching the top of it, which is one window of scroll and always the
 * same window of scroll.
 *
 * Under reduced motion there is no curtain at all — the sections simply abut,
 * and two black sections abutting is not a seam anybody can see.
 */
function initWorkHandover(section: HTMLElement, reduced: boolean): () => void {
  const curtain = document.querySelector<HTMLElement>('[data-handover]');
  if (!curtain || reduced) return () => {};

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top bottom',
      end: 'top top',
      /* Smoothed, not immediate. The curtain is a full-screen fill and the eye
         reads its edge sharply — tied frame-for-frame to a trackpad it picks up
         every jitter in the gesture. */
      scrub: 0.4,
      invalidateOnRefresh: true,
    },
  });

  /* Up over the first half of the join, eased out, so it arrives rather than
     slams: the edge decelerates as it reaches the top of the window.

     `power1`, not `power2`. Cubic spent so much of the rise already finished —
     measured, 88% of the screen covered in the first quarter of the join —
     that the black arrived almost at once and then crept the last few pixels.
     Quadratic keeps the sweep readable as a sweep. */
  tl.fromTo(
    curtain,
    /* `y: 0` is not redundant. The stylesheet parks the curtain below the
       window with `translate3d(0, 100%, 0)`, and GSAP reads that in as
       `y: 900px` before applying anything of its own — so `yPercent: 100`
       alone lands on top of it and the curtain sits two windows down, where it
       stays for the whole of the join. Measured: y 1800 on a 900px window.
       Claiming `y` here is what makes the CSS parking position a starting
       state rather than an offset added to every frame. */
    { yPercent: 100, y: 0, autoAlpha: 1 },
    { yPercent: 0, ease: 'power1.out', duration: 0.55 },
    0,
  );

  /* And off over the second half. Linear: a fade to nothing has no arrival to
     ease into, and the section behind it is already in place. `autoAlpha`
     rather than opacity so the finished curtain stops being a composited
     full-screen surface — and stops counting as a dark zone under the nav,
     which reads visibility. */
  tl.to(curtain, { autoAlpha: 0, ease: 'none', duration: 0.45 }, 0.55);

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(curtain, { clearProps: 'opacity,visibility,transform' });
  };
}
