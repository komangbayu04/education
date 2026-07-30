# PRD — Awwward-Level Brand Website
**Tribelab × Bayu Krisnayana**

| | |
|---|---|
| **Status** | Draft v3.0 |
| **Author** | Bayu Krisnayana |
| **Date** | June 2026 |
| **Benchmark** | aupalevodka.com (Locomotive · Awwward SOTD Mar 2026) |
| **Secondary ref** | wolverineworldwide.com |
| **Target** | Awwward SOTD / Honorable Mention |

---

## Stack Rationale — Confirmed dari Riset SOTD Winners

Setelah analisis langsung source code aupalevodka.com (built by Locomotive, Awwward SOTD 17 March 2026), pattern yang terkonfirmasi adalah:

**Aupale Vodka confirmed stack:**
`Astro v5` · `Storyblok CMS` · `GSAP` · `Lenis` · `Mux Video` · `Custom Web Components`

Ini adalah stack yang digunakan secara konsisten oleh top creative agencies (Locomotive, Studio Freight, Darkroom, dll) karena:

- **Astro** → Zero JS by default. Hanya ship JS yang memang perlu. Lighthouse 100 lebih mudah dicapai dari Next.js
- **Astro Islands** → Komponen interaktif (React/Svelte/Vanilla) hanya di-hydrate saat diperlukan
- **GSAP** → Industry standard tanpa kompetitor. ScrollTrigger, SplitText, Flip — semua tools yang SOTD winners pakai
- **Lenis** → Smooth scroll yang tidak break native CSS (sticky, IntersectionObserver). Tidak seperti Locomotive Scroll lama yang menggunakan transform dan break sticky elements
- **Storyblok** → Visual editor CMS dengan API yang sangat clean untuk Astro. Pakai official `@storyblok/astro` SDK
- **Mux** → Video streaming yang dioptimasi untuk web (bukan Vimeo/YouTube embed yang berat)

**Mengapa bukan Next.js:** App Router hydration overhead bermasalah dengan GSAP ScrollTrigger dan custom RAF loop. Astro mengirim HTML statis + GSAP vanilla JS = zero framework conflict, persis seperti cara Locomotive membangun Aupale.

**Mengapa bukan Vite + vanilla:** Astro memberikan routing, layouts, MDX, dan CMS integration yang bersih tanpa framework overhead — best of both worlds.

---

## 1. Executive Summary

PRD ini mendefinisikan scope penuh, arsitektur teknis, sistem interaksi, dan standar delivery untuk website brand level Awwward. Benchmark utama adalah **aupalevodka.com** — cinematic, scroll-driven editorial dengan smooth interaction class SOTD — dibangun oleh agency Locomotive (14 SOTD/SOTY awards).

### Target Capaian

| Metric | Target |
|--------|--------|
| Lighthouse Performance (mobile) | ≥ 90 |
| Lighthouse Performance (desktop) | 100 |
| LCP | < 1.5s |
| CLS | ≤ 0.05 |
| INP | < 100ms |
| Awwward Score | ≥ 7.5 / 10 |
| Avg. Session Duration | ≥ 3m 30s |
| Bounce Rate | ≤ 35% |
| WCAG | 2.1 AA |

---

## 2. Tech Stack — Final

### Core Framework

```
Astro 5           → Framework utama. Zero JS by default, Island Architecture.
                    Routing, layouts, MDX, image optimization built-in.
                    Deploy ke Vercel dengan @astrojs/vercel adapter.
TypeScript 5      → Type safety di seluruh codebase
```

### Styling

```
Tailwind CSS v4   → Utility-first. CSS-first config (tidak perlu tailwind.config.js)
CSS Custom Props  → Design tokens (warna, type scale, spacing) — sumber kebenaran tunggal
PostCSS           → Autoprefixer
```

### Animation — Core Duo (Non-negotiable)

```
GSAP 3 + Plugins
  ↳ ScrollTrigger   → Scroll-driven animations: pin, scrub, parallax, snap
  ↳ SplitText       → Word/char/line text reveals (plugin berbayar, bundled ke GSAP Club)
  ↳ Flip            → FLIP layout animations untuk filter/transition
  ↳ Draggable       → Drag interactions (carousel, dll)

Lenis 1.x
  ↳ Smooth scroll engine — dari Studio Freight/Darkroom
  ↳ Tidak break native CSS sticky, IntersectionObserver, atau GSAP ScrollTrigger
  ↳ Feed RAF langsung ke GSAP ticker: gsap.ticker.add((t) => lenis.raf(t * 1000))
  ↳ Dipakai Aupale Vodka, EXP by Lusion, ProVoke, dan mayoritas SOTD winners
```

