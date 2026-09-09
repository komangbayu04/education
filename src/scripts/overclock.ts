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
 * And then it hands over by dissolving, standing perfectly still while it does
 * — see initOverclockHandover at the foot of this file. Not a black panel
 * rising over it, which is what stood here for a day and had a hard edge you
 * could watch travel; not a crossfade between the two chapters, which is what
 * stood here before that; and not the cream tile field the stepped scene used
 * before that.
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

  const cleanups: Array<() => void> = [];

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
  /* How long the chapter is held still after its own sequence has finished, so
     it can be dissolved rather than scrolled away.

     Measured off Our work rather than declared here, and measured as a
     distance on the page rather than read out of a stylesheet: it is the gap
     between that section's top and the top of its own first step. That gap is
     the stretch where Our work's screen is parked and still with nothing of
     its own happening yet — which is precisely the stretch this pin has to
     cover. Taking it as geometry means the two cannot be given different
     numbers by mistake; `--cat-join` in WorkCategories.astro is where it is
     actually set. */
  const work = document.querySelector<HTMLElement>('[data-cat]');
  const track = work?.querySelector<HTMLElement>('.cat__track') ?? null;
  const join = () => {
    if (!work || !track) return window.innerHeight;
    const gap = track.getBoundingClientRect().top - work.getBoundingClientRect().top;
    return gap > 0 ? gap : window.innerHeight;
  };

  const pin = ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${span() * 2 + join()}`,
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

  cleanups.push(initOverclockHandover(section, work, span, join));

  /* The old handover is not here any more.

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
    cleanups.forEach((fn) => fn());
    pin.kill();
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(section, { clearProps: 'opacity,visibility' });
    gsap.set(ground, { clearProps: 'transform,clipPath' });
  };
}

/**
 * Overclock → Our work: a dissolve, with nothing moving in it.
 *
 * The chapter stays exactly where the pin put it — it does not slide, it does
 * not shrink, and nothing passes over it. What happens instead is that it is
 * masked away from its own bottom edge upwards, behind a feather wide enough
 * that there is no edge to follow, while Our work fades up from underneath.
 *
 * Underneath is the part that had to be built rather than tuned. Our work is
 * an ordinary section below this one, so on its own it would be a screen below
 * the fold for the whole of the join and there would be nothing to dissolve
 * INTO — which is why the first attempt at this reached for an opaque panel to
 * cover the gap with. It is pulled up by one window instead (`--cat-join` in
 * WorkCategories.astro) and this pin is extended by exactly the same distance,
 * so for that one window the two sections are in the same place: the next one
 * already parked at its sticky position and perfectly still, this one held
 * over it and going.
 *
 * The page is no longer for it. The extra pin and the negative margin are the
 * same number in opposite directions.
 *
 * Scrubbed with a long smoothing, because this is the join the whole sequence
 * lands on and a mask edge tied frame-for-frame to a trackpad picks up every
 * jitter in the gesture.
 */
function initOverclockHandover(
  section: HTMLElement,
  work: HTMLElement | null,
  span: () => number,
  join: () => number,
): () => void {
  const screen = work?.querySelector<HTMLElement>('[data-cat-dissolve]');

  /* The same range as the pin, deliberately.

     An offset start — `top top-=1800`, to begin where the sequence above ends
     — does not mean what it looks like it means once the element it is
     measured against is pinned: ScrollTrigger pushes any position that falls
     inside a pin by the pin's whole distance, so the join was measured at
     7740 when the pin it is supposed to live inside ends at 5940. It ran
     entirely after the chapter had already gone.

     Sharing the pin's range and placing the tweens by fraction avoids the
     question. The fraction is not a guess either — it is computed from the
     same two distances the pin is built from. */
  const total = span() * 2 + join();
  const at = (span() * 2) / total;
  const rest = 1 - at;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${span() * 2 + join()}`,
      scrub: 0.8,
      invalidateOnRefresh: true,
      /* The mask is only worth its compositing layer while it is doing
         something. Put on when the reader reaches the join and taken off only
         if they scroll back out of it — never at the far end, where removing
         it would restore the chapter at full strength on top of the section
         that has just replaced it. */
      onUpdate: (self) => {
        /* On for the last stretch only — the mask is worth its compositing
           layer while it is doing something and not before. Never taken off at
           the far end: removing it there would restore the chapter at full
           strength on top of the section that has just replaced it. */
        if (self.progress >= at) section.setAttribute('data-oc-join', '');
      },
      onLeaveBack: () => section.removeAttribute('data-oc-join'),
    },
  });

  /* The wipe. 0 is the mask fully opaque — the chapter whole — and 100 plus
     the feather is the ramp clear of the top edge, which is the first value at
     which none of it is left. */
  tl.fromTo(
    section,
    { '--oc-wipe': 0 },
    { '--oc-wipe': 155, ease: 'none', duration: rest, immediateRender: false },
    at,
  );

  /* And the next section coming up under it, finishing well before the wipe
     does. It has to be all the way there by the time the mask stops hiding it,
     or the last of the dissolve reveals a section still arriving. */
  if (screen) {
    tl.fromTo(screen, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: rest * 0.62 }, at);
  }

  /* And then the chapter is actually gone, rather than merely invisible.

     By this point the mask has taken all of it, so this changes nothing the
     reader can see — but a masked element is still painted, still composited,
     and still counts as a dark zone under the nav and as a candidate for the
     nav's section label. Switching it off is what hands both of those to Our
     work. */
  tl.fromTo(
    section,
    { autoAlpha: 1 },
    { autoAlpha: 0, ease: 'none', duration: rest * 0.08, immediateRender: false },
    at + rest * 0.92,
  );

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    section.removeAttribute('data-oc-join');
    gsap.set(section, { clearProps: '--oc-wipe,opacity,visibility' });
    if (screen) gsap.set(screen, { clearProps: 'opacity,visibility' });
  };
}
