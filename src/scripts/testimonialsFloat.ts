import { gsap, ScrollTrigger, SplitText } from './gsap';
import { getLenis } from './scroll';
import { getVariant } from '../config/variations';
import { prefersReducedMotion } from './utils/device';

/**
 * Silent previews — every film plays itself, muted and looping, while it is on
 * screen, and stops the moment it is not. Three remote clips decoding under a
 * section nobody is looking at is a cost with nothing to show for it, and on a
 * phone it is battery.
 *
 * The film reads `data-playing` off this, which is what swaps its badge
 * between the pause mark (preview running) and the play mark (not).
 *
 * The lightbox holds every preview while it is up and lets go when it closes;
 * the ones that are still on screen pick up again.
 */
interface Previews {
  hold(): void;
  release(): void;
}

function initPreviews(section: HTMLElement, cleanups: Array<() => void>): Previews {
  const videos = gsap.utils.toArray<HTMLVideoElement>('[data-tmf-video]', section);
  const controller = new AbortController();
  const { signal } = controller;

  const inView = new Set<HTMLVideoElement>();
  let held = false;

  const sync = (video: HTMLVideoElement) => {
    video.closest('[data-tmf-film]')?.toggleAttribute('data-playing', !video.paused);
  };

  videos.forEach((video) => {
    /* The attribute is in the markup, but a video restored from the
       back/forward cache can come back with the property out of step with it —
       and an unmuted video is exactly what autoplay is not allowed to be. */
    video.muted = true;
    video.addEventListener('play', () => sync(video), { signal });
    video.addEventListener('pause', () => sync(video), { signal });
    sync(video);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          inView.add(video);
          if (!held) void video.play().catch(() => {});
        } else {
          inView.delete(video);
          video.pause();
        }
      });
    },
    { rootMargin: '200px 0px' },
  );

  videos.forEach((video) => observer.observe(video));

  cleanups.push(() => {
    controller.abort();
    observer.disconnect();
    videos.forEach((v) => v.pause());
  });

  return {
    hold() {
      held = true;
      videos.forEach((v) => v.pause());
    },
    release() {
      held = false;
      inView.forEach((v) => void v.play().catch(() => {}));
    },
  };
}

/**
 * The lightbox — the full testimonial on the section's own ground.
 *
 * One <dialog> for every film, with a panel of copy per film already in the
 * markup. Pressing a film points the one player at it, shows its panel, holds
 * the previews and the page's scroll, and opens the dialog modally; the
 * browser handles focus, Escape and putting focus back afterwards. The source
 * is dropped again on close so nothing is left buffering behind the page.
 *
 * TWO LAYOUTS, BY THE FILM'S SHAPE. `data-orient` on the dialog is what the
 * stylesheet reads: landscape runs the film across with the words under it,
 * portrait stands it on the left with the words beside it. The shape comes off
 * the tile's own preview, which has already loaded its metadata, so the right
 * layout is up on the first frame; the full film's metadata confirms it.
 *
 * THE ARROWS step through the films only, in the order the tiles give them, and
 * wrap. Left and right arrow keys do the same.
 */
