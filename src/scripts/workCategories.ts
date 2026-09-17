import { gsap, ScrollTrigger, SplitText } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Our work — fantasy.co's services list, and what drives it.
 *
 * The layout does most of the work by itself: the titles are in ordinary flow
 * a screen apart and scroll past a sticky stage. This file adds four things,
 * each a copy of what fantasy's list component does:
 *
 *   the stage    which category is showing. Set by the titles — a title coming
 *                up into the window makes its category the one on the stage,
 *                with the 0.35s fade in the stylesheet.
 *
 *   the texts    the description and button fade up, scrubbed, while their
 *                title's foot rises from 175px to 350px above the bottom edge.
 *
 *   the letters  each title's characters (and its number's) blur in over the
 *                first part of its pass across the window and blur out over the
 *                last — fantasy's `charsInOut` effect, scrubbed.
 *
 *   the outro    the join below: a pixel field hands the last screen to Two
 *                ways in. See initWorkPixels.
 *
 * And one thing before any of them, for the first item — Overclock's opening,
 * the film growing from small on black to the full screen as the section
 * arrives. See `--cat-opening` in WorkCategories.astro.
 *
 * Returns a cleanup function.
 */
/** How far above the description the title's foot has to be before it fades in. */
const TEXTS_CLEAR = 16;