### CMS

```
Storyblok v2      → Headless CMS dengan visual editor
                    Official SDK: @storyblok/astro
                    Pakai untuk: project pages, blog, team, site settings
                    Alternatif ringan: konten statis di Astro content collections (MDX)
```

### Media & Assets

```
Mux               → Video streaming (bukan Vimeo/YouTube)
                    mux-player-react untuk embed yang clean
                    Dipakai Aupale Vodka untuk hero video
                    Auto-generate poster, blur placeholder, captions

@astrojs/image    → Built-in image optimization (AVIF + WebP + blur placeholder)
```

### Page Transitions

```
Astro View Transitions (built-in)
  → Native browser View Transitions API + Astro fallback polyfill
  → Zero JS overhead dibanding Barba.js
  → Gunakan data-astro-transition="slide" atau custom CSS @keyframes
  → Hook ke GSAP dengan astro:page-load / astro:before-swap events
```

### Deployment & Analytics

```
Vercel            → Deployment + Edge Network + ISR
Fathom Analytics  → Privacy-first (sudah terintegrasi)
```

### Perbandingan Stack: SOTD Winners yang Terverifikasi

| Site | Agency | Stack |
|------|--------|-------|
| Aupale Vodka (SOTD Mar 2026) | Locomotive | **Astro v5 + Storyblok + GSAP + Lenis + Mux** |
| Dulcedo (SOTD Feb 2026) | Locomotive | Astro + GSAP + Lenis |
| Lightship (SOTD Jan 2026) | Locomotive | Astro + GSAP + Lenis |
| Drake Hotel (SOTD Sep 2025) | Locomotive | Astro + GSAP + Lenis |
| Joffrey Spitzer Portfolio | Solo | Astro + GSAP + Lenis + Three.js + Swup |
| ProVoke Agency | ProVoke | React + GSAP + Lenis + Tailwind + Vercel |
| **Stack PRD ini** | **Tribelab** | **Astro 5 + Tailwind v4 + GSAP + Lenis + Storyblok + Mux + Vercel** |

Locomotive sendirian sudah memenangkan 4 SOTD dalam 3 bulan pertama 2026 — semua dengan Astro.

---

## 3. Brand System

### 3.1 Typography

| Role | Typeface | Weights | Loading |
|------|----------|---------|---------|
| Display / Hero | Space Grotesk | 300, 700 | Self-host woff2, preload |
| Headline H1–H3 | Space Grotesk | 500, 700 | Self-host woff2 |
| Body / Paragraph | Helvetica Neue | 400, 500 | System stack (zero load cost) |
| Caption / Label | Helvetica Neue | 400 | System stack |
| UI / CTA | Space Grotesk | 500, 600 | Self-host woff2 |

**Helvetica Neue system stack:**
```css
--font-body: "Helvetica Neue", Helvetica, Arial, sans-serif;
```

> ⚠️ **OI-01**: Konfirmasi body font — system stack vs self-hosted. Update setelah dikonfirmasi Bayu.

### 3.2 Type Scale — Fluid (clamp)

```css
:root {
  /* Display */
  --text-display-xl : clamp(5rem,    10vw, 9rem);     /* 80–144px */
  --text-display-lg : clamp(3.5rem,  7vw,  6.5rem);   /* 56–104px */

  /* Headings */
  --text-h1         : clamp(2.5rem,  5vw,  4.5rem);   /* 40–72px  */
  --text-h2         : clamp(1.75rem, 3.5vw, 3rem);    /* 28–48px  */
  --text-h3         : clamp(1.25rem, 2.5vw, 2rem);    /* 20–32px  */

  /* Body */
  --text-body-lg    : 1.125rem;                        /* 18px */
  --text-body       : 1rem;                            /* 16px */
  --text-caption    : 0.75rem;                         /* 12px */

  /* Line heights */
  --leading-display : 0.92;
  --leading-heading : 1.05;
  --leading-body    : 1.65;

  /* Letter spacing */
  --tracking-tight  : -0.04em;
  --tracking-normal :  0em;
  --tracking-wide   :  0.08em;
}
```

### 3.3 Color Tokens

> ⚠️ **OI-02**: Accent color dikonfirmasi via Figma MCP analysis. Slot sudah tersedia.

