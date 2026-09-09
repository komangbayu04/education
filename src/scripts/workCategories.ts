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
 *   outro     the join below it: a field of tiles paints across the last
 *             category, the layer underneath is swapped, and the same field
 *             clears to leave Two ways in. See initWorkPixels.
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

    /* The two definitive states, asserted at the two edges.

       A scrub is a tween that CHASES the scroll: `scrub: 0.8` means the
       timeline spends most of a second catching up to where the reader already
       is. That is what makes it feel like a hand on the page, and it is fine as
       long as the reader is somewhere inside the handover. Thrown past three
       handovers in one flick, three timelines are all chasing at once, and what
       the reader sees while they do is two and three headlines on the same
       pixels — which is the state that was reported, with the ground already on
       category four and the words still on two and three.

       Crossing an edge is not a matter of degree, so it is not left to the
       scrub. `onLeave` and `onLeaveBack` fire whether the range was crossed
       over a hundred frames or in one, and each pins everything this handover
       owns to the end it belongs to. The scrub still does the whole of the
       middle; it just no longer has the last word on either side of it. */
    const settle = (done: boolean) => {
      gsap.set(outCopy, { autoAlpha: done ? 0 : 1 });
      gsap.set(inCopy, { autoAlpha: done ? 1 : 0 });
      gsap.set(outPic, { '--cat-wipe': done ? 155 : 0, autoAlpha: done ? 0 : 1 });
    };

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
        onLeaveBack: () => {
          outPic.removeAttribute('data-cat-wiping');
          settle(false);
        },
        /* Past the end, everything this handover owns is at its far state — and
           the picture stops being composited, which by here changes nothing the
           reader can see because the mask has already taken all of it. */
        onLeave: () => settle(true),
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
  cleanups.push(initWorkPixels(section, reduced));

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}

/**
 * Our work → Two ways in: a pixel reveal, and the one transition on this page
 * that plays itself.
 *
 * Everywhere else the reader drives the motion and can run it backwards a
 * frame at a time. Here they do not: crossing into the join starts a field of
 * cream tiles painting across the screen in a random order, and it finishes on
 * its own clock whether they keep scrolling or stop. That is deliberate and it
 * is scoped to this one join — it was asked for as "one scroll", and a scatter
 * of tiles is the one effect on the page that wants a tempo of its own. Tied
 * to a scrub, a field of squares appearing at the speed of a trackpad reads as
 * a rendering fault rather than as a transition.
 *
 * What it is NOT is a scroll hijack. Nothing here takes the scrollbar: both
 * screens are already held still by their own sticky layers for the length of
 * `--two-join`, so the reader who keeps scrolling simply arrives at the far
 * side of a window in which nothing was going to move anyway.
 *
 * Three beats, in a little over a second:
 *
 *   cover     the tiles come on, scattered. Cream, which is Two ways in's own
 *             ground — so the completed field is already the colour of the
 *             section arriving, and the second half uncovers that section's
 *             content rather than fading up its background.
 *
 *   swap      Our work's screen is switched off behind the full field. This is
 *             the only frame where the layers change, and there is nothing to
 *             see through.
 *
 *   clear     the same tiles go off, in a different scatter, onto Two ways in.
 *
 * Reversible at the boundary rather than through the middle: scrolling back up
 * into the join from below runs the whole thing backwards, over the same
 * stretch of page the forward pass used, with both screens held still for all
 * of it. It cannot be scrubbed to a half-state because it has no half-states
 * the scroll owns.
 *
 * Returns a cleanup function.
 */