export function initWorkCategories(): () => void {
  const section = document.querySelector<HTMLElement>('[data-cat]');
  if (!section) return () => {};

  const layers = gsap.utils.toArray<HTMLElement>('[data-cat-layer]', section);
  const titles = gsap.utils.toArray<HTMLElement>('[data-cat-title]', section);
  if (!layers.length || titles.length !== layers.length) return () => {};

  const reduced = prefersReducedMotion();
  const cleanups: Array<() => void> = [];

  // --- The opening ---------------------------------------------------------
  /**
   * Overclock's arrival, as it was when it was a chapter of its own: the film
   * is already running in a small box low in the middle of a black screen as
   * the section comes up, and grows to fill it. Scaled, not clipped — the whole
   * frame is in the box from the first moment, at the size the box is.
   *
   * The same numbers the chapter had: 44% and 8% low to full, `power2.inOut`,
   * starting when the section is 70% up the window, smoothed by 0.6. It ends
   * when the opening marker reaches the top, which is the scroll the first
   * title's top reaches the bottom edge on.
   *
   * Playing from the first frame it is on the page, not from the moment it is
   * big enough to look at: a film that starts when it is visible reads as a
   * video element loading.
   */
  const film = section.querySelector<HTMLVideoElement>('video[data-cat-grow]');
  const opening = section.querySelector<HTMLElement>('[data-cat-opening]');

  if (film) {
    film.muted = true;
    void film.play().catch(() => {});
  }

  if (film && opening && !reduced) {
    const grow = gsap.fromTo(
      film,
      { scale: 0.44, yPercent: 8, transformOrigin: '50% 50%' },
      {
        scale: 1,
        yPercent: 0,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: section,
          start: 'top 30%',
          endTrigger: opening,
          end: 'top top',
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      },
    );

    cleanups.push(() => {
      grow.scrollTrigger?.kill();
      grow.kill();
      gsap.set(film, { clearProps: 'transform' });
    });
  }

  // --- The stage -----------------------------------------------------------
  /**
   * Fantasy makes a title the active one when it enters the window from either
   * edge, and leaves the choice alone while no title is on screen. So in the
   * screen of empty space between two titles the stage shows whichever one the
   * reader last passed: the upper one on the way down, the lower one on the way
   * back up.
   *
   * That is reproduced here from POSITION rather than from enter and leave
   * events, and the difference only shows when the scroll jumps. An anchor
   * link, a reload halfway down, a flick across three titles in one frame —
   * events fired in order can leave the stage on a category the reader is
   * nowhere near. Worked out from where the titles are, it cannot:
   *
   *   a title is on screen          that category, always.
   *   none is, between k and k+1    k or k+1 is right, depending on direction;
   *                                 whatever is showing is kept if it is one of
   *                                 those, and set to k if it is not.
   *   none has arrived yet          the first.
   */
  let active = 0;
  const show = (i: number) => {
    if (i === active) return;
    layers[active]?.classList.remove('is-active');
    layers[i]?.classList.add('is-active');
    active = i;
  };

  layers.forEach((layer, i) => layer.classList.toggle('is-active', i === 0));

  const settle = () => {
    const vh = window.innerHeight;
    let last = -1;
    let onScreen = false;

    titles.forEach((title, i) => {
      const { top, bottom } = title.getBoundingClientRect();
      if (top < vh) {
        last = i;
        onScreen = bottom > 0;
      }
    });

    if (last < 0) show(0);
    else if (onScreen) show(last);
    else if (active !== last && active !== last + 1) show(last);
  };

  const stage = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: settle,
    onToggle: settle,
    onRefresh: settle,
  });

  settle();

  cleanups.push(() => {
    stage.kill();
    layers.forEach((layer, i) => layer.classList.toggle('is-active', i === 0));
  });

  // --- The texts and the letters -------------------------------------------
  if (!reduced) {
    const splits: SplitText[] = [];

    titles.forEach((title, i) => {
      const head = title.parentElement;
      const num = head?.querySelector<HTMLElement>('[data-cat-num]') ?? null;
      const end = head?.querySelector<HTMLElement>('[data-cat-title-end]') ?? null;
      const texts = layers[i]?.querySelector<HTMLElement>('[data-cat-texts]') ?? null;

      /* The description and button, once the title has CLEARED THEM.

         Measured from where the block actually is, not from the bottom edge.
         This ran while the title's foot climbed from one strip-depth to two
         above the bottom of the window — fantasy's figure, and a fixed one — and
         the block it was fading in stands at the foot of the screen with a
         height of its own. On a short phone those are the same stretch of
         screen: measured at 320x568, the letters of "Product Design" and "Brand
         Design" were still passing through the description while it was more
         than half drawn. On a desktop it was the same collision at lower
         opacity, which is why nothing flagged it there.

         So it starts when the title's foot is a little above the TOP of the
         block, and runs for the same strip-depth it always has. `offsetTop` is
         the block's place on the stage in layout — the stage is the screen
         while it is stuck, so that is its height on the screen too — and it is
         read again on every refresh, because the block's height changes with
         the width and with how many lines the description takes.

         Scrubbed with no smoothing, as fantasy's is, and with no fade back out:
         once it is up it stays up, and the layer's own fade takes it away when
         the next category arrives. Scrolled back past, the scrub runs it down. */
      if (texts && end) {
        const clearOf = () => texts.offsetTop - TEXTS_CLEAR;
        const tween = gsap.fromTo(
          texts,
          { opacity: 0 },
          {
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: end,
              start: () => `bottom ${Math.round(clearOf())}px`,
              end: () => `bottom ${Math.round(clearOf() - end.offsetHeight)}px`,
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );

        cleanups.push(() => {
          tween.scrollTrigger?.kill();
          tween.kill();
          gsap.set(texts, { clearProps: 'opacity' });
        });
      }

      /* The letters, over the title's whole pass: from its top meeting the
         bottom edge to its foot leaving the top one.

         Fantasy's numbers exactly. Each character takes a quarter of the
         timeline and the stagger spreads a quarter across all of them, so the
         blur-in fills the first 0.5 of a 1.25 timeline and the blur-out starts
         at 0.75 — the headline is whole and sharp for the stretch in between,
         which is the middle of the window.

         Words and characters only, no lines. Nothing here animates a line, and
         a line split is the one kind that has to be cut again when the window
         changes width. */
      const split = SplitText.create(num ? [num, title] : [title], { type: 'words, chars' });
      splits.push(split);

      /* Every character put at the start of its blur-in NOW, and not left to
         the tween below to do.

         A staggered `fromTo` renders its from-state only for the characters
         whose turn has come. Measured before this line: at rest below the
         window the number's two characters read 0 and the headline's
         twenty-seven read 1, sharp — so a title came up over the bottom edge
         fully drawn, and then each letter snapped to nothing and blurred back
         in as its stagger reached it. Fantasy renders these hidden in its
         markup; this is that. */
      gsap.set(split.chars, { opacity: 0, filter: 'blur(10px)' });

      const tl = gsap.timeline({
        defaults: { duration: 0.25 },
        scrollTrigger: { trigger: title, scrub: true, invalidateOnRefresh: true },
      });

      tl.fromTo(
        split.chars,
        { opacity: 0, filter: 'blur(10px)' },
        { opacity: 1, filter: 'blur(0px)', ease: 'none', stagger: { amount: 0.25 } },
        0,
      );

      /* `fromTo` with its start stated, and `immediateRender: false`, rather
         than a `to`: a `to` records where it starts from the first time it
         renders, and a page reloaded past this title renders it before the
         blur-in above has ever put the letters at full strength. */
      tl.fromTo(
        split.chars,
        { opacity: 1, filter: 'blur(0px)' },
        {
          opacity: 0,
          filter: 'blur(10px)',
          ease: 'power2.in',
          stagger: { amount: 0.25 },
          immediateRender: false,
        },
        0.75,
      );

      cleanups.push(() => {
        tl.scrollTrigger?.kill();
        tl.kill();
      });
    });

    cleanups.push(() => splits.forEach((split) => split.revert()));
  }

  // --- The outro -----------------------------------------------------------
  cleanups.push(initWorkPixels(section, reduced));

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}

