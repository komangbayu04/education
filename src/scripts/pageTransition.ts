import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

/**
 * Between pages: a field of squares fills the screen, the page is swapped
 * behind it, and the squares clear off the new one.
 *
 * It replaces a shared-element morph — the frame in the menu growing into the
 * band at the top of the case study. That was the right idea and the wrong
 * mechanism. A view transition pairs two elements by a `view-transition-name`
 * that has to be unique in the document, and this site renders the nav on
 * every page, so the name existed at both ends at once and the browser aborted
 * the whole transition rather than degrading it. Working around that meant
 * writing the name from JS, only while the menu was open, only on the card
 * being looked at, and taking it back on close — four rules that all had to
 * hold for one animation to play, on top of a morph between two boxes of
 * different shapes that never quite settled. All of that is gone.
 *
 * This has none of it. There is no pairing, so there is nothing to be unique;
 * it is the same wipe wherever you came from and wherever you are going.
 *
 * The catch is that the two halves run in different documents. The fill runs
 * in the outgoing page, and by the time the squares should clear, the DOM they
 * lived in has been replaced. So the overlay is not carried across — it is
 * built again on arrival, already closed, and opened. The tiles are flat
 * squares of one colour, so a rebuilt field is indistinguishable from the one
 * it replaces.
 */

/** Roughly the cell size, in px — the same figure the page's other pixel
 *  fields use, so this reads as the same language. */
const CELL = 52;
/** Cap on the node count, for the same reason the reveal has one. */
const MAX_TILES = 320;
/** Seconds one half takes: the fill, then the clear. */
const HALF = 0.42;
/** How much of that is stagger rather than the tile's own fade. */
const SPREAD = 0.3;

const OVERLAY = 'page-wipe';

function build(): HTMLElement {
  document.getElementById(OVERLAY)?.remove();

  const width = window.innerWidth;
  const height = window.innerHeight;

  let cols = Math.max(4, Math.round(width / CELL));
  let rows = Math.max(4, Math.round(height / CELL));
  while (cols * rows > MAX_TILES && cols > 4 && rows > 4) {
    cols = Math.max(4, Math.round(cols * 0.85));
    rows = Math.max(4, Math.round(rows * 0.85));
  }

  const overlay = document.createElement('div');
  overlay.id = OVERLAY;
  overlay.setAttribute('aria-hidden', 'true');

  const tiles = Array.from({ length: cols * rows }, () => document.createElement('span'));
  overlay.append(...tiles);
  overlay.style.setProperty('--page-wipe-cols', String(cols));
  overlay.style.setProperty('--page-wipe-rows', String(rows));

  document.body.appendChild(overlay);
  return overlay;
}

const tilesOf = (overlay: HTMLElement) => Array.from(overlay.children) as HTMLElement[];

/**
 * Squares in, until the screen is covered. Resolves when it is.
 *
 * The navigation waits on this promise, which makes never resolving it a way
 * to strand the reader behind a black screen — so it does not depend only on
 * the tween finishing. A tab that is backgrounded mid-click has its animation
 * frames throttled to a crawl or stopped outright, and the tween with them;
 * the timer is what gets the page moving again when they come back. Whichever
 * lands first wins, and the tween is the one that wins normally.
 */
function fill(): Promise<void> {
  const overlay = build();

  const run = new Promise<void>((resolve) => {
    gsap.fromTo(
      tilesOf(overlay),
      { autoAlpha: 0 },
      {
        autoAlpha: 1,
        duration: HALF - SPREAD,
        ease: 'none',
        stagger: { amount: SPREAD, from: 'random' },
        onComplete: resolve,
      },
    );
  });

  const floor = new Promise<void>((resolve) => {
    window.setTimeout(resolve, HALF * 1000 + 250);
  });

  return Promise.race([run, floor]);
}

/**
 * Squares out, off the page that has arrived.
 *
 * Swept up on a timer as well as on the tween, for a harder reason than the
 * fill has: this overlay covers the whole viewport and takes pointer events,
 * so a tween that never finishes does not merely look wrong — it leaves the
 * page unusable behind it. The timer runs long enough to be a backstop rather
 * than a race, and removing the element is safe whether or not the tween is
 * still going, since the element is the only thing it is animating.
 */
function clear(): void {
  const overlay = build();
  const tiles = tilesOf(overlay);

  const sweep = () => {
    gsap.killTweensOf(tiles);
    overlay.remove();
  };

  const guard = window.setTimeout(sweep, HALF * 1000 + 400);

  gsap.fromTo(
    tiles,
    { autoAlpha: 1 },
    {
      autoAlpha: 0,
      duration: HALF - SPREAD,
      ease: 'none',
      stagger: { amount: SPREAD, from: 'random' },
      onComplete: () => {
        window.clearTimeout(guard);
        overlay.remove();
      },
    },
  );
}

/**
 * Wires the wipe into the router. Called once, from the module top level rather
 * than from initPage — these listeners belong to the document for as long as
 * the tab lives, and re-registering them on every page load would stack them.
 */
export function initPageTransition(): void {
  if (prefersReducedMotion()) return;

  /* The fill goes in front of the fetch rather than beside it. `event.loader`
     is the router's own "go and get the next page" step, and wrapping it is
     what makes the swap wait: the squares are already covering the screen
     before anything is replaced, so the cut underneath them is never seen.
     Awaiting the original afterwards keeps the router's own error handling —
     a failed load still falls back to a full navigation. */
  document.addEventListener('astro:before-preparation', (event) => {
    const original = (event as unknown as { loader: () => Promise<void> }).loader;
    (event as unknown as { loader: () => Promise<void> }).loader = async () => {
      await fill();
      await original();
    };
  });

  /* The new document is in place and still behind a full screen of squares.
     Rebuilt rather than carried over: the swap replaced the element this was
     appended to. */
  document.addEventListener('astro:after-swap', clear);
}
