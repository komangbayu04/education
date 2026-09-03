import { gsap, ScrollTrigger } from './gsap';
import { getVariant } from '../config/variations';
import { prefersReducedMotion } from './utils/device';

/** The card the photograph arrives as, before it opens out. The frame draws
 *  it 528×350, centred — so a fraction of the section's width, in that shape.
 *  Wider on a hand, where a third of the width is a stamp. */
const CARD = { w: 0.367, ar: 528 / 350 };
const CARD_NARROW = { w: 0.66, ar: 528 / 350 };

/** Where the card's top starts, as a fraction of the white above the band.
 *  High in that space, so it enters from under the fold just as the scatter
 *  above it runs out. */
const CARD_TOP = 0.1;

/** When the opening starts, as a fraction of the section's travel. Before it
 *  the card is a card, riding up the screen on the scroll like anything else;
 *  by this point it is clear of the bottom edge and worth watching. */
const OPEN_AT = 0.26;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The photograph opening out.
 *
 * Under the scrolled cut of the testimonials this section's picture is also
 * the last image of that scatter: it arrives as a small card in the white
 * above the band and opens out until it *is* the band. One photograph, all
 * the way through — there is no stand-in and no crossfade, because the thing
 * growing is the footer's own.
 *
 * NOTHING IS PINNED AND NOTHING IS HELD. The trigger runs from the section
 * entering the foot of the screen to its own bottom settling there, and the
 * section travels normally for every pixel of it. The picture opens as it
 * rises; then the reader scrolls on and the ink band comes up under it. That
 * is the whole handover, and the scroll never stops for any of it.
 *
 * The box is written per frame rather than scaled, so the photograph is never
 * shown at anything but its own resolution, and the copy standing on the band
 * is a separate layer that is laid out at its finished size from the start —
 * nothing is reflowed mid-scroll.
 *
 * Rebuilt from fresh measurements on every refresh: a resize changes the
 * screen, the section's width and how tall the band's own content makes it.
 */
function initGrow(section: HTMLElement, cleanups: Array<() => void>): void {
  const media = section.querySelector<HTMLElement>('[data-fq-media]');
  const band = section.querySelector<HTMLElement>('[data-fq-band]');
  if (!media || !band) return;

  let tl: gsap.core.Timeline | null = null;

  const build = () => {
    tl?.kill();

    const W = section.clientWidth;
    const top = section.getBoundingClientRect().top;

    /* The band, measured on itself rather than computed from the screen: it
       has a floor of its own and the copy inside it can push past that. */
    const rect = band.getBoundingClientRect();
    const full: Box = {
      left: 0,
      top: Math.round(rect.top - top),
      width: W,
      height: Math.round(rect.height),
    };

    const shape = W < 768 ? CARD_NARROW : CARD;
    const width = Math.round(W * shape.w);
    const card: Box = {
      left: Math.round((W - width) / 2),
      top: Math.round(full.top * CARD_TOP),
      width,
      height: Math.round(width / shape.ar),
    };

    tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    tl.fromTo(media, { ...card }, { ...card, duration: OPEN_AT }, 0).to(
      media,
      { ...full, duration: 1 - OPEN_AT, ease: 'power1.inOut' },
      OPEN_AT,
    );
  };

  build();

  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onRefreshInit: build,
    onRefresh: (self) => tl?.progress(self.progress),
    onUpdate: (self) => tl?.progress(self.progress),
  });

  tl?.progress(trigger.progress);

  cleanups.push(() => {
    trigger.kill();
    tl?.kill();
    gsap.set(media, { clearProps: 'left,top,width,height' });
  });
}

/**
 * Footer reveals.
 *
 * 1. The photograph opening out from a card into the band — see initGrow. Only
 *    under the scrolled cut of the testimonials, and only on the page that has
 *    it: everywhere else this footer arrives at full size, so there is nothing
 *    to open. Footer.astro gates the runway it needs on exactly the same two
 *    conditions.
 * 2. The quote copy and the portrait. Fired on the figure normally — the
 *    section is tall and firing from its top would start the tween before the
 *    copy is on screen — but on the section's own bottom edge when the
 *    photograph is opening, so the writing-on lands as the picture reaches
 *    its band rather than while it is still halfway there.
 * 3. The graffiti wordmark writes itself on — pen strokes inside the SVG mask
 *    trace the tag in the order it is drawn (T bar, T stem, r, i, b, e, the
 *    two dots), then a settle layer fades the finished mark in. Triggered on
 *    the ink band, which is a section of its own now and well below the
 *    photograph, so it plays as the reader arrives at it.
 *
 * Returns a cleanup function.
 */
export function initFounderQuote(): () => void {
  const section = document.querySelector<HTMLElement>('[data-quote]');
  if (!section) return () => {};

  // The CSS pre-reveal state is already neutralised under the same query, so
  // the section renders finished and this adds nothing.
  if (prefersReducedMotion()) return () => {};

  const cleanups: Array<() => void> = [];

  const items = gsap.utils.toArray<HTMLElement>('[data-quote-reveal]', section);
  const figure = section.querySelector<HTMLElement>('.fq__figure');

  /* Same two conditions as the stylesheet's runway: the scrolled cut is the
     picked one, and this page is the one it is on. */
  const opening =
    getVariant('testimonials') === 'float' && Boolean(document.querySelector('[data-tmf]'));

  if (opening) initGrow(section, cleanups);

  const tl = items.length
    ? gsap
        .timeline({
          defaults: { ease: 'power3.out' },
          scrollTrigger: opening
            ? { trigger: section, start: 'bottom bottom+=80', once: true }
            : { trigger: figure ?? section, start: 'top 80%', once: true },
        })
        .fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0)
    : null;

  /* The ink band is its own section now, so it is not inside [data-quote]. */
  const bandSection = document.querySelector<HTMLElement>('.ft__meta');
  const wordmark = bandSection?.querySelector<HTMLElement>('.ft__wordmark') ?? null;
  const pens = wordmark ? gsap.utils.toArray<SVGPathElement>('.wm-pen path', wordmark) : [];
  const settle = wordmark?.querySelector<SVGElement>('.wm-settle') ?? null;

  let write: gsap.core.Timeline | null = null;
  if (bandSection && pens.length) {
    write = gsap.timeline({
      scrollTrigger: { trigger: bandSection, start: 'top 78%', once: true },
    });
    write.to(pens, {
      strokeDashoffset: 0,
      duration: 0.42,
      ease: 'power1.inOut',
      stagger: 0.11,
    });
    if (settle) write.to(settle, { opacity: 1, duration: 0.4, ease: 'power1.out' }, '>-0.14');
  }

  return () => {
    cleanups.forEach((fn) => fn());
    tl?.scrollTrigger?.kill();
    tl?.kill();
    write?.scrollTrigger?.kill();
    write?.kill();
    ScrollTrigger.refresh();
  };
}
