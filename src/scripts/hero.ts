import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Hero — through the train window, scrubbed.
 *
 * Pinned for two screens, and the reader drives it in both directions:
 *
 *   0    → 0.25   the copy fades and lifts away — headline, the line under
 *                 it, the buttons, the scroll cue and the guides together.
 *   0.25 → 1      the carriage zooms about the centre of its window until the
 *                 frame has passed every edge of the screen; the tree behind it
 *                 zooms to 1.2 over the same stretch.
 *
 * Then the pin lets go and the page carries the hero up, with Our work coming
 * up under it.
 *
 * Under reduced motion none of it runs: the hero is the carriage, the view and
 * the copy, still.
 *
 * Returns a cleanup function.
 */

/** How many screens of scroll the hero is held for. */
const PIN = 2;
/** When the zoom begins, as a share of the pin — after the copy has gone. */
const ZOOM_AT = 0.25;
/** How far the view behind the carriage is allowed to move. */
const TREE_SCALE = 1.2;
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
  const copy = gsap.utils.toArray<HTMLElement>('[data-hero-copy]', hero);
  if (!scene || !train || !tree) return () => {};

  const read = (key: string) => Number(scene.dataset[key]) || 0;

  /**
   * Where the window opening is on this screen, and how far the carriage has
   * to be zoomed about its centre for the opening to cover the whole screen.
   *
   * The carriage is `object-fit: cover; object-position: center`, so its
   * scale is whichever of the two axes has to be matched and the overflow is
   * split evenly — that puts the opening, stated in the image's own pixels, at
   * a known box on the screen. Zoomed about that box's centre, its edges move
   * out in proportion to their distance from it; the scale that takes the
   * nearest edge to the far side of the screen is the one where no frame is
   * left.
   */
  const fit = () => {
    const vw = hero.clientWidth;
    const vh = hero.clientHeight;
    const iw = read('imgW') || vw;
    const ih = read('imgH') || vh;

    const s = Math.max(vw / iw, vh / ih);
    const left = (vw - iw * s) / 2 + read('holeX') * s;
    const top = (vh - ih * s) / 2 + read('holeY') * s;
    const w = Math.max(read('holeW') * s, 1);
    const h = Math.max(read('holeH') * s, 1);

    const cx = left + w / 2;
    const cy = top + h / 2;
    const scale = Math.max((2 * Math.max(cx, vw - cx)) / w, (2 * Math.max(cy, vh - cy)) / h, 1);

    return { origin: `${cx}px ${cy}px`, scale: scale * OVERSHOOT };
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
      /* The opening moves with the window's shape, so it is measured again
         before every refresh re-reads the tweens' function values below. */
      onRefreshInit: () => {
        frame = fit();
      },
    },
  });

  /* `fromTo` with the resting state stated, and `immediateRender: false`, so
     building the timeline cannot move anything the reader is looking at. */
  tl.fromTo(
    copy,
    { opacity: 1, y: 0 },
    { opacity: 0, y: -40, duration: ZOOM_AT, ease: 'power1.in', immediateRender: false },
    0,
  );

  /* Both zoom about the opening's centre, so the tree grows out of the middle
     of the window rather than out of the middle of the screen. Eased in, so
     the carriage gathers speed toward the window instead of starting at full
     tilt. */
  tl.fromTo(
    train,
    { scale: 1, transformOrigin: () => frame.origin },
    {
      scale: () => frame.scale,
      transformOrigin: () => frame.origin,
      duration: 1 - ZOOM_AT,
      ease: 'power2.in',
      immediateRender: false,
    },
    ZOOM_AT,
  );

  tl.fromTo(
    tree,
    { scale: 1, transformOrigin: () => frame.origin },
    {
      scale: TREE_SCALE,
      transformOrigin: () => frame.origin,
      duration: 1 - ZOOM_AT,
      ease: 'power2.in',
      immediateRender: false,
    },
    ZOOM_AT,
  );

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(copy, { clearProps: 'opacity,transform' });
    gsap.set([train, tree], { clearProps: 'transform,transformOrigin' });
    ScrollTrigger.refresh();
  };
}
