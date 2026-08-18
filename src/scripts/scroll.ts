import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { prefersReducedMotion } from './utils/device';

let lenis: Lenis | null = null;
let rafHandler: ((time: number) => void) | null = null;

/**
 * Single smooth-scroll engine for the site. Lenis owns the scroll position,
 * GSAP's ticker owns the RAF loop — one loop total (PRD §4.6).
 */
export function initScroll(): Lenis | null {
  if (lenis) return lenis;

  // Reduced motion: leave the browser's native scrolling completely alone.
  if (prefersReducedMotion()) return null;

  lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    syncTouch: false, // native scroll on touch devices
    touchMultiplier: 2,
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
  const offset = -navHeight();

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
