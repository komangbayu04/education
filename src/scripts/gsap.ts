import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

// Registered once for the whole app. Every module imports gsap from here,
// never from 'gsap' directly, so plugins are guaranteed to be present.
//
// Flip earns its place with the header: the top and pill states are two CSS
// layouts, and Flip is what measures the distance between them so the wordmark
// travels to the centre instead of cutting there (src/scripts/nav.ts).
//
// Draggable stays out of the bundle until the section that needs it exists
// (drag carousel — PRD §4.2). Add it here then.
gsap.registerPlugin(Flip, ScrollTrigger, SplitText);

// Flip to true while debugging scroll triggers — never reaches production
// because it is gated on import.meta.env.DEV (PRD §4.6).
const DEBUG_MARKERS = false;
ScrollTrigger.defaults({ markers: import.meta.env.DEV && DEBUG_MARKERS });

export { Flip, gsap, ScrollTrigger, SplitText };
