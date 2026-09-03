/**
 * The founders on record, and what they said.
 *
 * Shared, because the page has two takes on this chapter and they have to be
 * the same chapter: the pinned film wall (Testimonials.astro) and the
 * scrolled cut that ends on the footer's photograph (TestimonialsFloat.astro).
 * The "Testimonial section" axis in src/config/variations.ts picks between
 * them, and content that lived inside either component would drift the
 * moment one was edited.
 */
export interface Testimonial {
  name: string;
  role: string;
  company: string;
  headline: string;
  quote: string;
  photo?: string;
  logo?: string;
  /** A video file the browser can play inline — mp4/webm, same-origin or CORS
   *  enabled. Makes this a film tile. */
  video?: string;
  /** Frame shown before the preview plays. Falls back to `photo`. */
  poster?: string;
}

export const TESTIMONIALS_TITLE =
  'Hear what our clients said about their experiences with us!';

/**
 * Stills standing in for films that have not been shot yet.
 *
 * PLACEHOLDER. The scatter in the reference frame has six tiles and three of
 * the founders on record were filmed, so the remaining spots take one of
 * these. They are frames of the same three interviews — which is what the
 * frame does too, reusing its three clips across all six tiles — and they are
 * decorative on purpose: a still carries no name and opens nothing, so there
 * is nothing to misattribute. The moment a fourth film exists it takes a spot
 * and one of these drops off the end.
 */
export const TESTIMONIAL_STILLS: string[] = [
  '/media/portrait-braden.webp',
  '/media/portrait-geoffrey.webp',
  '/media/portrait-ahmed.webp',
];

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Bhaumik Patel',
    role: 'CEO, Atrium Academy',
    company: 'Atrium Academy',
    logo: '/media/logo-atrium.svg',
    headline: 'Are you kidding me? This was a no brainer retainer.',
    quote:
      '"We basically get the output of a full time design team without the overhead of having to hire, manage, and train them. Design is the last thing I have to worry about, thanks to Tribe."',
  },
  {
    name: 'Ahmed F. Haque',
    role: 'Founder, Overclock',
    company: 'Overclock',
    photo: '/media/portrait-ahmed.webp',
    logo: '/media/logo-overclock.svg',
    video: 'https://framerusercontent.com/assets/ILZGTX3cqunlS3P895UeRWpIIM.mp4',
    headline: 'Design stopped being something we had to think about all the time.',
    quote:
      '"Speed to production was a huge difference... the fear is that you\'re going to get into this psychology experiment for three months and come out with a concept, but nothing that actually helps you move the business forward. That wasn\'t the experience I had with Tribe."',
  },
  {
    name: 'Braden Weissman',
    role: 'Co-Founder, Nerd Apply',
    company: 'Nerd Apply',
    photo: '/media/portrait-braden.webp',
    logo: '/media/logo-nerd-apply.svg',
    video: 'https://framerusercontent.com/assets/2ISOfafB7v8BKAWqxuBoY16FiM.mp4',
    headline: 'They shipped faster than our own team could have.',
    quote:
      '"We came in with a rough idea and left with something we could put in front of customers the same month. The pace never came at the cost of the craft."',
  },
  {
    name: 'Geoffrey Langford',
    role: 'Sr. Product Manager, Studeo',
    company: 'Studeo',
    photo: '/media/portrait-geoffrey.webp',
    logo: '/media/logo-studeo.svg',
    video: 'https://framerusercontent.com/assets/Xhyv0KqZjfypMH4uE3Lso4dIZM.mp4',
    headline: 'Absolutely great working with Tribe.',
    quote:
      '"The simplicity with which you\'ve boiled down the process makes it feel like we\'re not working with an external design team at all but like we\'ve hired a fully formed, in-house department ready to handle every design need."',
  },
  /* PLACEHOLDER — carried over from the previous cut of this section. Real
     names, roles and quotes to come. */
  {
    name: 'Nova',
    role: 'Vice President, CELPIP',
    company: 'CELPIP',
    headline: 'It felt like one team, not two.',
    quote:
      '"Every handoff was already anticipated. We stopped writing briefs halfway through the engagement because they were reading the roadmap better than we were."',
  },
  {
    name: 'Marta Reyes',
    role: 'Head of Growth, Kinfolk',
    company: 'Kinfolk',
    headline: 'The work moved the business, not a concept deck.',
    quote:
      '"We came out with something customers could use, and a team that understood why it mattered. That is rarer than it should be."',
  },
];
