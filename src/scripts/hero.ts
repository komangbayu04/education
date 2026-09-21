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

    /* THE LANDSCAPE'S BOX IS THE PICTURE. `ox`/`oy` and the two sizes below are
       the covering rectangle — bigger than the screen on one axis — and the
       element is given exactly that box, so what this arithmetic describes is
       what is painted. See `.hero__img--tree` in Hero.astro for the fault this
       fixes. */
    const boxW = iw * s;
    const boxH = ih * s;

    /* Placed by its own edges rather than by `inset: 0` and `margin: auto`.
       Auto margins centre an oversized box on one axis only: measured at
       390x844, the box centred vertically and sat hard against the left, which
       put the tree outside the window before the zoom had even begun. `right`
       and `bottom` are cleared because the stylesheet's `inset: 0` would
       otherwise fight the two edges set here. */
    Object.assign(tree.style, {
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      left: `${ox}px`,
      top: `${oy}px`,
      width: `${boxW}px`,
      height: `${boxH}px`,
    });

    /* The end frame, against the same origin the zoom turns about. Two things
       are asked for at once — the crown at one height and the foot of the trunk
       at another — which is a scale AND a shift, not a scale alone: the distance
       between them fixes the scale, and where they land fixes the shift. */
    const crown = oy + read('treeCrown') * boxH;
    const base = oy + read('treeBase') * boxH;
    const axis = ox + read('treeAxis') * boxW;

    /* Never under 1. Below it the picture is smaller than the screen and the
       page shows down both sides — which is what the framing asks for on a wide,
       short window, where four fifths of a short height is less than the tree
       already covers. */
    const treeScale = Math.max(((TREE_BASE - TREE_TOP) * vh) / Math.max(base - crown, 1), 1);

    /* What the picture can afford to move without leaving the screen. The
       framing is a wish; this is the room, and the wish is clamped into it —
       so the frame is always full, and the tree is where it was asked to be
       wherever there are pixels to spare for it. */
    const maxY = -(cy + (oy - cy) * treeScale);
    const minY = vh - (cy + (oy + boxH - cy) * treeScale);
    const maxX = -(cx + (ox - cx) * treeScale);
    const minX = vw - (cx + (ox + boxW - cx) * treeScale);
    const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

    return {
      origin: `${cx}px ${cy}px`,
      scale: scale * OVERSHOOT,
      /* THE SAME POINT, IN THE LANDSCAPE'S OWN COORDINATES. `transform-origin`
         is measured from an element's top-left corner, not from the screen's —
         and the landscape's box starts off-screen now, so the carriage's origin
         written on it lands somewhere else entirely. Measured at 1920x896, the
         tree settled at 14.6% instead of the 11% asked for, the whole of the
         error being the box's own offset. */
      treeOrigin: `${cx - ox}px ${cy - oy}px`,
      tree: {
        scale: treeScale,
        x: clamp(vw / 2 - (cx + (axis - cx) * treeScale), minX, maxX),
        y: clamp(TREE_TOP * vh - (cy + (crown - cy) * treeScale), minY, maxY),
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
    { scale: 1, x: 0, y: 0, transformOrigin: () => frame.treeOrigin },
    {
      scale: () => frame.tree.scale,
      x: () => frame.tree.x,
      y: () => frame.tree.y,
      transformOrigin: () => frame.treeOrigin,
      duration: ZOOM_TO - ZOOM_AT,
      ease: 'power1.inOut',
      immediateRender: false,
    },
    ZOOM_AT,
  );

  /* And then the sentence, on a frame that has stopped moving — and a beat of
     pin after it with nothing happening at all, which is the whole of what
     "read this before the page goes on" costs.

     A LINE AT A TIME, OUT OF FOCUS. It came up as one block, the three lines
     fading in together and flat, which read as a caption being switched on.
     Now the block itself is simply turned on at the start of the stretch and
     each line arrives in turn under it: rising a little, fading up and
     sharpening out of a blur, the next one starting before the last has
     settled. The blur is what takes the flatness out — the words come into
     focus over the landscape rather than appearing on top of it.

     The stretch is the same `TEXT_FOR`, shared out: each line takes a little
     over half of it and they start a fifth of it apart, so the last is sharp
     exactly when the old block used to be. Scrubbed like everything else in
     the scene, so it runs backwards and out of focus again on the way up. */
  const lines = reveal ? gsap.utils.toArray<HTMLElement>('.hero__reveal-line', reveal) : [];
  if (reveal && lines.length) {
    const each = TEXT_FOR * 0.55;
    const gap = lines.length > 1 ? (TEXT_FOR - each) / (lines.length - 1) : 0;

    tl.set(reveal, { autoAlpha: 1 }, TEXT_AT);
    tl.fromTo(
      lines,
      { autoAlpha: 0, y: 22, filter: 'blur(14px)' },
      {
        autoAlpha: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: each,
        stagger: gap,
        ease: 'power2.out',
        /* Rendered at build, which the other tweens here are not. The block is
           turned on at the start of the stretch, and a line whose own turn has
           not come yet would otherwise be sitting there sharp and at full
           strength under it — measured just after the start, the second and
           third lines were fully drawn while the first was still coming into
           focus. Parked at their start instead, which is invisible anyway
           until the block is turned on. */
        immediateRender: true,
      },
      TEXT_AT,
    );
    tl.call(() => reveal.setAttribute('aria-hidden', 'false'), undefined, TEXT_AT + 0.001);
    tl.call(() => reveal.setAttribute('aria-hidden', 'true'), undefined, TEXT_AT);
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(copy, { clearProps: 'opacity,transform' });
    gsap.set([train, tree], { clearProps: 'transform,transformOrigin' });
    Object.assign(tree.style, {
      right: '',
      bottom: '',
      margin: '',
      left: '',
      top: '',
      width: '',
      height: '',
    });
    if (reveal) {
      gsap.set(reveal, { clearProps: 'opacity,visibility,transform' });
      if (lines.length) gsap.set(lines, { clearProps: 'opacity,visibility,transform,filter' });
      reveal.setAttribute('aria-hidden', 'true');
    }
    ScrollTrigger.refresh();
  };
}
