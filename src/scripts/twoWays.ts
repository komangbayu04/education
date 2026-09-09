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
     rectangle comes through without this file knowing there is one.

     Read through a function, and re-read on every refresh. Captured once, the
     rectangle a reader arrived at was the only one they ever got: rotating a
     phone, or dragging a window across the breakpoint, left the window
     animating from the OTHER layout's numbers — because the tween writes these
     two variables as inline styles, and an inline style beats the media query
     that was supposed to have changed them. Measured at 360 wide after a
     resize from 1440: the clip still read `inset(65% 21%)` where the phone's
     rule says 56% and 6%.

     `invalidateOnRefresh` on the trigger is what makes the re-read happen —
     it invalidates the tween, and an invalidated tween re-evaluates any value
     given as a function. */
  const read = (name: string, fallback: string) => () => {
    /* The inline values the tween itself writes have to be stepped over, or
       the second refresh would read back the first refresh's answer. */
    const inline = section.style.getPropertyValue(name);
    if (inline) section.style.removeProperty(name);
    const value = getComputedStyle(section).getPropertyValue(name).trim() || fallback;
    if (inline) section.style.setProperty(name, inline);
    return value;
  };

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
    { '--two-win-t': restT, '--two-win-x': restX, immediateRender: true },
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
 * Two ways in → What both models include: Retainer's sentence goes, and the
 * next section arrives over the top of what it was written on.
 *
 * There is no fade of the screen itself and there does not need to be. Retainer
 * sits on the same black the next section runs on, and that section is ordinary
 * scrolling page rather than something parked and waiting — so it rises from
 * the foot of the window under its own steam and simply covers the screen,
 * black over black. The only thing the reader can see change is the words.
 *
 * Two attempts at fading that screen are worth remembering, because they fail
 * in opposite directions and the second is the one that looks like the fix.
 *
 * Fading the screen ALONE put a grey band across the top of the frame: the
 * screen is held while the section under it is still short of the top, so above
 * that section there was nothing behind the fade but the page's own white, and
 * black at half strength over white is a mid grey.
 *
 * Fading the WORDS alone and leaving the screen opaque was worse in a way that
 * took longer to see: the screen then scrolled away still covering everything,
 * and the first window of the next section — its label and its whole row of
 * cards — was never on the page at all.
 *
 * Both were the same mistake, which was keeping that screen above the section
 * replacing it. It is below now (see the z-index note in Included.astro) and
 * neither fade is needed.
 *
 * The sentence goes early, over the window in which the next section is
 * climbing into view, so it is finished well before the cards are high enough
 * to read. A headline at half strength over a field of cards is the thing every
 * handover on this page is arranged to avoid.
 */
function initTwoExit(section: HTMLElement): () => void {
  const words = gsap.utils.toArray<HTMLElement>(
    '.two__pane--under [data-offer-copy]',
    section,
  );
  const next = document.querySelector<HTMLElement>('[data-inc]');
  if (!words.length || !next || prefersReducedMotion()) return () => {};

  /* `fromTo`, and the `from` is the whole point.

     A plain `to` records the value it should return to the first time it
     renders — and these words spend the whole page at `autoAlpha: 0`, because
     that is their resting state in the stylesheet until the panel they belong
     to is uncovered. Recorded then, the tween read 0 as the start AND 0 as the
     end, so the moment the reader crossed into its range it pinned them at
     nothing and Retainer went blank: a black screen with no words on it,
     immediately, on the scroll that should have been its beat.

     Stating the `from` takes the recording out of it. `immediateRender: false`
     so building the tween does not switch off a panel the reader may be
     looking at. */
  const tween = gsap.fromTo(words, {
    autoAlpha: 1,
  }, {
    autoAlpha: 0,
    ease: 'none',
    immediateRender: false,
    scrollTrigger: {
      /* From the next section's top entering the foot of the window to it
         being a little over half way up — so the sentence is gone with most of
         that window still to climb. */
      trigger: next,
      start: 'top bottom',
      end: 'top 55%',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  return () => {
    tween.scrollTrigger?.kill();
    tween.kill();
    gsap.set(words, { clearProps: 'opacity,visibility' });
  };
}
