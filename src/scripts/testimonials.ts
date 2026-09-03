import { gsap, ScrollTrigger } from './gsap';
import { getLenis } from './scroll';
import { getVariant } from '../config/variations';
import { prefersReducedMotion } from './utils/device';

/**
 * Silent previews — every film on the wall plays itself, muted and looping,
 * while it is on screen, and stops the moment it is not. Two remote clips
 * decoding under a section nobody is looking at is a cost with nothing to show
 * for it, and on a phone it is battery.
 *
 * The tile reads `data-playing` off this, which is what swaps its badge
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
  const videos = gsap.utils.toArray<HTMLVideoElement>('[data-tm-video]', section);
  const controller = new AbortController();
  const { signal } = controller;

  const inView = new Set<HTMLVideoElement>();
  let held = false;

  const sync = (video: HTMLVideoElement) => {
    video.closest('[data-tm-tile]')?.toggleAttribute('data-playing', !video.paused);
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
 * The lightbox — the full testimonial, with sound, over a white ground.
 *
 * One <dialog> for every film. Pressing a tile points it at that tile's
 * source and the client's mark, holds the wall's previews and the page's
 * scroll, and opens it modally; the browser handles focus, Escape and putting
 * focus back on the tile afterwards. The source is dropped again on close so
 * the film is not left buffering behind the page.
 */
