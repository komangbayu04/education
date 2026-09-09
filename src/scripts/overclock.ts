import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Overclock — its arrival, scrubbed.
 *
 * The chapter used to be a layer in a pinned, gesture-stepped scene: one scroll
 * and a field of tiles scattered over the hero, then this appeared behind them,
 * finished. That whole machine is gone (see the note at the end of initHero in
 * hero.ts). What is here instead is the same idea the hero uses — a pin and a
 * scrub, so the reader drives it and can run it backwards.
 *
 * Three stages, in order, over two viewports of scroll:
 *
 *   1. small       the section arrives on its own near-black ground with the
 *                  film already running in a small box in the middle of it. It
 *                  is already playing when it arrives: a film that starts when
 *                  it is big enough to see reads as a video element loading,
 *                  not as a chapter opening.
 *
 *   2. and grows   the box opens to the full screen, scrubbed. The film does
 *                  not scale — the box around it does. Growing the film would
 *                  mean it is at the wrong size for all but one frame of the
 *                  stage; opening a window over it means every frame of it is
 *                  the size it is meant to be.
 *
 *   3. then speaks the copy arrives, and only then. It has nothing to say over
 *                  a film the reader cannot see yet.
 *
 * And then it hands over behind a black curtain, which rises from the foot of
 * the window as Our work arrives and fades off it — see initWorkHandover in
 * src/scripts/workCategories.ts. Not a crossfade between the two chapters,
 * which is what stood here, and not the cream tile field the stepped scene
 * used before that.
 *
 * Under reduced motion none of it runs: the section is simply itself, film and
 * copy, in ordinary flow.
 *
 * Returns a cleanup function.
 */
export function initOverclock(): () => void {
  const section = document.querySelector<HTMLElement>('[data-project="overclock"]');
  if (!section) return () => {};

  const ground = section.querySelector<HTMLElement>('.project__ground');
  const text = section.querySelector<HTMLElement>('[data-chapter-text]');
  const video = section.querySelector<HTMLVideoElement>('video.project__ground');
  if (!ground) return () => {};

  /* Playing from the first frame it is on the page, not from the moment it is
     big enough to look at. `muted` is what makes that allowed to happen
     without a gesture; the file has no audio track, so it is a statement of
     fact rather than a mute button. */
  if (video) {
    video.muted = true;
    void video.play().catch(() => {});
  }

  if (prefersReducedMotion()) return () => {};

  /* How large the film is when it arrives, as a share of the screen. */
  const SMALL = 0.44;

  const span = () => section.offsetHeight || window.innerHeight;

  /* Two triggers, and they are two because they answer two different
     questions.

     THE PIN holds the section still, and it must start at `top top`. A pin
     that starts anywhere else sticks the element at that point down the
     screen: `top 30%` parked this section 30% of the way down and left a band
     of bare page above it, between the bottom of the hero and the top of this.
     Measured — at that scroll the only thing under the cursor across a
     hundred-pixel strip was <body>. Nothing was covering it because nothing
     was there. `top top` is what makes the two sections meet.

     THE SCRUB drives the sequence, and it starts earlier than the pin does —
     when the section is 70% up the window. That is what was wanted from the
     `top 30%` above: the film's box already opening while the section is still
     arriving, so the arrival and the growth read as one movement rather than a
     black screen sliding up and then, separately, something happening in it.

     Splitting them is what lets both be true at once. One trigger cannot start
     in two places. */
  const pin = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${span() * 2}`,
    pin: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      /* 70% visible, which is its top at 30% of the way down the window. */
      start: 'top 30%',
      /* The pin's own distance plus the run-up this starts early by, so the
         sequence finishes exactly as the pin releases. */
      end: () => `+=${span() * 2.7}`,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  /* The film scales. It does not get un-clipped.

     A clip was here and it was the wrong instrument: clipping a full-bleed
     film to a small rectangle does not show a small film, it shows a small
     window onto a large one — so the box held a zoomed-in corner of the
     picture with the monitor running off two of its edges. Nothing about the
     footage was small; only the hole was.

     Scaled, the whole frame is in the box from the first moment, at the size
     the box is, and growing the box grows the picture with it — which is what
     "it gets bigger" has to mean. `transform` also costs no layout, so this
     gives up nothing the clip was bought for. */
  gsap.set(ground, { transformOrigin: '50% 50%', clipPath: 'none' });
  tl.fromTo(
    ground,
    /* Low in the frame while it is small, so there is a clear band of black
       above it rather than the film sitting dead centre with equal margins —
       the reference has it low, and the gap above is what makes the section
       read as opening on something rather than as a video placed in a box.
       Run back to nothing as it grows, since a full-bleed film has no room to
       sit anywhere but where it is. */
    { scale: SMALL, yPercent: 8 },
    { scale: 1, yPercent: 0, ease: 'power2.inOut', duration: 0.5 },
    0,
  );

  /* And then it speaks. Held back until the film has finished opening rather
     than overlapping it: the growth is the arrival, and copy sliding in over an
     arrival still in progress makes two things of one. */
  if (text) {
    tl.fromTo(
      text,
      { autoAlpha: 0, y: 28 },
      /* `immediateRender` left ON, unlike the tweens below it. This one's
         `from` state IS the section's resting state — the copy is not supposed
         to be readable until the film has opened — so it has to be rendered
         the moment the timeline is built. Refused, the text simply stood at
         full strength from the first frame and the stage had nothing to
         reveal. */
      { autoAlpha: 1, y: 0, ease: 'power3.out', duration: 0.22 },
      0.56,
    );
  }

  /* The handover is not here any more.

     It was: this section faded out and Our work faded in over the last stretch
     of the timeline, a crossfade between two chapters. Two things were wrong
     with it. The smaller one is that a crossfade shows both chapters at half
     strength in the middle, so for the length of the join there were two sets
     of words on the screen and neither of them readable. The larger one is
     where it was written — these positions are fractions of a scrubbed
     timeline whose pin releases somewhere in the middle of them, so "0.86"
     is only loosely a place on the page.

     What replaced it is a black curtain that rises from the foot of the window
     and fades off, driven off Our work's own top rather than off this
     timeline: initWorkHandover in src/scripts/workCategories.ts, with the
     element in index.astro. So this chapter now simply scrolls away when the
     pin lets go, at full strength, behind something opaque. */

  return () => {
    pin.kill();
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(section, { clearProps: 'opacity,visibility' });
    gsap.set(ground, { clearProps: 'transform,clipPath' });
  };
}
