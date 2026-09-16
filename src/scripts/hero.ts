import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Hero — through the train window, scrubbed.
 *
 * Pinned for three screens, and the reader drives every part of it in both
 * directions:
 *
 *   0    → 0.18   the copy fades and lifts away — headline, the line under it,
 *                 the buttons, the scroll cue and the guides together.
 *   0.18 → 0.62   the carriage zooms about the centre of its window until the
 *                 frame has passed every edge of the screen, and the landscape
 *                 behind settles into the frame it ends on.
 *   0.66 → 0.82   the sentence fades up on the finished landscape.
 *   0.82 → 1      held, with nothing moving, so the sentence is read before the
 *                 page goes on.
 *
 * Then the pin lets go and Our work comes up, its film growing from small on
 * black as it always has.
 *
 * NOTHING HERE IS A FIGURE TYPED IN BY HAND. Both ends of the movement are
 * worked out from where things are: the window opening, in the carriage image's
 * own pixels, gives the zoom that clears the frame; the tree's crown and the
 * foot of its trunk, in the landscape's, give the scale and the shift that put
 * it in the frame below. Change either picture and the numbers in the markup
 * change with it.
 *
 * Under reduced motion none of it runs: the hero is the carriage, the view and
 * the copy, still.
 *
 * Returns a cleanup function.
 */

/** How many screens of scroll the hero is held for. */
const PIN = 3;
/** When the zoom begins, as a share of the pin — after the copy has gone. */
const ZOOM_AT = 0.18;
/** And when it ends, leaving the landscape whole. */
const ZOOM_TO = 0.62;
/** The sentence: when it arrives, and how long it takes. */
const TEXT_AT = 0.66;
const TEXT_FOR = 0.16;
/**
 * Where the tree ends up, as shares of the screen's height: the top of its
 * crown and the foot of its trunk. The frame the reader is left on, and the
 * reference for it is the design's own last frame.
 */
const TREE_TOP = 0.11;
const TREE_BASE = 0.91;
/**
 * A little past "exactly covers the screen". The opening has rounded corners,
 * and a zoom that only just covers the screen with the opening's bounding box
 * leaves the corners of the screen inside those curves — four slivers of frame
 * in the last frame.
 */
const OVERSHOOT = 1.08;