/**
 * Our work → Two ways in: a pixel reveal, and the one transition on this page
 * that plays itself.
 *
 * Everywhere else the reader drives the motion and can run it backwards a
 * frame at a time. Here they do not: crossing into the join starts a field of
 * cream tiles painting across the screen in a random order, and it finishes on
 * its own clock whether they keep scrolling or stop. That is deliberate and it
 * is scoped to this one join — it was asked for as "one scroll", and a scatter
 * of tiles is the one effect on the page that wants a tempo of its own. Tied
 * to a scrub, a field of squares appearing at the speed of a trackpad reads as
 * a rendering fault rather than as a transition.
 *
 * What it is NOT is a scroll hijack. Nothing here takes the scrollbar: both
 * screens are already held still by their own sticky layers for the length of
 * `--two-join`, so the reader who keeps scrolling simply arrives at the far
 * side of a window in which nothing was going to move anyway.
 *
 * Three beats, in a little over a second:
 *
 *   cover     the tiles come on, scattered. Cream, which is Two ways in's own
 *             ground — so the completed field is already the colour of the
 *             section arriving, and the second half uncovers that section's
 *             content rather than fading up its background.
 *
 *   swap      Our work's screen is switched off behind the full field. This is
 *             the only frame where the layers change, and there is nothing to
 *             see through.
 *
 *   clear     the same tiles go off, in a different scatter, onto Two ways in.
 *
 * Reversible at the boundary rather than through the middle: scrolling back up
 * into the join from below runs the whole thing backwards, over the same
 * stretch of page the forward pass used, with both screens held still for all
 * of it. It cannot be scrubbed to a half-state because it has no half-states
 * the scroll owns.
 *
 * Returns a cleanup function.
 */
