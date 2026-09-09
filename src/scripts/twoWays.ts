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
  if (!win || steps.length < 4) return () => {};

  /* Picked by their wrappers, not by document order.

     Document order is the reverse of paint order here — the panel underneath is
     written first so the one on top can be uncovered from it — so
     `querySelectorAll('[data-offer]')[0]` is Retainer, not Sprint. Taken that
     way round the handover ran backwards: Retainer was masked off to reveal
     Sprint, and Sprint's words faded in at the end of it. Measured, and the
     giveaway was `tones: ["dark", "light"]`. */
  const over = section.querySelector<HTMLElement>('[data-two-pane] [data-offer]');
  const under = section.querySelector<HTMLElement>(
    '.two__pane--under [data-offer]',
  );
  const wordsOf = (el: HTMLElement | null) =>
    el ? gsap.utils.toArray<HTMLElement>('[data-offer-copy]', el) : [];
  const overWords = wordsOf(over);
  const underWords = wordsOf(under);
  const zone = section.querySelector<HTMLElement>('[data-two-zone]');

  if (prefersReducedMotion()) {
    gsap.set(section, { '--two-win-t': '0%', '--two-win-x': '0%' });
    gsap.set([...overWords, ...underWords], { autoAlpha: 1 });
    if (copy) gsap.set(copy, { autoAlpha: 0 });
    return () => {
      gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
      gsap.set([...overWords, ...underWords], { clearProps: 'opacity,visibility' });
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

  /* And the panel's own words, last of all.

     Held back until the window is within a couple of percent of the full frame,
     because until then the clip runs straight through them: what the reader got
     was the right-hand halves of three lines of a headline, which reads as
     something broken rather than as something arriving. The ground behind the
     window is visible the whole time; it is only the type that waits.

     0.68 is not an arbitrary two thirds. The opening is eased out, so by that
     point the window has already covered 96.7% of the distance to the corners
     of the screen — the number is late in the timeline and early in nothing the
     reader can see. */
  if (overWords.length) {
    tl.fromTo(
      overWords,
      { autoAlpha: 0 },
      { autoAlpha: 1, ease: 'power2.out', duration: 0.26 },
      0.68,
    );
  }

  const handover = initOfferHandover({ steps, over, under, overWords, underWords, zone });
  const exit = initTwoExit(section);

  return () => {
    handover();
    exit();
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
    gsap.set([...overWords, ...underWords], { clearProps: 'opacity,visibility' });
    if (copy) gsap.set(copy, { clearProps: 'opacity,visibility' });
  };
}

/**
 * Sprint → Retainer, once the window is a whole screen.
 *
 * The same movement the reader was brought out of Overclock by, which is what
 * was asked for: the panel on top is masked away from its own bottom edge
 * upwards behind a feather wider than half the screen, and the one underneath
 * — already there, whole, from the first frame — is what is left. Nothing
 * slides, nothing scales, and there is no edge to follow.
 *
 * The words are handled apart from the grounds they sit on, and that is the one
 * place this differs from a literal copy of that join. Both panels set their
 * type in the same corner, so a mask taking the first one's sentence away
 * gradually would be doing it directly on top of the second one's sentence
 * arriving — three lines of one headline at half strength over three lines of
 * another. They are only ever legible one at a time here: the first is gone by
 * a quarter of the way through and the second does not begin until two thirds.
 *
 * Scrubbed, so the reader drives it and can run it backwards.
 */
function initOfferHandover(parts: {
  steps: HTMLElement[];
  over: HTMLElement | null;
  under: HTMLElement | null;
  overWords: HTMLElement[];
  underWords: HTMLElement[];
  zone: HTMLElement | null;
}): () => void {
  const { steps, over, underWords, zone } = parts;
  /* The fourth step. The first is the window opening and the second is the beat
     on Sprint — a panel the reader has only just been shown should not start
     leaving in the same movement that finished showing it. */
  const step = steps[3];
  if (!step || !over) return () => {};

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: step,
      start: 'top bottom',
      end: 'top top',
      /* Smoothed by the same amount the Overclock join uses. A mask edge is
         read sharply by the eye even when it is soft. */
      scrub: 0.8,
      invalidateOnRefresh: true,
      /* The mask is only worth its compositing layer while it is doing
         something. Never taken off at the far end — removing it there would put
         Sprint back at full strength on top of the panel that has replaced
         it. */
      onEnter: () => over.setAttribute('data-offer-wiping', ''),
      onEnterBack: () => over.setAttribute('data-offer-wiping', ''),
      onLeaveBack: () => over.removeAttribute('data-offer-wiping'),
    },
  });

  /* Sprint's words first and quickest, so they are gone before Retainer's
     start. `immediateRender: false`: their resting state is on, and by this
     point the window's own timeline has put them there. */
  if (parts.overWords.length) {
    tl.fromTo(
      parts.overWords,
      { autoAlpha: 1 },
      { autoAlpha: 0, ease: 'power1.in', duration: 0.24, immediateRender: false },
      0,
    );
  }

  /* Then the ground it was on. */
  tl.fromTo(
    over,
    { '--offer-wipe': 0 },
    { '--offer-wipe': 155, ease: 'none', duration: 0.8, immediateRender: false },
    0.14,
  );

  /* And Retainer's words last, over a ground already two thirds replaced. This
     one renders at build, and has to: it is what parks them at 0 in step with
     the stylesheet. */
  if (underWords.length) {
    tl.fromTo(underWords, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'power2.out', duration: 0.3 }, 0.66);
  }

  /* And the nav's reading of the ground, on the same clock as the ground
     itself. The box draws nothing — its opacity is a signal, not a surface. */
  if (zone) {
    tl.fromTo(zone, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.4 }, 0.3);
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    over.removeAttribute('data-offer-wiping');
    gsap.set(over, { clearProps: '--offer-wipe' });
    if (zone) gsap.set(zone, { clearProps: 'opacity' });
  };
}

/**
 * Two ways in → What both models include: a fade, and only a fade.
 *
 * The screen goes and what was behind it is the next section, which has been
 * rising into view underneath for the length of it — `--inc-join` is that
 * overlap. No mask, no field of tiles: those are for handovers where one full
 * screen replaces another and the join has to be hidden. Here the reader is
 * leaving a held screen and rejoining ordinary scrolling page, and a dissolve
 * is what that transition is.
 *
 * It runs over the last stretch of Retainer's beat and finishes exactly as the
 * sticky screen lets go, so the panel is gone by the time it would otherwise
 * have started scrolling away — there is never a frame with a seam in it.
 *
 * The section's own ground is not involved, and cannot be: it lives on the
 * screen rather than on the section (see TwoWays.astro), which is what lets
 * this fade uncover anything at all.
 */
function initTwoExit(section: HTMLElement): () => void {
  const screen = section.querySelector<HTMLElement>('.two__stick');
  const next = document.querySelector<HTMLElement>('[data-inc]');
  if (!screen || !next || prefersReducedMotion()) return () => {};

  const tween = gsap.to(screen, {
    autoAlpha: 0,
    ease: 'none',
    scrollTrigger: {
      /* Measured against the arriving section's own top, which is exactly where
         the sticky screen lets go — so `top top` is the last frame the screen
         is still held, and the fade cannot outlast it. It starts 60% of a
         window earlier, which leaves Retainer a clear beat at full strength
         after it has arrived and before it begins to go. */
      trigger: next,
      start: 'top 60%',
      end: 'top top',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  return () => {
    tween.scrollTrigger?.kill();
    tween.kill();
    gsap.set(screen, { clearProps: 'opacity,visibility' });
  };
}