```css
:root {
  /* Backgrounds */
  --color-bg-primary   : #0A0A0A;
  --color-bg-secondary : #141414;
  --color-bg-surface   : #F5F3EE;   /* light inversion sections */
  --color-bg-overlay   : rgba(10, 10, 10, 0.75);

  /* Text */
  --color-text-primary   : #FFFFFF;
  --color-text-secondary : #9A9A9A;
  --color-text-dark      : #0A0A0A;
  --color-text-muted     : #5A5A5A;

  /* Accent — TBD via Figma MCP */
  --color-accent         : TBD;
  --color-accent-hover   : TBD;

  /* UI */
  --color-border         : #2A2A2A;
  --color-border-light   : #E8E4DC;
}
```

### 3.4 Spacing & Grid

```css
:root {
  --space-1  : 0.25rem;  /* 4px  */
  --space-2  : 0.5rem;   /* 8px  */
  --space-4  : 1rem;     /* 16px */
  --space-8  : 2rem;     /* 32px */
  --space-16 : 4rem;     /* 64px */
  --space-24 : 6rem;     /* 96px */
  --space-32 : 8rem;     /* 128px */

  --section-padding-y : clamp(5rem, 10vw, 10rem);
  --section-padding-x : clamp(1.5rem, 5vw, 7.5rem);
  --content-max-width : 1440px;
  --grid-columns      : 12;
  --grid-gutter       : 1.5rem;
}
```

---

## 4. Interaction & Motion System

### 4.1 Smooth Scroll — Lenis Setup

Lenis adalah standar dari semua Locomotive sites (Aupale, Dulcedo, Drake Hotel) dan mayoritas SOTD winners.

```js
// src/scripts/scroll.js
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothTouch: false,   // native scroll di touch devices
  touchMultiplier: 2,
});

// Satu-satunya integrasi yang dibutuhkan
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);
```

**Di Astro, init di layout:**
```astro
---
// src/layouts/Base.astro
---
<script>
  import { initScroll } from '../scripts/scroll.js';
  import { initGSAP } from '../scripts/gsap.js';

  // Re-init setelah setiap Astro View Transition
  document.addEventListener('astro:page-load', () => {
    initScroll();
    initGSAP();
  });
</script>
```

### 4.2 GSAP ScrollTrigger Patterns

| Pattern | Config | Digunakan di |
|---------|--------|-------------|
| Fade up on enter | `fromTo opacity 0→1, y 60→0, dur 0.9, power3.out, once: true` | Semua section intros |
| Word reveal | `SplitText + stagger 0.04s, y: "110%", overflow: hidden` | Hero headline, H1–H2 |
| Parallax scrub | `scrub: 1, y: "-20%", trigger: section` | Hero bg, full-bleed images |
| Horizontal scroll | `pin: true, scrub: 0.8, x: -(panels * 100vw)` | Work/project carousel |
| Counter count-up | `onEnter callback, snap: 1, duration: 2` | Stats section |
| Clip-path reveal | `clipPath: "inset(100% 0 0 0)" → "inset(0%)"` | Image reveals |
| Scale on scroll | `scrub: 2, scale: 0.85 → 1` | Hero image entrance |
| SVG line draw | `strokeDashoffset → 0, scrub: true` | Decorative accents |
| Sticky section | `pin: true, pinSpacing: false` | About, features overlay |

**GSAP plugin registration — satu file, dipanggil sekali:**
```js
// src/scripts/gsap.js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(ScrollTrigger, SplitText, Flip, Draggable);

export { gsap, ScrollTrigger, SplitText, Flip, Draggable };
```

### 4.3 Page Transitions — Astro View Transitions

Astro memiliki View Transitions built-in. Tidak perlu Barba.js atau library tambahan.

```astro
---
// src/layouts/Base.astro
import { ViewTransitions } from 'astro:transitions';
---
<head>
  <ViewTransitions />
</head>
```

**Custom transition per elemen:**
```astro
<!-- Hero image persist across pages (shared element transition) -->
<img
  src={project.hero}
  transition:name={`hero-${project.slug}`}
  transition:animate="fade"
/>

<!-- Page wrapper wipe -->
<main transition:animate={customWipe}>
  <slot />
</main>
```

**Custom wipe animation:**
```js
// src/scripts/transitions.js
import { TransitionDirectionalAnimations } from 'astro:transitions';

export const customWipe = {
  forwards: {
    old: [{ name: 'slide-out-left', duration: '0.45s', easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fillMode: 'both' }],
    new: [{ name: 'slide-in-right', duration: '0.55s', easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fillMode: 'both' }],
  },
  backwards: {
    old: [{ name: 'slide-out-right', duration: '0.45s', easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fillMode: 'both' }],
    new: [{ name: 'slide-in-left', duration: '0.55s', easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fillMode: 'both' }],
  },
};
```