function initLightbox(section: HTMLElement, previews: Previews, cleanups: Array<() => void>): void {
  const dialog = section.querySelector<HTMLDialogElement>('[data-tmf-lb]');
  const body = section.querySelector<HTMLElement>('[data-tmf-lb-body]');
  const frame = section.querySelector<HTMLElement>('[data-tmf-lb-frame]');
  const video = section.querySelector<HTMLVideoElement>('[data-tmf-lb-video]');
  const play = section.querySelector<HTMLButtonElement>('[data-tmf-lb-play]');
  const close = section.querySelector<HTMLButtonElement>('[data-tmf-lb-close]');
  if (!dialog || !body || !frame || !video || !play || !close) return;
  // No modal dialog, no lightbox — the previews still play in place.
  if (typeof dialog.showModal !== 'function') return;

  const panels = gsap.utils.toArray<HTMLElement>('[data-tmf-lb-panel]', section);
  const buttons = gsap.utils.toArray<HTMLElement>('[data-tmf-open]', section);
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();

  /** Each film's source and poster, by its index, read off its tile. */
  const films = new Map<number, HTMLVideoElement>();
  buttons.forEach((button) => {
    const preview = button.closest('[data-tmf-film]')?.querySelector<HTMLVideoElement>('[data-tmf-video]');
    if (preview) films.set(Number(button.dataset.tmfOpen), preview);
  });
  const order = [...films.keys()].sort((a, b) => a - b);

  let current = -1;

  const shape = (width: number, height: number) => {
    if (!width || !height) return;
    dialog.style.setProperty('--tmf-ar', String(width / height));
    dialog.dataset.orient = height > width ? 'portrait' : 'landscape';
  };

  /** Point the player and the words at one film. */
  const show = (index: number, withSound: boolean) => {
    const preview = films.get(index);
    if (!preview) return null;
    current = index;

    video.pause();
    frame.removeAttribute('data-playing');
    dialog.style.removeProperty('--tmf-ar');
    dialog.dataset.orient = 'landscape';
    shape(preview.videoWidth, preview.videoHeight);

    video.src = preview.currentSrc || preview.src;
    if (preview.poster) video.poster = preview.poster;
    else video.removeAttribute('poster');

    let panel: HTMLElement | null = null;
    panels.forEach((el) => {
      el.hidden = Number(el.dataset.tmfLbPanel) !== index;
      if (!el.hidden) panel = el;
    });

    if (withSound) void video.play().catch(() => {});
    return panel as HTMLElement | null;
  };

  /* The panel is `display: contents`, so it has no box to animate — its
     pieces and the film are what move. */
  const pieces = (panel: HTMLElement | null) => [frame, ...(panel ? [...panel.children] : [])];

  const arrive = (panel: HTMLElement | null) => {
    if (reduced) return;
    gsap.fromTo(
      pieces(panel),
      { autoAlpha: 0, y: 14 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.05,
        overwrite: true,
        clearProps: 'transform,opacity,visibility',
      },
    );
  };

  const open = (button: HTMLElement) => {
    const panel = show(Number(button.dataset.tmfOpen), false);
    if (!films.has(current)) return;

    previews.hold();
    getLenis()?.stop();
    document.documentElement.setAttribute('data-tmf-open', '');

    dialog.showModal();
    if (reduced) gsap.set(dialog, { autoAlpha: 1 });
    else {
      gsap.fromTo(
        dialog,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.35, ease: 'power2.out', overwrite: true },
      );
      arrive(panel);
    }

    // The press is the gesture that lets it play with sound.
    void video.play().catch(() => {});
  };

  let stepping = false;
  const step = (by: number) => {
    if (!dialog.open || stepping || order.length < 2) return;
    const at = order.indexOf(current);
    const next = order[(at + by + order.length) % order.length];

    if (reduced) {
      show(next, true);
      return;
    }

    stepping = true;
    const leaving = panels.find((el) => !el.hidden) ?? null;
    gsap.to(pieces(leaving), {
      autoAlpha: 0,
      duration: 0.2,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => {
        gsap.set(pieces(leaving), { clearProps: 'opacity,visibility' });
        arrive(show(next, true));
        stepping = false;
      },
    });
  };

  /* Out, then closed — the dialog's own close is a cut. */
  let closing = false;
  const requestClose = () => {
    if (closing || !dialog.open) return;
    closing = true;
    if (reduced) {
      dialog.close();
      return;
    }
    gsap.to(dialog, {
      autoAlpha: 0,
      duration: 0.25,
      ease: 'power2.in',
      overwrite: true,
      onComplete: () => dialog.close(),
    });
  };

  dialog.addEventListener(
    'close',
    () => {
      closing = false;
      stepping = false;
      current = -1;
      video.pause();
      video.removeAttribute('src');
      video.load();
      frame.removeAttribute('data-playing');
      gsap.set(dialog, { clearProps: 'opacity,visibility' });
      document.documentElement.removeAttribute('data-tmf-open');
      getLenis()?.start();
      previews.release();
    },
    { signal },
  );

  // Escape. Prevented so it goes out the same way the button takes it.
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      requestClose();
    },
    { signal },
  );

  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else return;
      event.preventDefault();
    },
    { signal },
  );

  close.addEventListener('click', requestClose, { signal });

  gsap.utils.toArray<HTMLElement>('[data-tmf-lb-step]', section).forEach((button) => {
    button.addEventListener('click', () => step(Number(button.dataset.tmfLbStep)), { signal });
  });

  /* The play mark starts the film; once it is playing the browser's own
     controls take over, and when it stops the mark comes back. */
  play.addEventListener('click', () => void video.play().catch(() => {}), { signal });

  video.addEventListener(
    'play',
    () => {
      frame.setAttribute('data-playing', '');
      video.controls = true;
    },
    { signal },
  );

  const stopped = () => {
    frame.removeAttribute('data-playing');
    video.controls = false;
  };
  video.addEventListener('pause', stopped, { signal });
  video.addEventListener('ended', stopped, { signal });
  video.addEventListener('emptied', stopped, { signal });

  // The ground around the film. A click on the dialog itself is a click outside.
  dialog.addEventListener(
    'click',
    (event) => {
      if (event.target === dialog) requestClose();
    },
    { signal },
  );

  // The full film's own word on its shape.
  video.addEventListener('loadedmetadata', () => shape(video.videoWidth, video.videoHeight), { signal });

  buttons.forEach((button) => {
    button.addEventListener('click', () => open(button), { signal });
  });

  cleanups.push(() => {
    if (dialog.open) dialog.close();
    controller.abort();
  });
}

