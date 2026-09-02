import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap, ScrollTrigger } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

let lenis: Lenis | null = null;
let rafHandler: ((time: number) => void) | null = null;

/**
 * Single smooth-scroll engine for the site. Lenis owns the scroll position,
 * GSAP's ticker owns the RAF loop — one loop total (PRD §4.6).
 *
 * Lerp, not duration. Duration restarts a 1.2s tween on every wheel tick,
 * which on a trackpad (many small deltas) reads as the page lagging behind
 * the fingers rather than as inertia. Lerp damps toward the target each
 * frame, so a flick has a visible settle without stealing the gesture.
 * Programmatic jumps still pass their own duration — nav links, the scene
 * stepper — and those are one motion, not a stream of ticks.
 */
export function initScroll(): Lenis | null {
  if (lenis) return lenis;

  // Reduced motion: leave the browser's native scrolling completely alone.
  if (prefersReducedMotion()) return null;

  /* Touch too. Lenis with `syncTouch: false` still listens to every
     touchmove, and `scrollTo({ lock: true })` — which the scene stepper
     uses — preventDefaults the lot for the length of the tween. On a phone
     that is the page freezing after Overclock: the exit has 1.45s left to
     play, and nothing the thumb does moves the page until it ends. Native
     scroll does not have that lock, and ScrollTrigger already listens to it. */
  if (isTouch()) return null;

  lenis = new Lenis({
    lerp: 0.075,
    wheelMultiplier: 0.85,
    syncTouch: false,
    touchMultiplier: 2,
    stopInertiaOnNavigate: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  rafHandler = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(rafHandler);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

/** Torn down before every Astro view transition so nothing leaks between pages. */
export function destroyScroll(): void {
  if (rafHandler) {
    gsap.ticker.remove(rafHandler);
    rafHandler = null;
  }
  lenis?.destroy();
  lenis = null;
}

export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}

/**
 * Run just before an in-page jump. The scene uses this to finish and release
 * itself when the destination is a section below it — otherwise the stepper
 * treats the travel as a gesture, plays the next chapter, and the reader
 * lands on Overclock with `#work` in the address bar.
 */
type BeforeScrollTo = (target: HTMLElement) => void;
const beforeScrollTo: BeforeScrollTo[] = [];

export function onBeforeScrollTo(fn: BeforeScrollTo): () => void {
  beforeScrollTo.push(fn);
  return () => {
    const i = beforeScrollTo.indexOf(fn);
    if (i >= 0) beforeScrollTo.splice(i, 1);
  };
}

/**
 * The height of the fixed header, which every in-page target has to clear.
 *
 * Measured off a throwaway element rather than parsed out of the custom
 * property. `--nav-height` is `calc(2 * 16px + 2.5rem)` — mixed units and
 * arithmetic, which is exactly what a custom property is allowed to be and
 * exactly what parseFloat cannot read: it returned NaN, the offset fell back to
 * zero, and every section landed with its first line under the bar. Giving the
 * value to the layout engine and asking how tall the result is costs one
 * measurement on a menu click and cannot be wrong about any expression the
 * token might grow into.
 */
function navHeight(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--nav-height);';
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/**
 * One corrective nudge, once the travel is over.
 *
 * The page is not the same shape at the end of a long scroll as it was at the
 * start. The scene is pinned, and the moment it is finished its spacer
 * collapses — so the section directly under it moves while the scroll aimed at
 * it is still running, and it arrived flush with the top of the screen instead
 * of clear of the header. Measured: 528px of drift on the way to #work, which
 * left its first row under the bar.
 *
 * Re-measuring afterwards is the only thing that can be right about this,
 * because the layout that matters is the one that exists when the reader gets
 * there. Not recursive on purpose: this runs after the pin has already settled,
 * so a second pass has nothing left to find, and a scroll that corrects itself
 * repeatedly is worse than one that is two pixels out.
 */
function settle(target: HTMLElement, offset: number): void {
  const drift = target.getBoundingClientRect().top + offset;
  if (!lenis || Math.abs(drift) < 2) return;
  lenis.scrollTo(window.scrollY + drift, { duration: 0.35, force: true });
}

/**
 * Eases the page to a section, clear of the header.
 *
 * Through Lenis where it exists, so an in-page jump is the same movement as
 * every other scroll on the site rather than a cut. Without it — reduced
 * motion — the browser's own instant scroll is the correct behaviour, not a
 * fallback to be apologised for.
 */
export function scrollToTarget(target: HTMLElement, immediate = false): void {
  beforeScrollTo.forEach((fn) => fn(target));

  /* Our work is a full-viewport sticky section whose own padding already
     clears the bar, and the testimonials pin a full screen whose title is
     placed under the bar itself. Offsetting either by the header height
     leaves a strip of the section above it. Everything else is ordinary
     flow. */
  const offset = target.hasAttribute('data-cat') || target.hasAttribute('data-tm') ? 0 : -navHeight();
  const dest = target.getBoundingClientRect().top + window.scrollY + offset;

  if (Math.abs(window.scrollY - dest) < 4) {
    settle(target, offset);
    return;
  }

  if (lenis) {
    /* `force`, because the commonest caller is a menu link and the menu still
       has the scroll locked when it fires: the lock is released by the close
       animation's onComplete, a fifth of a second later. Lenis refuses a
       scrollTo while it is stopped, so without this the link closed the menu,
       wrote the fragment, and left the reader exactly where they were. */
    lenis.scrollTo(target, {
      offset,
      duration: 1.1,
      immediate,
      force: true,
      onComplete: () => settle(target, offset),
    });
    return;
  }

  window.scrollTo({
    top: target.getBoundingClientRect().top + window.scrollY + offset,
    behavior: 'auto',
  });
}

/**
 * Honours the address bar's fragment, if it names something on this page.
 *
 * Called after the page has been built rather than left to the browser: the
 * scene is pinned, which moves every section below it, so a native jump made
 * before that measurement lands somewhere that stops being right a moment
 * later. Returns whether it found anything, so the caller can fall back to the
 * top of the page.
 */
export function scrollToHash(immediate = false): boolean {
  if (!location.hash || location.hash.length < 2) return false;

  let target: HTMLElement | null = null;
  try {
    target = document.querySelector<HTMLElement>(location.hash);
  } catch {
    // Not a usable selector — some other page's fragment, or a stray '#'.
    return false;
  }

  if (!target) return false;
  scrollToTarget(target, immediate);
  return true;
}