export function initHero(): () => void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || prefersReducedMotion()) return () => {};

  const scene = hero.querySelector<HTMLElement>('[data-hero-scene]');
  const train = hero.querySelector<HTMLElement>('[data-hero-train]');
  const tree = hero.querySelector<HTMLElement>('[data-hero-tree]');
  const reveal = hero.querySelector<HTMLElement>('[data-hero-reveal]');
  const copy = gsap.utils.toArray<HTMLElement>('[data-hero-copy]', hero);
  if (!scene || !train || !tree) return () => {};

  const read = (key: string) => Number(scene.dataset[key]) || 0;

  /**
   * Where the window opening is on this screen, and how far the carriage has to
   * be zoomed about its centre for the opening to cover the whole screen.
   *
   * Both pictures are `object-fit: cover; object-position: center`, so their
   * scale is whichever of the two axes has to be matched and the overflow is
   * split evenly. That puts anything stated in the image's own pixels at a
   * known box on the screen. Zoomed about a point, edges move out in proportion
   * to their distance from it; the scale that takes the nearest edge past the
   * far side of the screen is the one where no frame is left.
   */
  const fit = () => {
    const vw = hero.clientWidth;
    const vh = hero.clientHeight;
    const iw = read('imgW') || vw;
    const ih = read('imgH') || vh;

    const s = Math.max(vw / iw, vh / ih);
    const ox = (vw - iw * s) / 2;
    const oy = (vh - ih * s) / 2;

    const left = ox + read('holeX') * s;
    const top = oy + read('holeY') * s;
    const w = Math.max(read('holeW') * s, 1);
    const h = Math.max(read('holeH') * s, 1);

    const cx = left + w / 2;
    const cy = top + h / 2;
    const scale = Math.max((2 * Math.max(cx, vw - cx)) / w, (2 * Math.max(cy, vh - cy)) / h, 1);

    /* The landscape's end frame, against the same origin the zoom turns about.
       Two things are being asked for at once — the crown at one height and the
       foot of the trunk at another — which is a scale AND a shift, not a scale
       alone: the distance between them fixes the scale, and where they land
       fixes the shift. */
    const crown = oy + read('treeCrown') * ih * s;
    const base = oy + read('treeBase') * ih * s;
    const axis = ox + read('treeAxis') * iw * s;
    const treeScale = ((TREE_BASE - TREE_TOP) * vh) / Math.max(base - crown, 1);

    return {
      origin: `${cx}px ${cy}px`,
      scale: scale * OVERSHOOT,
      tree: {
        scale: treeScale,
        x: vw / 2 - (cx + (axis - cx) * treeScale),
        y: TREE_TOP * vh - (cy + (crown - cy) * treeScale),
      },
    };
  };

  let frame = fit();

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: () => `+=${window.innerHeight * PIN}`,
      pin: true,
      anticipatePin: 1,
      scrub: 0.6,
      invalidateOnRefresh: true,
      /* The opening and the tree both move with the window's shape, so they are
         measured again before every refresh re-reads the function values
         below. */
      onRefreshInit: () => {
        frame = fit();
      },
    },
  });

  /* THE TIMELINE IS EXACTLY 1 LONG, and it has to be said rather than assumed.

     A timeline is as long as its last tween ends, and the scroll is mapped onto
     whatever that turns out to be — so with the sentence finishing at 0.82 the
     pin was 0.82 long, every fraction below landed somewhere else on the page
     than it reads here, and the beat after the sentence did not exist at all:
     it ended on the pixel the pin released. An empty tween across the whole
     length fixes the two together, and the last stretch of it is the hold. */
  tl.to({}, { duration: 1 }, 0);

  /* `fromTo` with the resting state stated, and `immediateRender: false`, so
     building the timeline cannot move anything the reader is looking at. */
  tl.fromTo(
    copy,
    { opacity: 1, y: 0 },
    { opacity: 0, y: -40, duration: ZOOM_AT, ease: 'power1.in', immediateRender: false },
    0,
  );

  /* The carriage, about the centre of its own window. Eased in, so it gathers
     speed toward the window rather than starting at full tilt. */
  tl.fromTo(
    train,
    { scale: 1, transformOrigin: () => frame.origin },
    {
      scale: () => frame.scale,
      transformOrigin: () => frame.origin,
      duration: ZOOM_TO - ZOOM_AT,
      ease: 'power2.in',
      immediateRender: false,
    },
    ZOOM_AT,
  );

  /* The landscape, over the same stretch and about the same point, arriving at
     the frame it ends on. `power1.inOut` rather than the carriage's `power2.in`
     — this is the thing the reader is left looking at, so it settles into place
     instead of still accelerating when it gets there. */
  tl.fromTo(
    tree,
    { scale: 1, x: 0, y: 0, transformOrigin: () => frame.origin },
    {
      scale: () => frame.tree.scale,
      x: () => frame.tree.x,
      y: () => frame.tree.y,
      transformOrigin: () => frame.origin,
      duration: ZOOM_TO - ZOOM_AT,
      ease: 'power1.inOut',
      immediateRender: false,
    },
    ZOOM_AT,
  );

  /* And then the sentence, on a frame that has stopped moving — and a beat of
     pin after it with nothing happening at all, which is the whole of what
     "read this before the page goes on" costs. */
  if (reveal) {
    tl.fromTo(
      reveal,
      { autoAlpha: 0, y: 16 },
      {
        autoAlpha: 1,
        y: 0,
        duration: TEXT_FOR,
        ease: 'power2.out',
        immediateRender: false,
        onStart: () => reveal.setAttribute('aria-hidden', 'false'),
        onReverseComplete: () => reveal.setAttribute('aria-hidden', 'true'),
      },
      TEXT_AT,
    );
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(copy, { clearProps: 'opacity,transform' });
    gsap.set([train, tree], { clearProps: 'transform,transformOrigin' });
    if (reveal) {
      gsap.set(reveal, { clearProps: 'opacity,visibility,transform' });
      reveal.setAttribute('aria-hidden', 'true');
    }
    ScrollTrigger.refresh();
  };
}
