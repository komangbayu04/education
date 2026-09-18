import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';
import { getVariant } from '../config/variations';

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
 * it and can run it backwards. The copy rises and goes as the window opens —
 * it belongs to this screen and not to the one arriving, and left up it would
 * sit over the top of another section's own words. It lifts rather than merely
 * fading because the window's edge climbs through where it stands; see the
 * tween for the arithmetic that sizes the lift.
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
/**
 * How much of the handover the crossfade takes.
 *
 * It ends well short of the step, and that margin is what keeps the two
 * sentences apart: Sprint's type fades with the panel carrying it, and
 * Retainer's does not begin until that panel is gone. Measured when this was a
 * slide and ran to 0.86, five of forty-one sampled frames had both sentences on
 * the screen at once — in two different places, which is worse than either.
 */
const FADE = 0.7;
/**
 * The scale Retainer arrives from. Its only job is to be a scale Sprint is not
 * at, so the two never line up while they are mixed — see initOfferHandover.
 */
const ARRIVE = 1.08;

/** How much of the window's opening the copy takes to leave. */
const COPY_FOR = 0.4;
/** How far above the window's edge the sentence's last line ends up. */
const COPY_CLEAR = 24;
/** And a rise of at least this share of the screen, whatever the geometry. */
const COPY_LEAST = 0.08;

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
     giveaway at the time was `tones: ["dark", "light"]` — which is no longer a
     test of anything, because both panels are white type on a dark photograph
     now. Read the names if this ever has to be checked again. */
  /* SIDE BY SIDE is the other reading of this section — the "Service section"
     axis in src/config/variations.ts. The window still opens, and it opens onto
     one pane holding both panels; there is no handover to build, because
     nothing is uncovered from anything. Everything below that names `over` and
     `under` is about the handover, so in this cut `over` is the pair (its words
     arrive together as the window finishes) and `under` is nothing. */
  const split = getVariant('offer') === 'split';

  const wordsOf = (el: HTMLElement | null) =>
    el ? gsap.utils.toArray<HTMLElement>('[data-offer-copy]', el) : [];

  const pair = section.querySelector<HTMLElement>('[data-two-split]');
  const over = split ? null : section.querySelector<HTMLElement>('[data-two-pane] [data-offer]');
  const under = split
    ? null
    : section.querySelector<HTMLElement>('.two__pane--under [data-offer]');
  const overWords = split ? wordsOf(pair) : wordsOf(over);
  const underWords = wordsOf(under);
  const zone = section.querySelector<HTMLElement>('[data-two-zone]');

  if (prefersReducedMotion()) {
    gsap.set(section, { '--two-win-t': '0%', '--two-win-x': '0%' });
    gsap.set([...overWords, ...underWords], { autoAlpha: 1 });
    if (copy) gsap.set(copy, { autoAlpha: 0 });
    return () => {
      gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
      gsap.set([...overWords, ...underWords], { clearProps: 'opacity,visibility' });
      if (copy) gsap.set(copy, { clearProps: 'opacity,visibility,transform' });
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

  /* AND THE COPY RISES AS IT GOES, which it did not: it stood exactly where it
     was and faded, so the window's top edge climbed THROUGH the sentence and
     cut its last line in half while the words were still legible. Measured at
     736x694: the sentence's foot is at 308px and the window's edge reaches
     140px by the time the fade is over — 168px of headline drawn inside the
     picture.

     THE DISTANCE IS WORKED OUT, NOT CHOSEN. `foot` is where the sentence ends,
     taken from layout rather than from painted pixels: `offsetTop` is transform
     free, so it reads the same before this tween has run and in the middle of
     it, which `getBoundingClientRect()` would not. `edge` is where the window's
     top will have climbed to at the moment the copy is gone, straight out of
     the tween above — the opening is `power2.out` across the whole timeline, so
     the share of the resting inset still left at `COPY_FOR` of it is
     `(1 - COPY_FOR)³`.

     CUBED, AND THAT IS NOT A TYPO FOR SQUARED. GSAP counts its powers from
     `power1` for a quadratic, so `power2` is a cubic. Squared here put the
     window's edge at 211px when it was really at 126, and the sentence was
     left with 10px of clearance where it was supposed to have 24 — measured at
     1440x900, and the arithmetic was only ever a third of a line away from
     cutting type again.

     The gap between the two, plus a margin, is what the copy has to travel for
     its last line to be clear before the edge arrives. The floor keeps a
     visible lift on a layout where the two would never have met anyway, because
     a rise is what was asked for and not merely the absence of a collision.

     A function value, so `invalidateOnRefresh` on the trigger re-reads it: the
     sentence is three lines at 1440 and five on a phone, and its foot moves
     with every one of them. */
  if (copy) {
    const title = section.querySelector<HTMLElement>('.two__title');
    const screen = section.querySelector<HTMLElement>('.two__stick');

    const rise = () => {
      /* THE STICKY SCREEN, not the section. The section is the whole track this
         scrolls through — 5220px at 1440x900 — so measured against it the
         window's edge landed a screen and a half below the fold, the difference
         came out negative, and every rise fell through to the floor: 418px
         instead of 267, taken from a number that was never a viewport. */
      const vh = screen?.clientHeight || window.innerHeight;
      const foot = title ? title.offsetTop + title.offsetHeight : 0.45 * vh;
      const edge = (parseFloat(restT()) / 100) * (1 - COPY_FOR) ** 3 * vh;
      return -Math.max(foot - edge + COPY_CLEAR, COPY_LEAST * vh);
    };

    /* Two tweens over the same stretch rather than one, because the two halves
       of this want opposite eases and a tween has one. The fade holds on and
       then goes; the lift starts at once and eases off — which is what makes it
       read as the copy leaving rather than as the copy being switched off while
       something slid. One tween carrying both would have to pick, and either
       choice is wrong for the other property. */
    tl.fromTo(
      copy,
      { autoAlpha: 1 },
      { autoAlpha: 0, ease: 'power1.in', duration: COPY_FOR, immediateRender: false },
      0,
    );

    tl.fromTo(
      copy,
      { y: 0 },
      { y: rise, ease: 'power2.out', duration: COPY_FOR, immediateRender: false },
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

  /* And with both panels on the screen the dark ground is there the moment the
     window is, so the nav is told by the same clock the window runs on rather
     than by a handover that never happens. */
  if (split && zone) {
    tl.fromTo(zone, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.3 }, 0.55);
  }

  const handover = split
    ? () => {
        if (zone) gsap.set(zone, { clearProps: 'opacity' });
      }
    : initOfferHandover({ steps, over, under, overWords, underWords, zone });
  const exit = initTwoExit(section);

  return () => {
    handover();
    exit();
    tl.scrollTrigger?.kill();
    tl.kill();
    gsap.set(section, { clearProps: '--two-win-t,--two-win-x' });
    gsap.set([...overWords, ...underWords], { clearProps: 'opacity,visibility' });
    if (copy) gsap.set(copy, { clearProps: 'opacity,visibility,transform' });
  };
}

/**
 * Sprint → Retainer, once the window is a whole screen.
 *
 * THIRD ANSWER, AND THE FIRST TWO BOTH FAILED THE SAME TEST: the mechanism was
 * visible. That is what "seamless" is asking for here, and it is the thing to
 * design against.
 *
 * The first was a mask — a feather 55% of the screen deep, wiping upwards, the
 * instrument that brings the reader out of Overclock and changes Our work's
 * categories over. The mechanism showed as a SMEAR: at any moment one part of
 * the screen was at a quarter strength, another at three quarters, so the two
 * photographs were being mixed by different amounts in different places, which
 * the eye reads as one picture ghosting rather than two changing.
 *
 * The second was a slide, and it traded that for a HARD EDGE TRAVELLING across
 * the frame. Nothing was blended, which was the point, but a straight line
 * crossing a photograph is about as visible as a mechanism gets — the deep
 * feather on the first one existed precisely to avoid it.
 *
 * So: no edge and no gradient. A UNIFORM CROSSFADE, the whole frame mixed by
 * the same amount at every point of it, which is the one kind of blend with
 * nothing in it to follow. Sprint's opacity is the only thing that changes
 * about it, and Retainer is behind it at full strength from the first frame, so
 * the mix is exact and there is no third state anywhere on the screen.
 *
 * `power2.inOut` on the fade, and that is not a taste: an even mix of two
 * similar photographs is the frame that ghosts, so the ease is chosen to spend
 * as little of the scroll near half as it can while still starting and stopping
 * gently. Linear would sit at 50/50 through the middle of the move.
 *
 * And Retainer settles from 1.08 rather than sitting still. This is the part
 * that stops a dissolve reading as a double exposure: at the moment the two are
 * evenly mixed they are at DIFFERENT SCALES, so nothing in one lines up with
 * anything in the other, and what the eye gets is one picture coming forward
 * instead of two pictures printed on each other. Only the arriving panel moves
 * — a counter-scale on both would put them at the same size at the crossover,
 * which is the alignment this exists to break. It is the same language as the
 * film that opens Our work, which also arrives from larger than the frame.
 *
 * The words leave separately, and they have to. Both panels set their type in
 * the same corner, so a fade taking Sprint's sentence away gradually would be
 * doing it directly on top of Retainer's arriving. They are only ever legible
 * one at a time: the first goes with its own panel and the second does not
 * begin until the panel under it is the whole frame.
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
  const { steps, over, under, underWords, zone } = parts;
  /* The fourth step. The first is the window opening and the second is the beat
     on Sprint — a panel the reader has only just been shown should not start
     leaving in the same movement that finished showing it. */
  const step = steps[3];
  if (!step || !over) return () => {};

  /* The same guard Our work's handovers carry, for the same reason: a scrub
     chases the scroll, and a reader who throws the page past this in one flick
     watches two panels chase at once. Crossing an edge is not a matter of
     degree, so both edges assert the state outright. */
  const settle = (done: boolean) => {
    if (parts.overWords.length) gsap.set(parts.overWords, { autoAlpha: done ? 0 : 1 });
    if (underWords.length) gsap.set(underWords, { autoAlpha: done ? 1 : 0 });
    gsap.set(over, { autoAlpha: done ? 0 : 1 });
    if (under) gsap.set(under, { scale: done ? 1 : ARRIVE });
    if (zone) gsap.set(zone, { opacity: done ? 1 : 0 });
  };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: step,
      start: 'top bottom',
      end: 'top top',
      /* Smoothed by the same amount the Overclock join uses. A mask edge is
         read sharply by the eye even when it is soft. */
      scrub: 0.8,
      invalidateOnRefresh: true,
      /* The compositing hint is only worth its layer while something is
         moving. Never taken off at the far end — Sprint is still a screen above
         where it started there, and it is the transform that is holding it
         there. */
      onEnter: () => over.setAttribute('data-offer-wiping', ''),
      onEnterBack: () => over.setAttribute('data-offer-wiping', ''),
      onLeave: () => settle(true),
      onLeaveBack: () => {
        over.removeAttribute('data-offer-wiping');
        settle(false);
      },
    },
  });

  /* Sprint's opacity, and nothing else about it. Retainer is behind it at full
     strength already, so this one number IS the mix — the same everywhere on
     the frame, with no edge and no gradient anywhere in it.

     `immediateRender: false`, so building this cannot switch off a panel the
     reader is looking at. */
  tl.fromTo(
    over,
    { autoAlpha: 1 },
    { autoAlpha: 0, ease: 'power2.inOut', duration: FADE, immediateRender: false },
    0,
  );

  /* And Retainer settling forward from a little larger, over the same stretch.

     `power1.inOut`, and the ease is the whole point of the tween. What this is
     for is the two panels being at DIFFERENT scales at the frame where they are
     most evenly mixed, and that frame is the middle. Measured with `power2.out`
     on it: the scale was 1.02 by a quarter of the way through and 1.0025 by
     half, so at the 50/50 crossover the two pictures were within one per cent
     of each other — which is not a difference, it is an alignment, and an
     alignment is the double exposure this exists to prevent. Eased in and out,
     the crossover falls at about 1.04, which displaces the arriving picture's
     edges by up to 2% of the screen against the leaving one. */
  if (under) {
    tl.fromTo(
      under,
      { scale: ARRIVE },
      { scale: 1, ease: 'power1.inOut', duration: FADE, immediateRender: false },
      0,
    );
  }

  /* Sprint's words, held at full strength until the panel they are written on
     has gone. They are inside it, so its own fade has already taken them — this
     is what keeps that state reversible under a scrub, and what stops them
     coming back at half strength over Retainer's sentence if the reader runs
     the page backwards through here. */
  if (parts.overWords.length) {
    tl.fromTo(
      parts.overWords,
      { autoAlpha: 1 },
      { autoAlpha: 0, ease: 'none', duration: 0.1, immediateRender: false },
      FADE,
    );
  }

  /* And Retainer's words last of all, on a screen that is already entirely its
     own and has stopped moving. This one renders at build, and has to: it is
     what parks them at 0 in step with the stylesheet. */
  if (underWords.length) {
    tl.fromTo(
      underWords,
      { autoAlpha: 0 },
      { autoAlpha: 1, ease: 'power2.out', duration: 0.22 },
      FADE + 0.04,
    );
  }

  /* And the nav's reading of the ground, on the same clock as the ground
     itself. The box draws nothing — its opacity is a signal, not a surface. */
  if (zone) {
    tl.fromTo(zone, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.35, immediateRender: false }, 0.25);
  }

  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    over.removeAttribute('data-offer-wiping');
    gsap.set(over, { clearProps: 'opacity,visibility,transform' });
    if (under) gsap.set(under, { clearProps: 'transform' });
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
