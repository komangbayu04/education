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
 * How much of the handover Sprint takes to travel its screen.
 *
 * It ends well short of the step, and that margin is what keeps the two
 * sentences apart. A slide carries the old panel's type off the top with it, so
 * the type is legible for almost the whole of the travel — stepping the
 * timeline in fortieths at 390x844 with this at 0.86, five of the forty-one
 * frames had a strip of Sprint's sentence still at the top of the screen while
 * Retainer's was already up at the foot. Two headlines, in two places, at once.
 * Finishing the travel first leaves room to bring the new one in after the old
 * one has gone, rather than over it.
 */
const SLIDE = 0.7;
/**
 * How far below its place Retainer starts, as a share of the screen. Anything
 * under 1 is safe; see the note on initOfferHandover for the proof.
 */
const LAG = 0.12;

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

  const handover = initOfferHandover({ steps, over, under, overWords, underWords, zone });
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
 * Sprint → Retainer, once the window is a whole screen. SPRINT LEAVES THE
 * FRAME, and Retainer — already there, whole, from the first frame — is what it
 * uncovers.
 *
 * IT WAS A DISSOLVE AND IT SHOULD NOT HAVE BEEN. The panel on top was masked
 * away from its bottom edge upwards behind a feather 55% of the screen deep,
 * which is the instrument that brings the reader out of Overclock and changes
 * Our work's categories over, and it is right in both of those places. It is
 * wrong here. A feather that deep means most of the scroll is spent with more
 * than half the screen showing BOTH photographs at part strength — and these
 * two are a doorway onto grass and a lawn under a blue wall, near enough alike
 * for the blend to read as one picture ghosting rather than as two pictures
 * changing.
 *
 * So nothing is blended now. Sprint travels one screen upwards and off, at full
 * strength the whole way, and every pixel on screen belongs to exactly one of
 * the two panels at every moment of it.
 *
 * Retainer moves a little too, in the same direction, from an eighth of a
 * screen low. That is depth and not decoration: a reveal where the thing
 * underneath is perfectly still reads as a sticker being peeled off a picture,
 * and this reads as the two of them lying at different distances.
 *
 * IT CANNOT OPEN A GAP, and that is arithmetic rather than a margin of safety.
 * Sprint's bottom edge is at `(1 - p)·h` and Retainer's top edge is at
 * `LAG·(1 - p)·h`, so with any LAG below 1 the first is below the second for
 * every p short of 1, and at p = 1 they meet exactly at the top of the screen.
 * The two share an ease for the same reason — the inequality holds between the
 * eased values, not the raw ones, and only while both are eased the same way.
 *
 * The words still leave separately, though it hardly shows now. Both panels set
 * their type in the same corner, and the fade is what keeps the state
 * reversible under a scrub: by the time it runs, Sprint's sentence has already
 * travelled off the top of the screen.
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
    gsap.set(over, { yPercent: done ? -100 : 0 });
    if (under) gsap.set(under, { yPercent: done ? 0 : LAG * 100 });
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

  /* Sprint, one screen up and off. Linear, and deliberately so: this is
     scrubbed, so linear is the panel going exactly as far as the reader has
     pushed it — which is the whole of what makes a slide feel solid rather than
     animated at you. The trigger's own 0.8 of smoothing is what takes the
     hard edges off the start and the stop.

     `immediateRender: false`, so building this cannot move a panel the reader
     is looking at. */
  tl.fromTo(
    over,
    { yPercent: 0 },
    { yPercent: -100, ease: 'none', duration: SLIDE, immediateRender: false },
    0,
  );

  /* And Retainer up behind it, from an eighth of a screen low to nothing. Same
     ease and same stretch as the panel above — see the note at the top for why
     those two have to match rather than merely look similar. */
  if (under) {
    tl.fromTo(
      under,
      { yPercent: LAG * 100 },
      { yPercent: 0, ease: 'none', duration: SLIDE, immediateRender: false },
      0,
    );
  }

  /* Sprint's words, after the panel carrying them has gone. Nothing is visible
     to fade by then and that is the point: the sentence leaves by travelling
     off the screen, the way everything else on that panel does. What this tween
     is really for is the scrub — running the page backwards has to bring them
     back, and only something on this timeline will. */
  if (parts.overWords.length) {
    tl.fromTo(
      parts.overWords,
      { autoAlpha: 1 },
      { autoAlpha: 0, ease: 'none', duration: 0.1, immediateRender: false },
      SLIDE,
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
      SLIDE + 0.04,
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
    gsap.set(over, { clearProps: 'transform' });
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
