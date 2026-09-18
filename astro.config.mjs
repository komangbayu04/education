import { defineConfig, fontProviders } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',

  /* The Overclock case study moved to /overclock. The old address is where
     everything already published points, so it is kept and answers with a
     redirect rather than a 404. */
  redirects: {
    '/work/overclock': '/overclock',
  },

  // Self-hosted fonts via Astro's built-in font pipeline.
  // Files are downloaded at build time and served from our own origin —
  // same result as the manual @font-face setup in the PRD, without the woff2 wrangling.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Space Grotesk',
      cssVariable: '--font-display',
      weights: [300, 400, 500, 600, 700],
      subsets: ['latin'],
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
    },
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