**Re-init GSAP setelah transition:**
```js
// Astro fires ini setelah setiap navigation
document.addEventListener('astro:page-load', () => {
  ScrollTrigger.refresh();
  lenis.scrollTo(0, { immediate: true });
  initPageAnimations(); // init animations untuk halaman baru
});

document.addEventListener('astro:before-swap', () => {
  // Kill semua ScrollTrigger sebelum halaman lama di-swap
  ScrollTrigger.getAll().forEach(t => t.kill());
});
```

### 4.4 Custom Cursor

```js
// src/scripts/cursor.js
import gsap from 'gsap';

export class Cursor {
  constructor() {
    this.dot  = document.querySelector('.cursor-dot');
    this.ring = document.querySelector('.cursor-ring');

    // quickTo = performa terbaik, pattern dari SOTD winners
    this.xDot  = gsap.quickTo(this.dot,  'x', { duration: 0.15, ease: 'power3' });
    this.yDot  = gsap.quickTo(this.dot,  'y', { duration: 0.15, ease: 'power3' });
    this.xRing = gsap.quickTo(this.ring, 'x', { duration: 0.5,  ease: 'power3' });
    this.yRing = gsap.quickTo(this.ring, 'y', { duration: 0.5,  ease: 'power3' });

    window.addEventListener('mousemove', (e) => {
      this.xDot(e.clientX);  this.yDot(e.clientY);
      this.xRing(e.clientX); this.yRing(e.clientY);
    });

    this.initMagnetic();
    this.initStates();
  }

  initMagnetic() {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const { left, top, width, height } = el.getBoundingClientRect();
        const dx = (e.clientX - (left + width  / 2)) * 0.35;
        const dy = (e.clientY - (top  + height / 2)) * 0.35;
        gsap.to(el, { x: dx, y: dy, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  initStates() {
    // Hover link/button → ring expand
    document.querySelectorAll('a, button, [data-cursor]').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const state = el.dataset.cursor || 'hover';
        this.ring.dataset.state = state;
      });
      el.addEventListener('mouseleave', () => {
        this.ring.dataset.state = 'default';
      });
    });
  }
}
```

**Cursor states:**

| State | Trigger | Ring size | Label |
|-------|---------|-----------|-------|
| `default` | — | 40px | — |
| `hover` | `a`, `button` | 56px | — |
| `play` | `[data-cursor="play"]` | 80px | PLAY |
| `view` | `.project-card` | 72px | VIEW |
| `drag` | `[data-cursor="drag"]` | 60px | DRAG |

### 4.5 Micro-interactions

| Elemen | Interaksi | Implementasi |
|--------|-----------|--------------|
| Nav link | Underline scaleX 0→1, transform-origin: left | CSS `transition` |
| CTA Button | Clip-path fill slide dari kiri ke kanan | GSAP |
| Image card | `scale: 1→1.04`, `brightness: +10%`, 0.4s | CSS `transition` |
| Hamburger → Close | 3 lines morph ke × via GSAP timeline | GSAP |
| Mobile nav | clip-path circle expand dari hamburger icon | GSAP |
| Accordion | GSAP height tween (ResizeObserver untuk dynamic) | GSAP |
| Scroll progress | Fixed bar top, `scaleX: 0→1` via ScrollTrigger scrub | GSAP |
| Image hover distortion | OGL fragment shader via canvas overlay | OGL / GLSL |

### 4.6 Performance Rules — Non-Negotiable

```
✅ Hanya animate: transform + opacity. Tidak pernah height, width, top, left
✅ will-change: transform — hanya pada elemen yang sedang animating, hapus setelahnya
✅ ScrollTrigger markers: false di production (gunakan env variable)
✅ Debounce resize: minimal 150ms
✅ prefers-reduced-motion: semua animasi wrapped di check:
   const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
✅ ScrollTrigger.kill() dan lenis.destroy() sebelum astro:before-swap
✅ Lenis smoothTouch: false — native scroll di mobile/touch
✅ GSAP context: gsap.context() per halaman untuk cleanup yang bersih
✅ Satu RAF loop global: Lenis → GSAP ticker → Three.js (jika ada)
✅ Three.js: geometry.dispose(), material.dispose(), texture.dispose() saat scene berganti
```

---

