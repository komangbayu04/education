import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Founder quote (chapter 10) — a single one-shot reveal, fired the first time
 * the section scrolls into view.
 *
 * Same contract as the other post-scene sections: not scrubbed, not pinned,
 * `once: true`.
 *
 * Only the copy and the portrait animate. The two pixel bands are deliberately
 * left static: the bottom one is the seam this section shares with the footer,
 * and animating a structural edge would read as the page still loading rather
 * than as an effect.
 *
 * Returns a cleanup function.
 */
export function initFounderQuote(): () => void {
  const section = document.querySelector<HTMLElement>('[data-quote]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const items = gsap.utils.toArray<HTMLElement>('[data-quote-reveal]', section);
  if (!items.length) return () => {};

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 70%', once: true },
  });

  tl.fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0);

  const stopParallax = initPortraitParallax(section);

  return () => {
    stopParallax();
    tl.scrollTrigger?.kill();
    tl.kill();
    ScrollTrigger.refresh();
  };
}

/**
 * The portrait follows the cursor, in two layers.
 *
 * The frame drifts a little and the picture inside it drifts further, so the
 * two separate as the pointer moves — that separation is the parallax. One
 * layer moving on its own would only read as a picture sliding about.
 *
 * Neither layer is the element the reveal animates. That one is between them,
 * left alone so its `y` tween and these transforms never write to the same
 * element: GSAP folds a CSS transform into its own on first write, so two
 * tweens on one element means whichever ran last owns it.
 *
 * Returns a cleanup function.
 */
function initPortraitParallax(section: HTMLElement): () => void {
  const frame = section.querySelector<HTMLElement>('[data-quote-parallax="frame"]');
  const image = section.querySelector<HTMLElement>('[data-quote-parallax="image"]');
  if (!frame || !image) return () => {};

  // A pointer that can hover is the whole premise. On a touch screen there is
  // no cursor to follow, and the events that do arrive are taps — the picture
  // would jump to wherever a finger landed and stay there.
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!fine.matches) return () => {};

  // How far each layer travels at the edge of the section, as a share of the
  // portrait's own size — about 8px of frame against 17px of picture at the
  // sizes this runs at. The image moves roughly twice the frame; much beyond
  // that and the two stop reading as one object. The gap between them is the
  // effect, so neither number means much without the other.
  //
  // Paired with the 1.14 scale in FounderQuote.astro, which is what gives the
  // image room to move at all: at 5.5% the shift spends 17 of the 22px that
  // scale puts beyond each edge, and raising it past that shows the frame's
  // own background in the corner.
  const FRAME_TRAVEL = 2.5;
  const IMAGE_TRAVEL = 5.5;

  const to = (el: HTMLElement, prop: string) =>
    gsap.quickTo(el, prop, { duration: 0.9, ease: 'power3.out' });

  const frameX = to(frame, 'xPercent');
  const frameY = to(frame, 'yPercent');
  const imageX = to(image, 'xPercent');
  const imageY = to(image, 'yPercent');

  const onMove = (event: PointerEvent) => {
    const box = section.getBoundingClientRect();
    if (!box.width || !box.height) return;

    // -1 to 1 from the section's centre, so the drift is symmetrical about the
    // middle rather than about wherever the pointer entered.
    const x = gsap.utils.clamp(-1, 1, (event.clientX - box.left) / box.width - 0.5) * 2;
    const y = gsap.utils.clamp(-1, 1, (event.clientY - box.top) / box.height - 0.5) * 2;

    frameX(x * FRAME_TRAVEL);
    frameY(y * FRAME_TRAVEL);
    imageX(x * IMAGE_TRAVEL);
    imageY(y * IMAGE_TRAVEL);
  };

  const recentre = () => {
    frameX(0);
    frameY(0);
    imageX(0);
    imageY(0);
  };

  // Bound to the window rather than the section: the picture reacting to the
  // cursor only once it is over the portrait itself makes the effect feel like
  // a hover state. Following the pointer across the whole section, from a
  // distance, is what the drift is for.
  //
  // Off-screen the handler is pure waste — a rect read and four tweens per
  // move on a section nobody is looking at — so the listener comes and goes
  // with the section, and the layers are put back to centre on the way out.
  let listening = false;
  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) window.addEventListener('pointermove', onMove, { passive: true });
    else {
      window.removeEventListener('pointermove', onMove);
      recentre();
    }
  };

  const visibility = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => listen(self.isActive),
  });

  return () => {
    listen(false);
    visibility.kill();
    gsap.set([frame, image], { clearProps: 'transform' });
  };
}
