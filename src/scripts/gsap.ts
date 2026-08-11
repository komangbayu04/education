import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

// Registered once for the whole app. Every module imports gsap from here,
// never from 'gsap' directly, so plugins are guaranteed to be present.
//
// Flip was here for the header's pill state, which measured two CSS layouts
// and tweened between them. That state is gone and nothing else used it, so
// the plugin came out with it rather than staying in the bundle unread.
//
// Draggable stays out of the bundle until the section that needs it exists
// (drag carousel — PRD §4.2). Add it here then.
gsap.registerPlugin(ScrollTrigger, SplitText);

// Flip to true while debugging scroll triggers — never reaches production
// because it is gated on import.meta.env.DEV (PRD §4.6).
const DEBUG_MARKERS = false;
ScrollTrigger.defaults({ markers: import.meta.env.DEV && DEBUG_MARKERS });

/* Dev only — a handle on the clock, for checking motion by hand.
 *
 * gsap assigns `window.gsap` itself, but only from a code path that this
 * bundle never takes: measured, the global is undefined on a loaded page. So
 * this is the handle, not a duplicate of one.
 *
 * It earns its place because the browser tooling used against this site runs
 * the page with requestAnimationFrame frozen. That stops gsap.ticker, and with
 * it everything driven per frame — the strip drift in workCategories.ts, the
 * scene's scrub — so none of it can be observed at all without a way to step
 * time forward: `gsap.ticker.tick()` between real waits, or
 * `gsap.globalTimeline.time(t)` to jump.
 *
 * Gated on import.meta.env.DEV, so Vite folds the branch away and it is not in
 * the production bundle (PRD §4.6, same gate as the ScrollTrigger markers).
 */
if (import.meta.env.DEV) {
  (window as unknown as { gsap: typeof gsap }).gsap = gsap;
}

export { gsap, ScrollTrigger, SplitText };