/** The size a tile comes in at, as a fraction of its own. It reaches 1 by the
 *  time its top is a little above the middle of the screen. */
const TILE_FROM = 0.8;

/**
 * The entrances.
 *
 * There used to be a scene here: the stage was pinned for the better part of
 * four screens and a timeline was driven off the pin's progress through six
 * beats. It is gone, and so is the pin. The reference frame is a tall page
 * rather than a screen, so the layout is now the stylesheet's — the title
 * stuck in the middle of the stage with `position: sticky`, the tiles at the
 * frame's own positions down it — and the scroll moves all of it for free,
 * without ever being held.
 *
 * Two things happen on top of that. The title writes itself on a line at a
 * time, once, when it arrives; it has the first screen to itself.
 *
 * Then every tile grows from 0.8 to its full size on the way up, tied to the
 * scroll rather than fired by it — hand on the wheel, tiles opening under it,
 * and back up the page they close again. It is the one thing here that
 * scrubs, and it is cheap enough to: a transform per tile, no reads, and no
 * geometry to re-measure on a resize.
 */
function initReveal(section: HTMLElement, cleanups: Array<() => void>): void {
  const title = section.querySelector<HTMLElement>('[data-tmf-title]');
  const tiles = gsap.utils.toArray<HTMLElement>('[data-tmf-film]', section);

  const tweens: gsap.core.Tween[] = [];
  let dead = false;
  let split: SplitText | null = null;

  /* One masked line per line of the title.
     Cut only once the real face has landed: SplitText measures against the
     fallback until then, and lines cut at the wrong widths unmask against the
     wrong boxes. Waiting is safe here in a way it would not be in the hero —
     this is chapter 8, so the reader cannot be looking at it yet. */
  const cutTitle = () => {
    if (dead || !title) return;

    /* The words' own block, not the heading: the heading is a zero-height
       line the words hang from, and splitting inside it would put the masks
       in a box with no height. */
    const words = title.querySelector<HTMLElement>('[data-tmf-title-text]') ?? title;
    split = SplitText.create(words, { type: 'lines', mask: 'lines' });
    /* The stylesheet hides the whole heading until this point, so nothing
       flashes unsplit; from here the masks are what hide it. */
    gsap.set(title, { opacity: 1 });

    const lines = split.lines.length ? split.lines : [title];
    tweens.push(
      gsap.fromTo(
        lines,
        { yPercent: 115 },
        {
          yPercent: 0,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.1,
          scrollTrigger: { trigger: title, start: 'top 88%', once: true },
        },
      ),
    );
  };

  if (title) {
    if (document.fonts?.status === 'loaded') cutTitle();
    else document.fonts?.ready.then(cutTitle).catch(cutTitle);
  }

  /* From the moment a tile's top clears the bottom edge to the moment it is
     45% up the screen. Eased rather than linear so it settles into full size
     instead of stopping dead at it. */
  tiles.forEach((tile) => {
    tweens.push(
      gsap.fromTo(
        tile,
        { scale: TILE_FROM },
        {
          scale: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: tile,
            start: 'top bottom',
            end: 'top 45%',
            scrub: true,
          },
        },
      ),
    );
  });

  cleanups.push(() => {
    dead = true;
    tweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    split?.revert();
  });
}

/**
 * A shadow on every tile that is over the title's words, and on none that are
 * not.
 *
 * The title sits under the tiles, so a tile crossing it covers it — and the
 * shadow is what says which is on top. It belongs to the crossing, not to the
 * tile: on the rest of the ground the tiles are flat, and the lift appears
 * only for as long as there are words underneath to be lifted off.
 *
 * WHAT COUNTS AS "OVER THE WORDS" is the painted line, not the heading's box.
 * The box is the full measure, 711px at 1440, and the second line of this
 * title is a good deal shorter than that — so testing against the box would
 * shadow a tile that is only beside the words, in the empty end of a line.
 * Both extents are taken from the text itself, line by line. The heading's box
 * cannot give the vertical any more: it is zero high, a line the words overflow
 * evenly above and below so it stays centred when the section ends.
 *
 * Every tile against every line, per scroll update. That is a handful of
 * rectangles on elements the browser has already laid out, and it has to be
 * live: the title is sticky and the tiles are scaled by a scrub, so neither
 * box is anywhere a cached number would still describe.
 *
 * Runs under reduced motion too. The shadow is a statement about stacking, not
 * an effect; the stylesheet only drops its transition there.
 */