## 5. Project Structure

```
src/
├── layouts/
│   ├── Base.astro          # Root layout: ViewTransitions, cursor, Lenis init, head
│   └── Page.astro          # Page layout dengan padding dan max-width
│
├── pages/
│   ├── index.astro         # Home
│   ├── about.astro         # About
│   ├── work/
│   │   ├── index.astro     # Work listing
│   │   └── [slug].astro    # Case study (dynamic route)
│   ├── services.astro
│   ├── journal/
│   │   ├── index.astro
│   │   └── [slug].astro
│   └── contact.astro
│
├── components/
│   ├── ui/                 # Primitive components
│   │   ├── Button.astro    # data-magnetic by default
│   │   ├── Card.astro
│   │   └── Input.astro
│   ├── sections/           # Full-page section components
│   │   ├── Hero.astro
│   │   ├── HorizontalScroll.astro
│   │   ├── Stats.astro
│   │   ├── Marquee.astro
│   │   └── ProjectGrid.astro
│   ├── layout/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   └── Cursor.astro
│   └── motion/             # Animation wrapper components
│       ├── SplitReveal.astro
│       ├── FadeUp.astro
│       ├── ParallaxLayer.astro
│       └── ClipReveal.astro
│
├── scripts/                # Vanilla JS modules (tidak ada framework)
│   ├── gsap.js             # GSAP instance + plugin registration
│   ├── scroll.js           # Lenis + GSAP ScrollTrigger feed
│   ├── cursor.js           # Cursor class
│   ├── transitions.js      # Astro View Transition custom animations
│   └── utils/
│       ├── math.js         # lerp, clamp, map
│       ├── dom.js          # $ querySelector helpers
│       └── device.js       # isMobile, reducedMotion
│
├── gl/                     # WebGL (opsional, sesuai scope OI-03)
│   ├── ImageDistortion.js  # OGL shader — image hover distortion
│   └── shaders/
│       ├── distortion.vert
│       └── distortion.frag
│
├── styles/
│   ├── globals.css         # Tailwind base, CSS custom props, @font-face
│   ├── cursor.css          # Cursor dot + ring styles
│   └── transitions.css     # View Transition keyframes
│
├── content/                # Astro Content Collections (opsional, alternatif Storyblok)
│   ├── config.ts
│   ├── work/               # MDX case studies
│   └── journal/            # MDX articles
│
└── lib/
    ├── storyblok.ts        # @storyblok/astro client + query helpers
    └── mux.ts              # Mux player config
```

---

## 6. Site Architecture

### 6.1 Pages

| Route | Halaman | Priority | Astro Route |
|-------|---------|----------|-------------|
| `/` | Home | P0 | `pages/index.astro` |
| `/about` | About | P0 | `pages/about.astro` |
| `/work` | Work / Projects | P0 | `pages/work/index.astro` |
| `/work/[slug]` | Case Study | P0 | `pages/work/[slug].astro` |
| `/services` | Services | P1 | `pages/services.astro` |
| `/journal` | Journal | P1 | `pages/journal/index.astro` |
| `/journal/[slug]` | Article | P1 | `pages/journal/[slug].astro` |
| `/contact` | Contact | P1 | `pages/contact.astro` |

### 6.2 Home — Section Breakdown

| # | Section | Key Animation | Tech |
|---|---------|---------------|------|
| 1 | **Hero** | SplitText word reveal, parallax bg, scroll indicator fade | GSAP + Lenis |
| 2 | **Manifesto** | Large words reveal sequentially on scroll | GSAP SplitText |
| 3 | **Selected Work** | Pinned horizontal scroll, card scale + cursor state | GSAP ScrollTrigger |
| 4 | **About Teaser** | 50/50 split, clip-path image reveal | GSAP |
| 5 | **Stats** | Count-up numbers on viewport enter | GSAP |
| 6 | **Services Marquee** | Infinite marquee, pause on hover via Lenis | CSS + Lenis |
| 7 | **Latest Journal** | Image reveal on hover (2 featured) | GSAP |
| 8 | **Contact CTA** | Large type, magnetic CTA button | GSAP |
| — | **Footer** | Standard, back-to-top magnetic | GSAP |

### 6.3 Case Study — /work/[slug]

- **Hero**: full-viewport title + hero image/video (Mux)
- **Metadata bar**: client · year · services · role — small caps, horizontal
- **Challenge / Process / Outcome**: editorial long-form sections dengan reveals
- **Image gallery**: full-bleed dan contained alternating, clip-path reveal
- **Next project**: sticky bottom bar via ScrollTrigger, shared element transition ke halaman berikutnya

