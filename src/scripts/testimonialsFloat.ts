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
 * The lightbox — the full testimonial over a white ground: the film on the
 * left, what they said beside it.
 *
 * One <dialog> for every film, with a panel of copy per film already in the
 * markup; pressing a film points the player at that film's source, unhides its
 * panel, holds the previews and the page's scroll, and opens it modally. The
 * browser handles focus, Escape and putting focus back on the film afterwards.
 * The source is dropped again on close so the film is not left buffering
 * behind the page.
 *
 * Opening is a reveal of its own: the screen fades up, the film settles in
 * from just under its own size, and the copy beside it rises a block at a
 * time. Under reduced motion it is simply there.
 */
function initLightbox(section: HTMLElement, previews: Previews, cleanups: Array<() => void>): void {
  const dialog = section.querySelector<HTMLDialogElement>('[data-tmf-lb]');
  const frame = section.querySelector<HTMLElement>('[data-tmf-lb-frame]');
  const video = section.querySelector<HTMLVideoElement>('[data-tmf-lb-video]');
  const close = section.querySelector<HTMLButtonElement>('[data-tmf-lb-close]');
  if (!dialog || !frame || !video || !close) return;
  // No modal dialog, no lightbox — the previews still play in place.
  if (typeof dialog.showModal !== 'function') return;

  const panels = gsap.utils.toArray<HTMLElement>('[data-tmf-lb-panel]', section);
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();

  const open = (button: HTMLElement) => {
    const film = button.closest<HTMLElement>('[data-tmf-film]');
    const preview = film?.querySelector<HTMLVideoElement>('[data-tmf-video]');
    if (!preview) return;

    // Back to the default shape until this film says what shape it is.
    frame.style.removeProperty('--tmf-ar');
    video.src = preview.currentSrc || preview.src;
    if (preview.poster) video.poster = preview.poster;
    else video.removeAttribute('poster');

    const index = button.dataset.tmfOpen;
    let panel: HTMLElement | null = null;
    panels.forEach((el) => {
      el.hidden = el.dataset.tmfLbPanel !== index;
      if (!el.hidden) panel = el;
    });

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
      gsap.fromTo(
        frame,
        { scale: 0.97 },
        { scale: 1, duration: 0.5, ease: 'power3.out', overwrite: true },
      );
      /* The copy arrives after the film, a block at a time — the mark, then
         what they said, then who said it. Cleared afterwards so a panel shown
         again is not left carrying the last open's transform. */
      const blocks = panel ? [...(panel as HTMLElement).children] : [];
      if (blocks.length) {
        gsap.fromTo(
          blocks,
          { autoAlpha: 0, y: 18 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.08,
            delay: 0.12,
            overwrite: true,
            clearProps: 'transform',
          },
        );
      }
    }

    // The press is the gesture that lets it play with sound.
    void video.play().catch(() => {});
  };

  /* Out, then closed — the dialog's own close is a cut, and the screen is the
     thing being looked at. */
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
      video.pause();
      video.removeAttribute('src');
      video.load();
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

  close.addEventListener('click', requestClose, { signal });

  // The ground around the film. A click on the dialog element itself, rather
  // than on anything inside it, is a click outside.
  dialog.addEventListener(
    'click',
    (event) => {
      if (event.target === dialog) requestClose();
    },
    { signal },
  );

  /* The frame takes the film's own shape, so a 4:3 recording is not shown
     pillarboxed inside a 16:9 box on a white ground. */
  video.addEventListener(
    'loadedmetadata',
    () => {
      if (video.videoWidth && video.videoHeight) {
        frame.style.setProperty('--tmf-ar', String(video.videoWidth / video.videoHeight));
      }
    },
    { signal },
  );

  gsap.utils.toArray<HTMLElement>('[data-tmf-open]', section).forEach((button) => {
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

    split = SplitText.create(title, { type: 'lines', mask: 'lines' });
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

  return () => {
    cleanups.forEach((fn) => fn());
    if (anchor && section.id === anchor) {
      section.removeAttribute('id');
      if (wall) wall.id = anchor;
    }
    ScrollTrigger.refresh();
  };
}
