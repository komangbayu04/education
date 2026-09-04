import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Two jobs, and neither of them touches the scroll:
 *
 *   change  as the scroll crosses from one category to the next, the ground
 *           behind the categories changes over. It is in a sticky layer and it
 *           never moves; all that happens is opacity. The categories themselves
 *           — headline, pitch and button as one block — are ordinary flow
 *           content and are carried by the scroll. Nothing in this file moves
 *           them, and nothing in this file crossfades them: a block leaves by
 *           being scrolled off the top, the way it arrived from the bottom.
 *
 *   reveal  a one-shot entrance the first time the section scrolls in, skipped
 *           when the scene hands this section in — that arrival *is* the
 *           reveal. Same contract as journal.ts / twoWays.ts.
 *
 * What is deliberately not here is a pin. An earlier cut held the scrollbar for
 * about four screens and scrubbed the frame's headline translate against it.
 * The frame's translate is a loop standing in for what plain scrolling does to
 * a block in front of a ground that does not move. Read that way it builds
 * itself: one sticky layer and one column of flow in front of it. Nothing here
 * moves the page.
 *
 * The layout stands up without any of this: the sticking and the flow are both
 * CSS, and a script that never runs leaves the first category's ground in place
 * with every category still on the page.
 *
 * Returns a cleanup function.
 */
export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const panels = gsap.utils.toArray<HTMLElement>('[data-cat-panel]', section);
  const grounds = gsap.utils.toArray<HTMLElement>('[data-cat-ground]', section);
  if (panels.length < 2) return () => {};

  const reduced = prefersReducedMotion();
  const cleanups: Array<() => void> = [];

  // --- The change ----------------------------------------------------------
  /**
   * Where a change runs, measured as the arriving category's block travelling
   * up the window — from its top 90% of the way up to its top at the very top,
   * which is where that category comes to rest.
   *
   * The ground turns over in the middle of that stretch: the outgoing block is
   * clearing the top edge and the incoming one is still under the fold, so the
   * crossfade happens on a screen with the least type on it. Ending it at the
   * rest rather than sooner is what keeps the new ground settled by the time
   * the block that names it has landed.
   */
  const START = 'top 90%';
  const END = 'top top';

  const GROUND_AT = 0.24;
  const GROUND_FOR = 0.48;

  for (let i = 1; i < panels.length; i += 1) {
    const panel = panels[i];
    const ground = grounds[i];
    if (!panel || !ground) continue;

    if (reduced) {
      /* A cut rather than a crossfade, in the middle of the window the fade
         would have used. Each category still gets its own ground — that is
         content, not decoration — it just arrives without being animated. */
      const swap = ScrollTrigger.create({
        trigger: panel,
        start: 'top 25%',
        onEnter: () => gsap.set(ground, { autoAlpha: 1 }),
        onLeaveBack: () => gsap.set(ground, { autoAlpha: 0 }),
      });

      cleanups.push(() => swap.kill());
      continue;
    }

    /* This renders on creation, and has to: it is what parks the ground at 0 in
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

    tl.fromTo(
      ground,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: GROUND_FOR, ease: 'none' },
      GROUND_AT,
    );

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
    });
  }

  // --- The outro ---------------------------------------------------------
  /*
   * There is no pitch left to fade out here. There was: the pitch and the
   * button lived in a sticky layer that stayed parked at the foot of the window
   * through the join, so the last one had to be told to go or it rode the whole
   * dissolve still legible under the arriving white. Now that the pitch travels
   * with its headline it leaves the way the headline does — scrolled off the
   * top, at full strength — and the instruction has nothing to give.
   */
  const twoSection = document.querySelector<HTMLElement>('[data-two]');

  /**
   * So the join is the artwork alone. From after the last category has had its
   * beat, the
   * ground dissolves the rest of the way to zero across what is left of the
   * join, so the category does not merely get covered — it goes.
   *
   * The ground only. The headline column was in this once and came out: it is
   * still on screen for most of this stretch — it does not clear the top of
   * the window until `--cat-rest` of travel, well after the dissolve starts —
   * so fading it here puts a half-erased 5rem title over its own cream, which
   * reads as something broken rather than as a transition. It leaves the way
   * it arrived instead, by being scrolled off, at full strength the whole way.
   * The black type simply sits on cream for the last moment instead of on the
   * photograph.
   *
   * Linear, and it starts only after the category has had its beat.
   *
   * The last category is arrived at, not passed through: it holds at full
   * strength for a stretch after the headline lands — nothing fading, nothing
   * moving — and only then does the artwork begin to go. `--work-outro` buys
   * that hold; this start is where inside it the dissolve picks up. The two
   * are tuned against each other, so moving one without the other either eats
   * the beat or leaves the ground still visible when the sticky lets go.
   *
   * Linear rather than eased, because the whole ramp has to read as evenly
   * underway. An ease-in spends its first half doing almost nothing, which
   * against a beat that has just ended reads as a second pause rather than as
   * the section leaving.
   *
   * The end is the release. Two ways in's title crosses into the window just
   * before this starts, so the reader is watching the next section arrive for
   * the whole of the fade — which is what makes the join feel direct rather
   * than like a section winding down.
   *
   * Both ends sit inside the hold, and that is the whole design. The ground is
   * sticky for `--work-outro`; this runs from well after the last headline has
   * cleared the top of the window to just before the sticky lets go. So the
   * photograph never moves while it fades and never fades while it moves — it
   * dissolves in place, on a screen the headline has already left, with Two
   * ways in's title arriving into the window as it goes. What is underneath by
   * then is this section's own cream, which is the ground the scene's exit
   * field is painted in too — a few levels off white.
   */
  const dissolve = gsap.utils.toArray<HTMLElement>('[data-cat-dissolve]', section);

  if (!reduced && dissolve.length && twoSection) {
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

  // --- Reveal --------------------------------------------------------------
  // The CSS pre-reveal state is neutralised under reduced motion, so the
  // section already renders finished there and a timeline here would only
  // re-do it.
  //
  // When the scene hands this section in, that arrival *is* the reveal — the
  // whole section fades in on the cream field, the way Overclock does. A
  // second fade of the title and the headlines on top of that would play after
  // the section was already on screen, which is a different beat.
  const reveals = gsap.utils.toArray<HTMLElement>('[data-cat-reveal]', section);
  const scene = document.querySelector<HTMLElement>('[data-scene]');
  const handedOff = !!scene && !reduced;

  if (handedOff || reduced) {
    gsap.set(reveals, { opacity: 1, y: 0 });
  } else {
    /* No scene on the page: each headline brings itself in as it arrives, and
       the title comes in with the first of them — it is inside a sticky layer
       that is on screen for the whole section, so a trigger of its own would
       have nothing to wait for. */
    reveals.forEach((el) => {
      const tween = gsap.fromTo(
        el,
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el.closest('[data-cat-panel]') ?? section,
            start: 'top 82%',
            once: true,
          },
        },
      );

      cleanups.push(() => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