---

## 7. WebGL / Shader Strategy (Opsional)

### 7.1 OGL untuk Shader Ringan

Untuk image distortion pada hover (seperti yang dipakai banyak SOTD portfolio sites):

```
OGL (~8KB gzipped)   → Jauh lebih ringan dari Three.js (~150KB)
                        Cocok untuk: image distortion shader, noise effect
                        Tidak perlu untuk: site yang focus pada typography + motion
```

### 7.2 Three.js / R3F untuk 3D Scene (Jika Ada)

Hanya gunakan jika hero membutuhkan:
- 3D model dari Blender (GLTF/GLB)
- Environment map / complex lighting
- Physics interaktif

Keputusan ini menambah ~4 hari ke Phase 8 dan harus diputuskan di OI-03.

### 7.3 Mux untuk Video

Aupale Vodka menggunakan Mux — lebih baik dari Vimeo/YouTube karena:
- Adaptive bitrate streaming (HLS)
- Auto-generate poster + blur placeholder
- Privacy-first (tidak ada tracking cookie dari third party)
- Player yang sangat customizable

```astro
---
// src/components/sections/HeroVideo.astro
---
<script>
  import MuxPlayer from '@mux/mux-player';
</script>

<mux-player
  playback-id={Astro.props.playbackId}
  stream-type="on-demand"
  autoplay="muted"
  loop
  muted
  preload="auto"
  poster={Astro.props.poster}
/>
```

---

## 8. Astro Configuration

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import storyblok from '@storyblok/astro';
import vercel from '@astrojs/vercel/static';  // atau /serverless untuk SSR
import react from '@astrojs/react';           // hanya jika ada Island React

export default defineConfig({
  output: 'static',             // SSG by default — halaman statis = Lighthouse 100
  adapter: vercel(),
  integrations: [
    tailwind(),
    react(),                    // Astro Island untuk komponen interaktif
    storyblok({
      accessToken: import.meta.env.STORYBLOK_TOKEN,
      components: {
        project: 'storyblok/Project',
        article: 'storyblok/Article',
      },
    }),
  ],
  image: {
    service: 'astro/assets',
    domains: ['a.storyblok.com'],   // allow Storyblok CDN images
  },
  vite: {
    plugins: [
      // vite-plugin-glsl untuk import shader files
    ],
  },
});
```

---

## 9. CMS — Storyblok

### 9.1 Schema

| Schema | Fields | Digunakan di |
|--------|--------|-------------|
| `project` | title, slug, client, year, category[], hero (asset), images[], body (rich text), featured (bool) | `/work`, `/work/[slug]` |
| `article` | title, slug, publishedAt, category, excerpt, hero, body (rich text) | `/journal`, `/journal/[slug]` |
| `service` | title, slug, description, icon, order | `/services` |
| `teamMember` | name, role, bio, image, social[] | `/about` |
| `siteSettings` | logo, seo{title, desc}, socials[], nav[] | Global |
| `stat` | label, value, suffix | Home stats section |

### 9.2 Storyblok Configuration

```ts
// src/lib/storyblok.ts
import { storyblokInit, apiPlugin } from '@storyblok/astro';

