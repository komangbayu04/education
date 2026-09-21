/**
 * Alternative versions of the site, switched from the "Variation" tab on the
 * left edge of every page.
 *
 * The idea: we want to try more than one answer for a few things — the scroll
 * feel, the hero's layout, how the testimonials read — without keeping branches
 * alive or shipping a build per idea. Each entry below is one *axis* of choice.
 * The reader's pick is saved to localStorage and written onto <html> as
 * `data-var-<axis>="<option>"` before the first paint (see Base.astro), so both
 * CSS and scripts can branch on it with no flash.
 *
 * To wire a variant into the actual page, read the attribute:
 *
 *   CSS   html[data-var-scroll="smooth"] .hero { ... }
 *   TS    import { getVariant } from '../config/variations';
 *         if (getVariant('hero') === 'alt-2') { ...build the other timeline... }
 *
 * To add a new axis, add an entry here — the switch UI and the pre-paint script
 * pick it up on their own. The default is the axis's `default`, or its first
 * option when it names none.
 */

export interface VariationOption {
  id: string;
  label: string;
}

export interface VariationAxis {
  id: string;
  /** Heading shown above the option row in the panel. */
  label: string;
  /** The option a first visit gets. Omitted, it is the first option. */
  default?: string;
  options: [VariationOption, ...VariationOption[]];
}

export const VARIATIONS: VariationAxis[] = [
  {
    id: 'offer',
    label: 'Service section',
    default: 'split',
    options: [
      /* The window opening onto one panel at a time: Sprint held, then
         crossfaded into Retainer. TwoWays.astro with Offer.astro twice,
         stacked, and src/scripts/twoWays.ts for the handover. */
      { id: 'stacked', label: 'One at a time' },
      /* The same window, opening onto both panels at once — Sprint on the
         left, Retainer on the right, each half the screen. No handover: the
         two are read together and compared rather than shown in turn. */
      { id: 'split', label: 'Side by side' },
    ],
  },
  {
    id: 'promises',
    label: 'Both models include',
    default: 'duo',
    options: [
      /* The drawing and the staircase: a pixel triangle with the promises
         stepping away from it line by line. Included.astro. */
      { id: 'triangle', label: 'Pixel triangle' },
      /* The other reading of the same five lines: a ruled table across the
         whole screen, one promise a row, numbered, with a run of squares at
         the end of each that grows as the list does. */
      { id: 'ledger', label: 'Ruled table' },
      /* Both blocks in one screen, side by side: the promises as a checklist
         on the left with the shot of whichever kind of work is being read
         under it, and the kinds of work set large down the right. The list
         bows out towards the line being read. */
      { id: 'duo', label: 'Checklist + list' },
    ],
  },
  {
    id: 'testimonials',
    label: 'Testimonial section',
    default: 'float',
    options: [
      /* The pinned film wall: one film alone, then a three-column wall
         scrolling up under the title. Testimonials.astro. */
      { id: 'wall', label: 'Film wall' },
      /* The scrolled scatter: nothing pinned. A tall section with the title
         stuck in the middle of it and the films rising past, ending on the
         footer's photograph. TestimonialsFloat.astro. */
      { id: 'float', label: 'Scrolled scatter' },
      /* The orbit: the founders on a turning sphere, and pressing one flies
         that tile into the read rather than opening a dialog over it.
         TestimonialsSphere.astro. */
      { id: 'orbit', label: 'Orbit grid' },
    ],
  },
];

/** localStorage key holding the `{ [axisId]: optionId }` map. Versioned: the
 *  defaults moved to split / duo / float, and a pick saved under the old key
 *  would otherwise keep a returning reader on the old cut. */
export const STORAGE_KEY = 'tribe:variations:v2';

/** One axis's default — its `default`, or its first option. */
export function defaultOf(axis: VariationAxis): string {
  return axis.default && axis.options.some((o) => o.id === axis.default)
    ? axis.default
    : axis.options[0].id;
}

/** The default pick for every axis. */
export function defaults(): Record<string, string> {
  return Object.fromEntries(VARIATIONS.map((axis) => [axis.id, defaultOf(axis)]));
}

/** The reader's saved picks, merged over the defaults. Safe on the server. */
export function resolve(): Record<string, string> {
  const base = defaults();
  if (typeof localStorage === 'undefined') return base;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, string>;
    for (const axis of VARIATIONS) {
      const pick = saved[axis.id];
      if (pick && axis.options.some((o) => o.id === pick)) base[axis.id] = pick;
    }
  } catch {
    /* Corrupt or unavailable storage — the defaults stand. */
  }
  return base;
}

/** Current value of one axis, read off <html>. Falls back to the default. */
export function getVariant(axisId: string): string {
  const axis = VARIATIONS.find((a) => a.id === axisId);
  if (!axis) return '';
  if (typeof document === 'undefined') return defaultOf(axis);
  return document.documentElement.dataset[`var${cap(axisId)}`] || defaultOf(axis);
}

/** Save one axis and reflect it onto <html>. Does not reload — the caller decides. */
export function setVariant(axisId: string, optionId: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset[`var${cap(axisId)}`] = optionId;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, string>;
    saved[axisId] = optionId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* No storage — the attribute still holds for this page view. */
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