function initTitleShadows(section: HTMLElement, cleanups: Array<() => void>): void {
  const title = section.querySelector<HTMLElement>('[data-tmf-title]');
  const stage = section.querySelector<HTMLElement>('[data-tmf-stage]');
  const tiles = gsap.utils.toArray<HTMLElement>('[data-tmf-film]', section);
  if (!title || !stage || !tiles.length) return;

  const range = document.createRange();

  /** The painted words, as one rectangle per line. */
  const words = () => {
    /* TEXT NODES ONLY, one at a time. A range over the whole heading also
       reports the boxes of the elements inside it, and SplitText's masks and
       lines are blocks the full width of the measure — measured, every line's
       middle came back at the screen's centre and its width at 711px whatever
       the line actually held, which is the heading's box again by another
       route. Grouped by row afterwards, since a line is several runs. */
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    const rows = new Map<number, { left: number; right: number; top: number; bottom: number }>();
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const key = Math.round(r.top);
      const row = rows.get(key);
      if (row) {
        row.left = Math.min(row.left, r.left);
        row.right = Math.max(row.right, r.right);
        row.top = Math.min(row.top, r.top);
        row.bottom = Math.max(row.bottom, r.bottom);
      } else {
        rows.set(key, { left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    }
    /* Each row is its own rectangle, top and bottom included: text-node
       rectangles are the line boxes the glyphs sit in, which is what a tile
       has to overlap to be over the words. */
    return [...rows.values()];
  };

  const apply = () => {
    const lines = words();
    tiles.forEach((tile) => {
      const t = tile.getBoundingClientRect();
      const over = lines.some(
        (l) => t.left < l.right && t.right > l.left && t.top < l.bottom && t.bottom > l.top,
      );
      tile.toggleAttribute('data-over-title', over);
    });
  };

  const clear = () => tiles.forEach((tile) => tile.removeAttribute('data-over-title'));

  const watcher = ScrollTrigger.create({
    trigger: stage,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: apply,
    onRefresh: apply,
    onToggle: (self) => (self.isActive ? apply() : clear()),
  });

  apply();

  cleanups.push(() => {
    watcher.kill();
    clear();
  });
}

/**
 * Testimonials, the scrolled cut — the entrances, the silent previews, and
 * the lightbox that opens a film in full.
 *
 * A no-op unless this is the cut the reader has picked; the wall
 * (src/scripts/testimonials.ts) is the other one, and the section that is not
 * picked is display:none, which is no state to measure anything on.
 *
 * The way out of this section belongs to the footer, not here: its
 * photograph is the last image of the scatter, and src/scripts/founderQuote.ts
 * opens it out from a card into the footer's own band.
 *
 * Under reduced motion the entrances are skipped — the stylesheet leaves the
 * tiles visible under the same query — while the previews and the lightbox
 * still work, because those are content, not motion.
 *
 * Returns a cleanup function.
 */
export function initTestimonialsFloat(): () => void {
  if (getVariant('testimonials') !== 'float') return () => {};

  const section = document.querySelector<HTMLElement>('[data-tmf]');
  if (!section) return () => {};

  /* The nav's "What founders say" points at #founders, and the wall carries
     that id in the markup because it is the default cut. Two elements cannot
     have it, so it moves here for as long as this one is the section on the
     page. */
  const wall = document.querySelector<HTMLElement>('[data-tm]');
  const anchor = section.dataset.anchor;
  if (anchor && wall?.id === anchor) {
    wall.removeAttribute('id');
    section.id = anchor;
  }

  const cleanups: Array<() => void> = [];

  const previews = initPreviews(section, cleanups);
  initLightbox(section, previews, cleanups);

  if (!prefersReducedMotion()) initReveal(section, cleanups);
  initTitleShadows(section, cleanups);

  return () => {
    cleanups.forEach((fn) => fn());
    if (anchor && section.id === anchor) {
      section.removeAttribute('id');
      if (wall) wall.id = anchor;
    }
    ScrollTrigger.refresh();
  };
}