// Fetch projects
export async function getProjects() {
  const { data } = await storyblokApi.get('cdn/stories', {
    starts_with: 'work/',
    version: import.meta.env.DEV ? 'draft' : 'published',
  });
  return data.stories;
}
```

- **Draft mode**: gunakan `version: 'draft'` di dev, `'published'` di production
- **Preview**: Storyblok Visual Editor via `@storyblok/astro` bridging
- **Webhook**: On publish → trigger Vercel redeploy (static) atau revalidation (ISR)
- **Image CDN**: Storyblok CDN dengan `?format=webp&width=1200` query params

---

## 10. Performance Budget

| Asset Type | Budget |
|------------|--------|
| Total JS (initial, gzipped) | < 100KB |
| CSS (gzipped) | < 15KB |
| Hero image | < 300KB (AVIF) |
| Hero video (Mux, muted) | Streaming — tidak di initial load |
| Fonts (Space Grotesk subset) | < 50KB (woff2) |
| OGL (jika digunakan) | ~8KB gzipped |
| Three.js (jika digunakan) | Lazy load — bukan initial bundle |
| GSAP (core + ScrollTrigger) | ~35KB gzipped |
| Lenis | ~3KB gzipped |

### Image Strategy

```
Format: AVIF → WebP → JPEG (Astro Image service auto-handles)
Hero: <Image> dengan priority loading
Below-fold: loading="lazy" (Astro default)
Storyblok images: gunakan CDN URL dengan ?format=webp&width=
Blur placeholder: data URI di Astro Image (blurDataURL via sharp)
```

### Font Loading

```html
<!-- Preload critical weights — di <head> Base.astro -->
<link rel="preload" href="/fonts/SpaceGrotesk-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/SpaceGrotesk-Bold.woff2"    as="font" type="font/woff2" crossorigin>
```

```css
/* globals.css */
@font-face {
  font-family: 'Space Grotesk';
  src: url('/fonts/SpaceGrotesk-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Space Grotesk';
  src: url('/fonts/SpaceGrotesk-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
```

---

## 11. Accessibility (WCAG 2.1 AA)

| Requirement | Implementasi |
|-------------|--------------|
| Keyboard navigation | Semua interaktif focusable, visible focus ring `3px solid var(--color-accent)`, logical tab order |
| `prefers-reduced-motion` | Semua GSAP dan Lenis disabled jika `matchMedia('(prefers-reduced-motion: reduce)').matches` |
| Colour contrast | ≥ 4.5:1 normal text · ≥ 3:1 large text — verified Stark plugin |
| Image alt text | Semua `<Image>` Astro enforce `alt` prop |
| ARIA labels | Nav landmarks, button labels, modal focus traps |
| Skip navigation | Link pertama dalam DOM: "Skip to main content" |
| SplitText | `aria-hidden="true"` pada split spans, `aria-label` pada container |
| View Transitions | Announce page change: `<div aria-live="polite" data-transition-announce>` |
| Video | Hero videos: `muted autoplay` — tidak perlu captions. Content videos: VTT captions required |
| Custom cursor | Semua hover states work via focus states (keyboard fallback) |

---

## 12. SEO

```
Astro Metadata    → <head> generated per halaman via defineMetadata() di setiap .astro
OG Images         → Astro endpoint /og/[slug].png via @vercel/og
Structured Data   → Organization + WebSite (home), Article (journal), CreativeWork (case study)
Sitemap           → @astrojs/sitemap integration (auto-generated)
robots.txt        → public/robots.txt — allow all, disallow nothing public
Canonical         → <link rel="canonical"> di setiap halaman
Semantic HTML     → Satu <h1> per halaman, nav/main/footer landmarks
```

---

## 13. Development Phases

| Phase | Nama | Deliverables | Durasi |
|-------|------|-------------|--------|
| **0** | Setup & Foundation | Astro 5 init, Tailwind v4 config, Storyblok setup, GSAP + Lenis + Mux install, design tokens, font loading, Vercel CI/CD | 3 hari |
| **1** | Motion System | SplitReveal, FadeUp, ParallaxLayer, ClipReveal, CountUp, MagneticEl, HorizontalScroll, Marquee, Astro View Transitions custom wipe, Cursor class | 5 hari |
| **2** | Home Page | Semua 8 section — hero, horizontal scroll, stats, marquee — responsive desktop + mobile | 7 hari |
| **3** | Work Section | Work listing + FLIP filter, case study detail page, next-project nav, Storyblok GROQ queries | 5 hari |
| **4** | About + Services | About: team, timeline, manifesto. Services: process flow. Editorial clip-path reveals | 4 hari |
| **5** | Journal / Blog | Blog listing, long-form article, TOC sticky sidebar, reading progress bar | 3 hari |
| **6** | Contact + Footer | Contact form + Resend API, footer nav, back-to-top magnetic | 2 hari |
| **7** | WebGL / Shader | OGL image distortion hover ATAU Three.js 3D scene — tergantung keputusan OI-03 | 4 hari |
| **8** | Polish & QA | Lighthouse audit semua halaman, cross-browser (Chrome/Safari/Firefox/Edge), iOS Safari + Android Chrome, axe-core audit, CLS fix, View Transition edge cases | 5 hari |
| **9** | Launch Prep | Domain + DNS, Vercel production, sitemap submit Search Console, Fathom verify, Awwward submission prep | 2 hari |

**Total Estimasi: 40 hari kerja (~8 minggu)**

---

## 14. Dependency Manifest

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `astro` | 5.x | Framework utama |
| `@astrojs/tailwind` | latest | Tailwind integration |
| `@astrojs/react` | latest | React Islands (opsional) |
| `@astrojs/vercel` | latest | Vercel adapter |
| `@astrojs/sitemap` | latest | Auto sitemap |
| `@astrojs/image` | latest | Image optimization |
| `tailwindcss` | 4.x | Utility styling |
| `gsap` | 3.x | Core animation engine (Club GSAP untuk SplitText) |
| `lenis` | 1.x | Smooth scroll |
| `@storyblok/astro` | latest | Storyblok CMS |
| `@mux/mux-player` | latest | Mux video player |
| `ogl` | 1.x | WebGL shader effects (conditional) |
| `three` | r168+ | 3D scenes (conditional) |
| `resend` | latest | Email API untuk contact form |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Type safety |
| `vite-plugin-glsl` | latest | Import `.vert`/`.frag` shader files |
| `@axe-core/browser` | 4.x | Accessibility testing |
| `eslint` | latest | Linting |
| `prettier` | 3.x | Formatting |
| `husky` + `lint-staged` | latest | Pre-commit hooks |

---

## 15. Open Items

| # | Item | Detail | Owner |
|---|------|--------|-------|
| **OI-01** | Body font | Helvetica Neue system stack vs self-hosted — konfirmasi Bayu | Bayu |
| **OI-02** | Accent color | Extract dari Figma MCP analysis — update Section 3.3 | Bayu |
| **OI-03** | Hero visual | Video (Mux) vs OGL shader distortion vs Three.js 3D scene — berdampak ke Phase 7 | Bayu + Dev |
| **OI-04** | CMS depth | Storyblok full setup vs Astro Content Collections saja (untuk site tanpa blog berat) | Bayu |
| **OI-05** | WebGL scope | Halaman mana yang dapat shader/3D — berdampak ke timeline | Bayu + Dev |
| **OI-06** | GSAP Club | Konfirmasi akses GSAP Club untuk SplitText plugin (paid). Alternatif: SplitType (free) | Dev |
| **OI-07** | Awwward timing | Target 4 minggu post-launch — siapkan screenshot, description, credit listing | Bayu |
| **OI-08** | i18n | English only at launch? Atau perlu EN/ID? Astro punya i18n routing built-in | Client |
| **OI-09** | Contact form | Resend API key setup — konfirmasi dengan dev | Dev |

---

## 16. Awwward Submission Checklist

> **Design 40% · Usability 20% · Creativity 20% · Content 20%**

### Design (40%)
- [ ] Typography intentional — Space Grotesk di editorial scale, bukan generic
- [ ] Color palette konsisten di semua halaman, dark-first dengan light inversions yang tepat
- [ ] Grid precise — tidak ada misalignment
- [ ] Motion menambah narasi — bukan decorative noise
- [ ] Mobile design setara desktop — bukan afterthought
- [ ] Ada satu elemen signature yang tidak terlihat di website lain

### Usability (20%)
- [ ] Navigasi jelas dan konsisten di semua halaman
- [ ] Page load terasa instant — tidak ada FOUC
- [ ] View Transitions berjalan smooth di semua browser
- [ ] Form bekerja di semua device, error states jelas
- [ ] Keyboard navigation berfungsi
- [ ] axe-core: zero critical errors

### Creativity (20%)
- [ ] Minimal satu section genuinely unexpected
- [ ] Custom cursor enhance experience, tidak distract
- [ ] Page transitions terasa signature
- [ ] Scroll-driven animations serve storytelling, bukan decoration

### Content (20%)
- [ ] Copy ditulis untuk end user — bukan filler atau boilerplate
- [ ] Case studies: challenge → process → result yang nyata
- [ ] About page punya personality — bukan company bio generik
- [ ] Semua gambar berkualitas tinggi, art-directed (bukan stock)

### Technical
- [ ] Lighthouse Performance ≥ 90 mobile — screenshot disimpan untuk submission
- [ ] Zero console errors di production build
- [ ] Tested: Chrome, Safari, Firefox, Edge (2 versi terakhir)
- [ ] Tested: iOS Safari, Android Chrome
- [ ] Astro View Transitions: tidak ada flash / blank frame saat navigasi
- [ ] OG image terpasang dan preview di semua halaman

---

*PRD v3.0 — Juni 2026. Stack dikonfirmasi berdasarkan analisis langsung source code aupalevodka.com (Astro v5 + Storyblok, meta generator tag terverifikasi) — dibangun Locomotive, Awwward SOTD 17 Maret 2026. Locomotive memiliki 14+ SOTD/SOTY awards, mayoritas dengan Astro + GSAP + Lenis sebagai core stack sejak 2024.*
