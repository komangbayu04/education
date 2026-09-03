import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Two jobs, and neither of them touches the scroll:
 *
 *   change  as the scroll crosses from one category to the next, the ground
 *           behind and the pitch in front of the headlines change over. Both
 *           are in sticky layers and neither moves; all that happens is
 *           opacity. The headlines themselves are ordinary flow content and are
 *           carried by the scroll — nothing in this file touches them.
 *
 *   reveal  a one-shot entrance the first time the section scrolls in, skipped
 *           when the scene hands this section in — that arrival *is* the
 *           reveal. Same contract as journal.ts / twoWays.ts.
 *
 * What is deliberately not here is a pin. An earlier cut held the scrollbar for
 * about four screens and scrubbed the frame's headline translate against it.
 * The frame's translate is a loop standing in for what plain scrolling does to
 * a headline in front of a ground that does not move — which is why the same
 * frame gives the paragraph and the button *no* translate at all, only opacity,
 * parked at 694 and 796 of its 900. Read that way it builds itself: two sticky
 * layers and one column of flow between them. Nothing here moves the page.
 *
 * The layout stands up without any of this: the sticking and the flow are both
 * CSS, and a script that never runs leaves the first category's ground and
 * pitch in place with every headline still on the page.
 *
 * Returns a cleanup function.
 */
export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const panels = gsap.utils.toArray<HTMLElement>('[data-cat-panel]', section);
  const grounds = gsap.utils.toArray<HTMLElement>('[data-cat-ground]', section);
  const copies = gsap.utils.toArray<HTMLElement>('[data-cat-copy]', section);
  if (panels.length < 2) return () => {};

  const reduced = prefersReducedMotion();
  const cleanups: Array<() => void> = [];

  // --- The change ----------------------------------------------------------
  /**
   * Where a change runs, measured as the arriving category's block travelling
   * up the window — from its top 90% of the way up to its top at the very top,
   * which is where that category's headline comes to rest.
   *
   * The end has to be the rest and not a moment sooner, and the reason is
   * geometry. A headline's foot rests at `--cat-rest` of the window and the
   * pitch sits below that, so a headline arriving from under the fold sweeps
   * up through the pitch's own corner every time — there is nowhere else for it
   * to come from. The frame solves it by having the pitch simply not be there
   * while that happens: its paragraph fades out at the very start of the swap
   * and back in only as the headline lands. Timed to finish early instead, the
   * pitch is already on screen while a 5rem headline slides up over it.
   */
  const START = 'top 90%';
  const END = 'top top';

  /* Within that window, in the frame's own order: the pitch on screen leaves
     first, the ground turns over behind it while there is no headline in the
     way, and the next pitch arrives only in the last stretch, converging with
     its headline. Node 2458:7645 runs them 0–23%, 19–30% and 34–42% of its
     loop, and the shape is the same — the old one is gone well before the new
     one starts, which is what stops the two paragraphs from being legible on
     top of each other.

     In window fractions: the outgoing headline clears the top edge at 0, the
     incoming one appears at the foot of the window around 0.38, and it is home
     at 1. */
  const OUT_AT = 0;
  const OUT_FOR = 0.3;
  const GROUND_AT = 0.24;
  const GROUND_FOR = 0.48;
  const IN_AT = 0.84;
  const IN_FOR = 0.16;

  for (let i = 1; i < panels.length; i += 1) {
    const panel = panels[i];
    const ground = grounds[i];
    const leaving = copies[i - 1];
    const arriving = copies[i];
    if (!panel || !ground || !leaving || !arriving) continue;

    if (reduced) {
      /* A cut rather than a crossfade, in the middle of the window the fades
         would have used. Each category still gets its own ground and its
         own pitch — that is content, not decoration — they just arrive without
         being animated. */
      const swap = ScrollTrigger.create({
        trigger: panel,
        start: 'top 25%',
        onEnter: () => {
          gsap.set([ground, arriving], { autoAlpha: 1 });
          gsap.set(leaving, { autoAlpha: 0 });
        },
        onLeaveBack: () => {
          gsap.set([ground, arriving], { autoAlpha: 0 });
          gsap.set(leaving, { autoAlpha: 1 });
        },
      });

      cleanups.push(() => swap.kill());
      continue;
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: panel,
        start: START,
        end: END,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    /* `immediateRender: false` is load-bearing. Every pitch but the first is
       parked hidden by the stylesheet, and a fromTo that rendered its `from` on
       creation would put this one back to full opacity at page load — the
       second, third and fourth pitches stacked on the first. It only takes a
       value when the scroll actually reaches it. */
    tl.fromTo(
      leaving,
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: OUT_FOR, ease: 'none', immediateRender: false },
      OUT_AT,
    )
      /* These two do render on creation, and have to: it is what parks them at
         0 in step with the stylesheet, so the section looks the same before
         this file runs and after. */
      .fromTo(
        ground,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: GROUND_FOR, ease: 'none' },
        GROUND_AT,
      )
      .fromTo(
        arriving,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: IN_FOR, ease: 'none' },
        IN_AT,
      );

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
    });
  }

  // --- The outro ---------------------------------------------------------
  /**
   * The last pitch leaving. Every other pitch in this section fades out as its
   * category is handed on — see OUT_AT / OUT_FOR above. The last one has
   * nothing to hand to, so it was never told to go, and it did not: it rode
   * the join all the way down the screen still legible under the arriving
   * white. This is that same instruction, given by Two ways in's arrival
   * instead of by the next category.
   *
   * It has to be a tween and cannot be left to the gradient, and the geometry
   * says why. The pitch sits a fixed distance above the bottom of this section,
   * and that bottom is always exactly `--work-outro` below the arriving
   * section's box top — so the pitch sits at one fixed depth into the feather
   * for the whole join. Measured, that depth is about a quarter: the blurb's
   * first line is 29% covered when the white first reaches it and still 29%
   * covered a screen later. The pitch block is most of the overlap's height,
   * so it lives permanently in the gradient's thin end. No feather length
   * fixes that; only the pitch leaving does.
   *
   * The ground and the headline column are deliberately NOT in this. The
   * gradient covers the grey perfectly well — grey under thin white is a
   * dissolve, not a leftover — and the headlines leave the way they arrived,
   * by being scrolled off the top. Both were faded here once, and a 5rem
   * headline at half opacity over its own cream reads as half-erased rather
   * than as a transition, because above the arriving section's box top there is
   * no white at all to cover what the fade takes off.
   *
   * Early and short, on the same rhythm as the other pitches: gone while it is
   * still parked at the foot of the window, before the sticky layer releases
   * and carries it up into the middle of the join. `autoAlpha`, so the "See
   * work" button stops taking clicks once it is gone.
   *
   * Not under reduced motion: the category changes are cuts there.
   */
  const outro = gsap.utils.toArray<HTMLElement>('[data-cat-outro]', section);
  const twoSection = document.querySelector<HTMLElement>('[data-two]');

  if (!reduced && outro.length && twoSection) {
    const fade = gsap.to(outro, {
      autoAlpha: 0,
      ease: 'power1.in',
      scrollTrigger: {
        trigger: twoSection,
        start: 'top bottom',
        end: 'top 76%',
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    cleanups.push(() => {
      fade.scrollTrigger?.kill();
      fade.kill();
    });
  }

  /**
   * And then the artwork. From just after the pitch has finished leaving, the
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
