import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Two ways in — the window opening.
 *
 * One job. The screen is a label, a sentence, and a rectangle cut low and
 * centre into the page; scrolling widens that rectangle until it is the whole
 * frame, and what was inside it — the Retainer section, drawn at full size
 * from the first frame — is what the reader is left in.
 *
 * It is a clip and not a box that grows, which is the whole reason the type
 * inside it survives the journey: `clip-path: inset()` changes how much of a
 * layer is shown and nothing about how it is drawn. A box that scaled from a
 * fifth of the screen to all of it would take its own headline with it.
 *
 * Scrubbed against the second step of the section's track, so the reader drives
 * it and can run it backwards. The copy goes as the window opens — it belongs
 * to this screen and not to the one arriving, and left up it would sit over the
 * top of another section's own words.
 *
 * The join ABOVE this section is not here. It is a pixel field that paints over
 * the last category of Our work and clears to leave this screen, and it lives
 * with the section it takes away — initWorkPixels in
 * src/scripts/workCategories.ts.
 *
 * Under reduced motion the window is simply open: the section is the Retainer
 * screen, with no copy over it and nothing to scroll through.
 *
 * Returns a cleanup function.
 */
export function initTwoWays(): () => void {
  const section = document.querySelector<HTMLElement>('[data-two]');
  if (!section) return () => {};

  const win = section.querySelector<HTMLElement>('[data-two-window]');
  const copy = section.querySelector<HTMLElement>('.two__copy');
  const steps = gsap.utils.toArray<HTMLElement>('[data-two-step]', section);
  if (!win || steps.length < 2) return () => {};

  if (prefersReducedMotion()) {
    gsap.set(section, { '--two-win-t': '0%', '--two-win-x': '0%' });
    if (copy) gsap.set(copy, { autoAlpha: 0 });
    return () => {
      gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
      if (copy) gsap.set(copy, { clearProps: 'opacity,visibility' });
    };
  }

  /* Read off the stylesheet rather than repeated here, so where the window
     rests is one decision made in one place — and so the phone's wider, higher
     rectangle comes through without this file knowing there is one. */
  const read = (name: string, fallback: string) =>
    getComputedStyle(section).getPropertyValue(name).trim() || fallback;

  const restT = read('--two-win-t', '62%');
  const restX = read('--two-win-x', '21%');

  const tl = gsap.timeline({
    scrollTrigger: {
      /* The second step. The first is spent on the reveal that brings the
         reader in and the beat after it — the window should not begin to open
         while the field of tiles that uncovered it is still clearing. */
      trigger: steps[1],
      start: 'top bottom',
      end: 'top top',
      scrub: 0.8,
      invalidateOnRefresh: true,
    },
  });

  /* The two variables the stylesheet builds the clip out of, rather than the
     clip itself. Two things read them — the window, and the invisible box the
     nav measures the dark ground by — and animating the shared numbers is what
     keeps those two the same shape without either knowing about the other. */
  tl.fromTo(
    section,
    { '--two-win-t': restT, '--two-win-x': restX },
    {
      '--two-win-t': '0%',
      '--two-win-x': '0%',
      /* Eased out, so the last of the opening is the slow part: the edges
         reach the corners of the screen rather than arriving at them. */
      ease: 'power2.out',
      duration: 1,
    },
    0,
  );

  /* And the copy leaves early — well before the window has reached it. Its
     sentence is about the choice the reader is being offered, and the moment
     the next section is most of the screen it is a line of type from somewhere
     else lying over it. */
  if (copy) {
    tl.fromTo(
      copy,
      { autoAlpha: 1 },
      { autoAlpha: 0, ease: 'power1.in', duration: 0.34, immediateRender: false },
      0,
    );
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
    if (copy) gsap.set(copy, { clearProps: 'opacity,visibility' });
  };
}