function initWorkPixels(section: HTMLElement, reduced: boolean): () => void {
  const field = document.querySelector<HTMLElement>('[data-work-pixels]');
  const two = document.querySelector<HTMLElement>('[data-two]');
  const screen = section.querySelector<HTMLElement>('[data-cat-dissolve]');
  if (!field || !two || !screen) return () => {};

  if (reduced) {
    /* No field at all. The two sections simply abut, which under reduced
       motion is what a transition is. */
    return () => {};
  }

  /** How many tiles across the longer edge of the window. */
  const ACROSS = 22;
  /** How long each half of the reveal takes. */
  const HALF = 0.55;

  let tiles: HTMLElement[] = [];

  /* Built to the window, and rebuilt when it changes: a grid sized for a
     desktop is a handful of enormous blocks on a phone.

     Returns whether it actually replaced the tiles, because the timeline below
     animates the spans it was handed and a replaced span is not one of them —
     see `rebuild`. */
  const build = (): boolean => {
    const size = Math.ceil(Math.max(window.innerWidth, window.innerHeight) / ACROSS);
    const cols = Math.ceil(window.innerWidth / size);
    const rows = Math.ceil(window.innerHeight / size);

    field.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
    field.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;

    const wanted = cols * rows;
    if (tiles.length === wanted) return false;

    field.replaceChildren();
    tiles = Array.from({ length: wanted }, () => document.createElement('span'));
    field.append(...tiles);
    return true;
  };

  build();

  const makeTimeline = () => {
  const tl = gsap.timeline({ paused: true });

  /* Visible only while it is doing something: a fixed sheet of five hundred
     boxes is five hundred boxes the compositor is carrying, and for all but a
     second of the page's life it has nothing to carry them for. */
  tl.set(field, { visibility: 'visible' });

  tl.to(
    tiles,
    {
      opacity: 1,
      duration: 0.12,
      ease: 'none',
      stagger: { each: HALF / Math.max(tiles.length, 1), from: 'random' },
    },
    0,
  );

  /* The swap, under a full field.

     `fromTo`, and neither of the two simpler spellings would do. A `set` has
     no start value to go back to, and this timeline is run backwards as well
     as forwards. A `to` records its start the first time it renders, which for
     a paused timeline is whenever something first touches it — and at that
     moment Our work's screen may legitimately be hidden, since it is faded up
     by the join out of Overclock. Measured: rendered once before the reader
     had got that far, the tween recorded 0 as the value to return to and the
     swap did nothing for the rest of the session.

     `immediateRender: false` for the same reason it is on every other tween in
     this file whose resting state is "on": building the timeline must not
     switch off the screen the reader is currently looking at. */
  tl.fromTo(
    screen,
    { autoAlpha: 1 },
    { autoAlpha: 0, duration: 0.001, immediateRender: false },
    HALF + 0.12,
  );

  tl.to(
    tiles,
    {
      opacity: 0,
      duration: 0.12,
      ease: 'none',
      stagger: { each: HALF / Math.max(tiles.length, 1), from: 'random' },
    },
    HALF + 0.14,
  );

  tl.set(field, { visibility: 'hidden' });

    return tl;
  };

  /* NOT a const, and this is the whole of the bug it fixes.

     The timeline animates the spans it was handed at build time. `build`
     replaces those spans whenever the tile count changes — which is any resize
     that crosses a tile boundary, and on a phone that includes the address bar
     sliding away, because the field is sized to `innerHeight`. After one of
     those the timeline was still animating a few hundred detached elements:
     the swap in the middle still fired, so Our work went and Two ways in
     arrived, with no pixels between them. A transition that disappears after
     the window is touched and comes back on reload.

     So the tiles and the timeline are rebuilt together, and the new one is put
     where the old one was — a refresh can land at any point, including the
     middle of a play. */
  let tl = makeTimeline();

  const rebuild = () => {
    if (!build()) return;
    const at = tl.progress();
    tl.kill();
    tl = makeTimeline();
    tl.progress(at).pause();
  };

  /* How long the two screens overlap, measured off the page rather than read
     out of a stylesheet: it is the gap between Two ways in's top and the top of
     its own first step, which is the stretch where its screen is parked and
     still with nothing of its own happening yet. `--two-join` is where that is
     actually set. */
  const twoTrack = two.querySelector<HTMLElement>('.two__track');
  const window_ = () => {
    if (!twoTrack) return globalThis.innerHeight;
    const gap = twoTrack.getBoundingClientRect().top - two.getBoundingClientRect().top;
    return gap > 0 ? gap : globalThis.innerHeight;
  };

  const trigger = ScrollTrigger.create({
    /* The overlap itself, both ends of it, and it needs both.
       
       Going down, the reveal starts at the top of this window: that is the
       first frame where Two ways in's screen is stuck and filling the frame
       behind this one, so there is something under the field to clear onto.

       Going up, it has to start at the BOTTOM of the window, and this is what
       a single point could not express. Reversing at the top meant the reader
       climbed the whole overlap with the field idle — watching Two ways in sit
       there and then slide down out of the way — and the tiles only began
       coming back as the two screens were already parting. Reversed from the
       far end, the reader goes back up through exactly the stretch the two
       screens are both held still for, and what they see is the field painting
       back over Two ways in and clearing to leave Marketing where they left
       it. */
    trigger: two,
    start: 'top top',
    end: () => `+=${window_()}`,
    /* The four crossings, and the two `Leave`s are not redundant. A reader who
       covers 900px faster than the reveal takes to play has to arrive with the
       layers in the right state anyway, so each far edge snaps the timeline to
       the end it belongs to. At any ordinary scrolling speed the animation has
       already finished and these do nothing. */
    onEnter: () => tl.play(),
    onLeave: () => tl.progress(1).pause(),
    onEnterBack: () => tl.reverse(),
    onLeaveBack: () => tl.progress(0).pause(),
    invalidateOnRefresh: true,
    onRefresh: rebuild,
  });

  return () => {
    trigger.kill();
    tl.kill();
    field.replaceChildren();
    field.style.removeProperty('grid-template-columns');
    field.style.removeProperty('grid-template-rows');
    gsap.set(field, { clearProps: 'visibility' });
    gsap.set(screen, { clearProps: 'opacity,visibility' });
  };
}
