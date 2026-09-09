import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — categorized. Three jobs, and none of them touches the scroll:
 *
 *   change    the sticky screen holds every category stacked on top of one
 *             another, first on top, and the scroll dissolves them away one at
 *             a time — each picture masked off from its own bottom edge
 *             upwards to leave the next one, which was underneath it all
 *             along. Nothing travels. The words are handled separately from
 *             the pictures they sit on; see the note over the timings.
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
   * One category giving way to the next, and it is the same movement the
   * reader was brought into this section by: the picture on top is masked away
   * from its own bottom edge upwards, behind a feather wider than half the
   * screen, and the next category — already there, whole, underneath — is what
   * is left. Nothing slides, nothing crossfades, and there is no edge to
   * follow.
   *
   * The words are not in that dissolve. Two reasons, and the second is the one
   * that matters: a masked headline comes apart from its baseline upwards,
   * which reads as damage rather than as a transition; and while it is coming
   * apart it is still legible over the headline arriving underneath it. So the
   * copy has a fade of its own, and the whole design of the timing below is
   * that it is FINISHED before the incoming copy has started.
   *
   * Measured against the handover's own length rather than the step's, so the
   * shape holds at any window:
   *
   *   0    → 0.24   the copy leaving. First and quickest.
   *   0.14 → 0.94   the picture dissolving, most of the stretch.
   *   0.66 → 0.96   the copy arriving, over a picture already two thirds
   *                 replaced.
   *
   * Which leaves 0.24 to 0.66 — two fifths of every change — with no words on
   * the screen at all, only one photograph becoming another. That gap is not
   * waste. It is the only arrangement in which a headline is never competing
   * with another headline, and it is what the earlier crossfade could not buy
   * at any speed.
   *
   * A fourth step, taking the spent picture out of the compositor entirely,
   * is NOT in this timeline. It was, as an `autoAlpha: 1 → 0` over the last
   * few percent, and it did not come back: scrubbed to the end and then back
   * to the beginning, the element still read `opacity: 0; visibility: hidden`
   * — while the `--cat-wipe` tween beside it, carrying the same
   * `immediateRender: false`, rewound correctly every time. Scrolling back up
   * the page left the picture gone, and the category standing over the next
   * one's photograph. It is a pair of trigger callbacks instead: one place
   * turns it off, one turns it back on, and they are the same boundary read
   * from either side.
   */
  const START = 'top 60%';
  const END = 'top 5%';

  const COPY_OUT = 0.24;
  const WIPE_AT = 0.14;
  const WIPE_FOR = 0.8;
  const COPY_IN_AT = 0.66;
  const COPY_IN_FOR = 0.3;

  const pic = (i: number) => screens[i]?.querySelector<HTMLElement>('[data-cat-pic]') ?? null;
  const copy = (i: number) => screens[i]?.querySelector<HTMLElement>('[data-cat-copy]') ?? null;

  for (let i = 1; i < panels.length; i += 1) {
    const panel = panels[i];
    const outPic = pic(i - 1);
    const outCopy = copy(i - 1);
    const inCopy = copy(i);
    if (!panel || !outPic || !outCopy || !inCopy) continue;

    if (reduced) {
      /* A cut rather than a dissolve, in the middle of the window the change
         would have used. Each category still gets its own screen — that is
         content, not decoration — it just arrives without being animated. */
      const swap = ScrollTrigger.create({
        trigger: panel,
        start: 'top 40%',
        onEnter: () => gsap.set([outPic, outCopy, inCopy], { autoAlpha: gsap.utils.wrap([0, 0, 1]) }),
        onLeaveBack: () =>
          gsap.set([outPic, outCopy, inCopy], { autoAlpha: gsap.utils.wrap([1, 1, 0]) }),
      });

      cleanups.push(() => swap.kill());
      continue;
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: panel,
        start: START,
        end: END,
        /* Smoothed rather than tied frame-for-frame to the gesture, and by the
           same amount the join out of Overclock uses. A mask edge is read
           sharply by the eye even when it is soft, so it picks up every jitter
           in a trackpad. */
        scrub: 0.8,
        invalidateOnRefresh: true,
        /* The mask costs a compositing layer, so it is only on the picture
           that is currently going. Never taken off at the far end — removing
           it there would put the category back at full strength on top of the
           one that has just replaced it. */
        onEnter: () => outPic.setAttribute('data-cat-wiping', ''),
        onEnterBack: () => {
          outPic.setAttribute('data-cat-wiping', '');
          gsap.set(outPic, { autoAlpha: 1 });
        },
        onLeaveBack: () => outPic.removeAttribute('data-cat-wiping'),
        /* By here the mask has taken all of the picture, so this changes
           nothing the reader can see — but a masked element is still painted
           and still composited. See the note over the timings. */
        onLeave: () => gsap.set(outPic, { autoAlpha: 0 }),
      },
    });

    /* The copy leaving. `immediateRender: false` on all three of these: their
       resting state is on, and the stylesheet already says so — rendered at
       build they would switch off whichever category the section is currently
       showing. */
    tl.fromTo(
      outCopy,
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: COPY_OUT, ease: 'power1.in', immediateRender: false },
      0,
    );

    tl.fromTo(
      outPic,
      { '--cat-wipe': 0 },
      { '--cat-wipe': 155, duration: WIPE_FOR, ease: 'none', immediateRender: false },
      WIPE_AT,
    );

    /* The copy arriving. This one DOES render at build, and has to: it is what
       parks the column at 0 in step with the stylesheet, so the section looks
       the same before this file runs and after. */
    tl.fromTo(
      inCopy,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: COPY_IN_FOR, ease: 'power2.out' },
      COPY_IN_AT,
    );

    cleanups.push(() => {
      tl.scrollTrigger?.kill();
      tl.kill();
      outPic.removeAttribute('data-cat-wiping');
      gsap.set([outPic, outCopy, inCopy], { clearProps: 'opacity,visibility' });
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