function initLightbox(section: HTMLElement, previews: Previews, cleanups: Array<() => void>): void {
  const dialog = section.querySelector<HTMLDialogElement>('[data-tm-lightbox]');
  const frame = section.querySelector<HTMLElement>('[data-tm-lightbox-frame]');
  const video = section.querySelector<HTMLVideoElement>('[data-tm-lightbox-video]');
  const logo = section.querySelector<HTMLImageElement>('[data-tm-lightbox-logo]');
  const close = section.querySelector<HTMLButtonElement>('[data-tm-lightbox-close]');
  if (!dialog || !frame || !video || !logo || !close) return;
  // No modal dialog, no lightbox — the previews still play in place.
  if (typeof dialog.showModal !== 'function') return;

  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();

  const open = (button: HTMLElement) => {
    const tile = button.closest<HTMLElement>('[data-tm-tile]');
    const preview = tile?.querySelector<HTMLVideoElement>('[data-tm-video]');
    if (!preview) return;

    // Back to the default shape until this film says what shape it is.
    frame.style.removeProperty('--tm-ar');
    video.src = preview.currentSrc || preview.src;
    if (preview.poster) video.poster = preview.poster;
    else video.removeAttribute('poster');

    const mark = button.dataset.logo;
    if (mark) {
      logo.src = mark;
      logo.alt = button.dataset.company ?? '';
      logo.hidden = false;
    } else {
      logo.hidden = true;
    }

    previews.hold();
    getLenis()?.stop();
    document.documentElement.setAttribute('data-tm-open', '');

    dialog.showModal();
    if (reduced) gsap.set(frame, { autoAlpha: 1, scale: 1 });
    else {
      gsap.fromTo(
        frame,
        { autoAlpha: 0, scale: 0.97 },
        { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power3.out', overwrite: true },
      );
    }

    // The press is the gesture that lets it play with sound.
    void video.play().catch(() => {});
  };

  /* Out, then closed — the dialog's own close is a cut, and the frame is the
     thing on screen. */
  let closing = false;
  const requestClose = () => {
    if (closing || !dialog.open) return;
    closing = true;
    if (reduced) {
      dialog.close();
      return;
    }
    gsap.to(frame, {
      autoAlpha: 0,
      scale: 0.98,
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
      frame.removeAttribute('data-playing');
      document.documentElement.removeAttribute('data-tm-open');
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

  // The backdrop. A click on the dialog element itself, rather than on
  // anything inside the frame, is a click outside the film.
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
        frame.style.setProperty('--tm-ar', String(video.videoWidth / video.videoHeight));
      }
    },
    { signal },
  );

  // The mark stands down while the film is paused — the controls are up then.
  video.addEventListener('play', () => frame.setAttribute('data-playing', ''), { signal });
  video.addEventListener('pause', () => frame.removeAttribute('data-playing'), { signal });

  gsap.utils.toArray<HTMLElement>('[data-tm-open]', section).forEach((button) => {
    button.addEventListener('click', () => open(button), { signal });
  });

  cleanups.push(() => {
    if (dialog.open) dialog.close();
    controller.abort();
  });
}

/* --- The scene, in screens --------------------------------------------------
   Each beat's length is a fraction of the stage's height, so the scroll it
   takes reads the same on any screen. The last beat — the wall scrolling up —
   is measured off the wall itself, one pixel of scroll per pixel of travel. */
/** The film alone, before anything moves. */
const HOLD = 0.35;
/** The film drawing in and the title coming up over it. */
const DRAW_IN = 0.5;
/** The film landing on the wall, the wall rising, the title parking. */
const LAND = 0.6;

/** Where the featured tile's top rests once landed — under the title, in the
 *  wash. A fraction of the stage's height (frame: 90 of 640). */
const ARRIVE = 0.14;
/** The drawn-in film's width as a fraction of its opening width (frame: 450
 *  of 725 at 1024 wide). */
const MID = 0.62;

interface Geometry {
  W: number;
  H: number;
  big: { w: number; h: number };
  mid: { w: number; h: number };
  slot: { left: number; top: number; width: number; height: number };
  /** The wall's y when the film has landed, and where the scroll leaves it. */
  arriveY: number;
  endY: number;
  /** The title's y while it is centred on the screen, relative to its rest. */
  titleCentreY: number;
  /** Scroll distance of the whole scene, in px. */
  distance: number;
}

/**
 * The scroll scene. The stage is pinned for the scene's length and one paused
 * timeline is driven straight off the pin's progress. Not a scrub: the
 * timeline is rebuilt from fresh measurements on every refresh — the wall's
 * height, the slot's cell, the screen — and a scrub owns its timeline in a
 * way that makes swapping it out under it awkward. Driving progress by hand
 * costs nothing (Lenis is already smoothing the scroll it reads) and keeps
 * every number in it honest after a resize.
 *
 * Beats, in order (see the fractions above):
 *   hold      the featured film, large and alone, centred
 *   draw in   it shrinks in place; a white veil comes over it and the title
 *             comes up, centred, on top
 *   land      it shrinks the rest of the way into its cell as the wall rises
 *             from below the fold; the title travels to the top; the veil
 *             clears and the wash under the title comes on
 *   scroll    the wall travels up under the wash until its last row is on
 *             screen
 */
function initScene(section: HTMLElement, cleanups: Array<() => void>): void {
  const stage = section.querySelector<HTMLElement>('[data-tm-stage]');
  const wall = section.querySelector<HTMLElement>('[data-tm-wall]');
  const title = section.querySelector<HTMLElement>('[data-tm-title]');
  const fade = section.querySelector<HTMLElement>('[data-tm-fade]');
  const slot = section.querySelector<HTMLElement>('[data-tm-slot]');
  const featured = section.querySelector<HTMLElement>('[data-tm-featured]');
  const veil = section.querySelector<HTMLElement>('[data-tm-veil]');
  if (!stage || !wall || !title || !fade || !slot || !featured || !veil) return;

  const tiles = gsap.utils
    .toArray<HTMLElement>('.tm__tile', wall)
    .filter((tile) => tile !== featured);

  /* The stylesheet lays the scene's first frame out on its own — the wall a
     screen below, the film large in the middle — so nothing flashes before
     this runs. From here those are this script's to move, as transforms and
     box values, so the stylesheet's own are switched off. */
  wall.style.translate = 'none';
  featured.style.translate = 'none';
  featured.style.aspectRatio = 'auto';

  let geo: Geometry | null = null;
  let tl: gsap.core.Timeline | null = null;

  const measure = () => {
    // At rest, so the wall and title measure where the layout puts them.
    gsap.set([wall, title], { clearProps: 'transform' });

    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const wallRect = wall.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(wall).columnGap) || 16;

    /* The foot of the wall, column shifts included — the lowest tile is what
       has to clear the bottom of the screen at the end. */
    let foot = 0;
    tiles.forEach((tile) => {
      foot = Math.max(foot, tile.getBoundingClientRect().bottom - wallRect.top);
    });

    /* Opening size: most of the width, or as much as fits in most of the
       height, in the shape the films were shot in. */
    const bigW = Math.min(W * (W < 768 ? 0.9 : 0.7), H * 0.7 * (16 / 9));
    const midW = bigW * MID;

    /* Under the title, in the wash — but never with most of a tile beneath
       the copy. On a phone the title is three lines and reaches further down
       the screen than the fraction allows for, so the landing point gives way
       to it, leaving no more than a third of the tile under the title. */
    const slotH = slotRect.height;
    const titleBottom = title.offsetTop + title.offsetHeight;
    const arriveY = Math.max(H * ARRIVE, titleBottom - slotH * 0.3 - slotRect.top + wallRect.top);
    const endY = Math.min(arriveY, H - 2 * gap - foot);

    const titleCentreY = (H - title.offsetHeight) / 2 - title.offsetTop;

    const distance = H * (HOLD + DRAW_IN + LAND) + (arriveY - endY);

    geo = {
      W,
      H,
      big: { w: bigW, h: bigW * (9 / 16) },
      mid: { w: midW, h: midW * (9 / 16) },
      slot: {
        left: slotRect.left - wallRect.left,
        top: slotRect.top - wallRect.top,
        width: slotRect.width,
        height: slotRect.height,
      },
      arriveY,
      endY,
      titleCentreY,
      distance,
    };
  };

  const build = () => {
    tl?.kill();
    if (!geo) return;
    const { W, H, big, mid, slot: cell, arriveY, endY, titleCentreY } = geo;

    const hold = H * HOLD;
    const drawIn = H * DRAW_IN;
    const land = H * LAND;
    const travel = arriveY - endY;

    const atDrawIn = hold;
    const atLand = hold + drawIn;
    const atScroll = hold + drawIn + land;

    /* The featured tile is a child of the wall, so its `top` is measured from
       the wall's own top — which is a whole screen below the stage while the
       wall waits under the fold. Hence the `- H` on everything centred. */
    const centred = (size: { w: number; h: number }) => ({
      left: (W - size.w) / 2,
      top: (H - size.h) / 2 - H,
      width: size.w,
      height: size.h,
    });

    tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

    /* Every tween states both ends, and the first tween on each property
       renders its start the moment it is built. That is what parks the scene
       in its first frame — the hold — with nothing at time 0 to be un-done
       when the playhead comes back to it: a set() there is reverted when the
       scroll lands exactly on the pin's start, to whatever the element held
       when the timeline was built, which after a rebuild is mid-scene.
       Tweens that carry a property on from an earlier one do not render on
       build, or they would overwrite that earlier start. */
    const first = { immediateRender: true };
    const next = { immediateRender: false };

    // Beat 2 — draw in. (Beat 1, the hold, is the stretch before this.)
    tl.fromTo(featured, centred(big), { ...centred(mid), duration: drawIn, ...first }, atDrawIn)
      .fromTo(veil, { opacity: 0 }, { opacity: 0.6, duration: drawIn * 0.5, ...first }, atDrawIn + drawIn * 0.5)
      .fromTo(title, { autoAlpha: 0 }, { autoAlpha: 1, duration: drawIn * 0.5, ...first }, atDrawIn + drawIn * 0.5);

    // Beat 3 — land.
    tl.fromTo(featured, centred(mid), { ...cell, duration: land, ...next }, atLand)
      .fromTo(wall, { y: H }, { y: arriveY, duration: land, ...first }, atLand)
      .fromTo(title, { y: titleCentreY }, { y: 0, duration: land, ...first }, atLand)
      .fromTo(veil, { opacity: 0.6 }, { opacity: 0, duration: land * 0.7, ...next }, atLand)
      .fromTo(fade, { autoAlpha: 0 }, { autoAlpha: 1, duration: land * 0.4, ...first }, atLand + land * 0.6);

    // Beat 4 — scroll. Only if the wall is taller than the screen leaves it.
    if (travel > 0) tl.fromTo(wall, { y: arriveY }, { y: endY, duration: travel, ...next }, atScroll);
  };

  const render = (progress: number) => {
    tl?.progress(progress);
  };

  measure();
  build();

  const trigger = ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${geo?.distance ?? stage.clientHeight * 3}`,
    pin: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    /* Fresh numbers on every refresh — a resize changes the wall's height,
       the slot's cell and the screen, and every value in the timeline is one
       of those. Rebuilt whole rather than patched. */
    onRefreshInit: () => {
      measure();
      build();
    },
    onRefresh: (self) => render(self.progress),
    onUpdate: (self) => render(self.progress),
  });

  render(trigger.progress);

  cleanups.push(() => {
    trigger.kill();
    tl?.kill();
  });
}

/**
 * Testimonials (chapter 8) — the scroll scene, the wall's silent previews, and
 * the lightbox that opens a film in full.
 *
 * A no-op unless this is the cut the reader has picked; the scrolled scatter
 * (src/scripts/testimonialsFloat.ts) is the other one, and the section
 * that is not picked is display:none, which is no state to pin a scene on.
 *
 * Under reduced motion the scene is skipped: the stylesheet lays the section
 * out finished under the same query — title, then wall — and the previews and
 * the lightbox still work, because those are content, not motion.
 *
 * Returns a cleanup function.
 */
export function initTestimonials(): () => void {
  if (getVariant('testimonials') !== 'wall') return () => {};

  const section = document.querySelector<HTMLElement>('[data-tm]');
  if (!section) return () => {};

  const cleanups: Array<() => void> = [];

  const previews = initPreviews(section, cleanups);
  initLightbox(section, previews, cleanups);

  if (!prefersReducedMotion()) initScene(section, cleanups);

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
