import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

// Registered once for the whole app. Every module imports gsap from here,
// never from 'gsap' directly, so plugins are guaranteed to be present.
//
// Flip and Draggable stay out of the bundle until the sections that need them
// exist (work-page FLIP filter, drag carousel — PRD §4.2). Add them here then.
gsap.registerPlugin(ScrollTrigger, SplitText);

// Flip to true while debugging scroll triggers — never reaches production
// because it is gated on import.meta.env.DEV (PRD §4.6).
const DEBUG_MARKERS = false;
ScrollTrigger.defaults({ markers: import.meta.env.DEV && DEBUG_MARKERS });

export { gsap, ScrollTrigger, SplitText };