function initWorkPixels(section: HTMLElement, reduced: boolean): () => void {
  const field = document.querySelector<HTMLElement>('[data-work-pixels]');
  const two = document.querySelector<HTMLElement>('[data-two]');
  const screen = section.querySelector<HTMLElement>('[data-cat-dissolve]');
  if (!field || !two || !screen) return () => {};

  if (reduced) {
    /* No field at all. The two sections simply abut, which under reduced
       motion is what a transition is. */
    return () => {};
  }

  /** How many tiles across the longer edge of the window. */
  const ACROSS = 22;
  /** How long each half of the reveal takes. */
  const HALF = 0.55;

  let tiles: HTMLElement[] = [];

  /* Built to the window, and rebuilt when it changes: a grid sized for a
     desktop is a handful of enormous blocks on a phone. */
  const build = () => {
    const size = Math.ceil(Math.max(window.innerWidth, window.innerHeight) / ACROSS);
    const cols = Math.ceil(window.innerWidth / size);
    const rows = Math.ceil(window.innerHeight / size);

    field.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    field.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;

    const wanted = cols * rows;
    if (tiles.length === wanted) return;

    field.replaceChildren();
    tiles = Array.from({ length: wanted }, () => document.createElement('span'));
    field.append(...tiles);
  };

  build();

  const tl = gsap.timeline({ paused: true });

  /* Visible only while it is doing something: a fixed sheet of five hundred
     boxes is five hundred boxes the compositor is carrying, and for all but a
     second of the page's life it has nothing to carry them for. */
  tl.set(field, { visibility: 'visible' });

  tl.to(
    tiles,
    {
      opacity: 1,
      duration: 0.12,
      ease: 'none',
      stagger: { each: HALF / Math.max(tiles.length, 1), from: 'random' },
    },
    0,
  );

  /* The swap, under a full field.

     `fromTo`, and neither of the two simpler spellings would do. A `set` has
     no start value to go back to, and this timeline is run backwards as well
     as forwards. A `to` records its start the first time it renders, which for
     a paused timeline is whenever something first touches it — and at that
     moment Our work's screen may legitimately be hidden, since it is faded up
     by the join out of Overclock. Measured: rendered once before the reader
     had got that far, the tween recorded 0 as the value to return to and the
     swap did nothing for the rest of the session.

     `immediateRender: false` for the same reason it is on every other tween in
     this file whose resting state is "on": building the timeline must not
     switch off the screen the reader is currently looking at. */
  tl.fromTo(
    screen,
    { autoAlpha: 1 },
    { autoAlpha: 0, duration: 0.001, immediateRender: false },
    HALF + 0.12,
  );

  tl.to(
    tiles,
    {
      opacity: 0,
      duration: 0.12,
      ease: 'none',
      stagger: { each: HALF / Math.max(tiles.length, 1), from: 'random' },
    },
    HALF + 0.14,
  );

  tl.set(field, { visibility: 'hidden' });

  /* How long the two screens overlap, measured off the page rather than read
     out of a stylesheet: it is the gap between Two ways in's top and the top of
     its own first step, which is the stretch where its screen is parked and
     still with nothing of its own happening yet. `--two-join` is where that is
     actually set. */
  const twoTrack = two.querySelector<HTMLElement>('.two__track');
  const window_ = () => {
    if (!twoTrack) return globalThis.innerHeight;
    const gap = twoTrack.getBoundingClientRect().top - two.getBoundingClientRect().top;
    return gap > 0 ? gap : globalThis.innerHeight;
  };

  const trigger = ScrollTrigger.create({
    /* The overlap itself, both ends of it, and it needs both.
       
       Going down, the reveal starts at the top of this window: that is the
       first frame where Two ways in's screen is stuck and filling the frame
       behind this one, so there is something under the field to clear onto.

       Going up, it has to start at the BOTTOM of the window, and this is what
       a single point could not express. Reversing at the top meant the reader
       climbed the whole overlap with the field idle — watching Two ways in sit
       there and then slide down out of the way — and the tiles only began
       coming back as the two screens were already parting. Reversed from the
       far end, the reader goes back up through exactly the stretch the two
       screens are both held still for, and what they see is the field painting
       back over Two ways in and clearing to leave Marketing where they left
       it. */
    trigger: two,
    start: 'top top',
    end: () => `+=${window_()}`,
    /* The four crossings, and the two `Leave`s are not redundant. A reader who
       covers 900px faster than the reveal takes to play has to arrive with the
       layers in the right state anyway, so each far edge snaps the timeline to
       the end it belongs to. At any ordinary scrolling speed the animation has
       already finished and these do nothing. */
    onEnter: () => tl.play(),
    onLeave: () => tl.progress(1).pause(),
    onEnterBack: () => tl.reverse(),
    onLeaveBack: () => tl.progress(0).pause(),
    invalidateOnRefresh: true,
    onRefresh: build,
  });

  return () => {
    trigger.kill();
    tl.kill();
    field.replaceChildren();
    field.style.removeProperty('grid-template-columns');
    field.style.removeProperty('grid-template-rows');
    gsap.set(field, { clearProps: 'visibility' });
    gsap.set(screen, { clearProps: 'opacity,visibility' });
  };
}
