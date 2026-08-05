import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

/** How long a shape sits in the frame before the next one steps in. */
const DWELL = 2600;
/** Seconds one step takes. */
const TRAVEL = 0.8;
/** How long after a manual interaction before the stepping picks back up. */
const RESUME_DELAY = 1400;

/**
 * Approach rail — shapes that step through a frame that never moves.
 *
 * The frame is a static element in the markup, centred and owned by nobody.
 * This only moves the rail underneath it: one step parks the next item exactly
 * in the frame's well, scales it up to fill it, and writes its caption into
 * the frame's caption line. Between steps nothing is framed, so the caption
 * fades out with it.
 *
 * Every item occupies the same slot and the size difference is a transform, so
 * the track's geometry never changes — a scroll target measured once stays
 * correct, which is what lets the step land on the pixel.
 *
 * Native `overflow-x: auto` does the scrolling, so trackpad, touch and
 * scrollbar all behave correctly for free; pointer drag is added by hand
 * because a mouse has no other way to move a horizontal rail. The list is
 * rendered twice and scrollLeft wraps at the halfway point, so the loop never
 * shows an edge in either direction. After any manual move the rail settles on
 * the nearest item rather than stopping between two.
 */
function initRail(cleanups: Array<() => void>): void {
  const rail = document.querySelector<HTMLElement>('[data-cs-rail]');
  const track = rail?.querySelector<HTMLElement>('[data-cs-track]');
  if (!rail || !track) return;

  const items = gsap.utils.toArray<HTMLElement>('[data-cs-ap-item]', track);
  if (items.length < 2) return;

  const caption = document.querySelector<HTMLElement>('[data-cs-ap-caption]');
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = prefersReducedMotion();

  /** Items in one copy of the list — it is rendered twice. */
  const per = items.length / 2;
  /** Width of one copy — the point scrollLeft wraps at. */
  let loopWidth = track.scrollWidth / 2;

  let index = Math.floor(per / 2);
  let tween: gsap.core.Tween | null = null;
  let dwellTimer = 0;
  let settleTimer = 0;
  let dragging = false;

  /** scrollLeft that puts item i dead centre. */
  const targetFor = (i: number) => {
    const item = items[i];
    return item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2;
  };

  const frame = (i: number) => {
    items.forEach((item, n) => {
      if (n === i) item.setAttribute('data-active', '');
      else item.removeAttribute('data-active');
    });

    if (!caption) return;
    if (i < 0) {
      caption.setAttribute('data-empty', '');
      return;
    }
    caption.textContent = items[i].dataset.caption ?? '';
    caption.removeAttribute('data-empty');
  };

  /* Keeping the index inside the first copy is what makes the loop endless:
     the two copies are identical, so jumping back by one copy's width is
     invisible. */
  const rewind = () => {
    if (index < per || loopWidth <= 0) return;
    index -= per;
    rail.scrollLeft -= loopWidth;
  };

  const nearest = () => {
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    items.forEach((item, i) => {
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  };

  const stop = () => {
    tween?.kill();
    tween = null;
    window.clearTimeout(dwellTimer);
    window.clearTimeout(settleTimer);
  };

  /** Ease the rail to item i, then hold it there. */
  const goTo = (i: number, duration = TRAVEL) => {
    stop();
    index = i;
    frame(-1);

    const land = () => {
      tween = null;
      rewind();
      frame(index);
      if (!reduced) dwellTimer = window.setTimeout(() => goTo(index + 1), DWELL);
    };

    if (reduced || duration === 0) {
      rail.scrollLeft = targetFor(index);
      land();
      return;
    }

    tween = gsap.to(rail, {
      scrollLeft: targetFor(index),
      duration,
      ease: 'power2.inOut',
      onComplete: land,
    });
  };

  /** Called after any manual move: settle on whatever is closest. */
  const settleSoon = () => {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (dragging) return;
      goTo(nearest(), 0.45);
    }, RESUME_DELAY);
  };

  const interrupt = () => {
    stop();
    frame(-1);
  };

  // --- Manual drag ---------------------------------------------------------
  let startX = 0;
  let startScroll = 0;
  let moved = false;

  rail.addEventListener(
    'pointerdown',
    (event: PointerEvent) => {
      // Let touch use the native scroller; this is for mouse and pen.
      if (event.pointerType === 'touch') return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.setAttribute('data-dragging', '');
      interrupt();
    },
    { signal },
  );

  rail.addEventListener(
    'pointermove',
    (event: PointerEvent) => {
      if (!dragging) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) > 3) {
        moved = true;
        // Only capture once it is clearly a drag, so a plain click inside the
        // rail still behaves like a click.
        if (!rail.hasPointerCapture(event.pointerId)) rail.setPointerCapture(event.pointerId);
      }
      if (moved) rail.scrollLeft = startScroll - delta;
    },
    { signal },
  );

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    rail.removeAttribute('data-dragging');
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    goTo(nearest(), 0.45);
  };

  rail.addEventListener('pointerup', endDrag, { signal });
  rail.addEventListener('pointercancel', endDrag, { signal });

  rail.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    },
    { signal, capture: true },
  );

  // Touch and sideways wheels move the rail through the native scroller, so
  // they never reach the drag handlers above. A plain vertical wheel is the
  // page scrolling past this section, not an attempt to move it.
  const manual = () => {
    interrupt();
    settleSoon();
  };

  rail.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) manual();
    },
    { signal, passive: true },
  );
  rail.addEventListener('touchstart', manual, { signal, passive: true });
  rail.addEventListener('touchmove', manual, { signal, passive: true });

  // --- Layout --------------------------------------------------------------
  const observer = new ResizeObserver(() => {
    const before = loopWidth;
    loopWidth = track.scrollWidth / 2;
    // A resize re-lays the track, so the old scroll offset means nothing.
    if (before !== loopWidth) goTo(index, 0);
  });
  observer.observe(track);

  goTo(index, 0);

  cleanups.push(() => {
    controller.abort();
    stop();
    observer.disconnect();
  });
}

/**
 * Video band — the round play mark starts inline playback.
 *
 * Same contract as the testimonial videos: the <video> ships with
 * preload="none" and no `controls`, so a tile nobody plays costs one poster
 * image. The first press hands both over to the browser, because from that
 * point the native UI is the right one. Only one plays at a time.
 *
 * Nothing here runs for a tile without a video URL — those render as a plain
 * block, never a dead control.
 */
function initVideos(cleanups: Array<() => void>): void {
  const band = document.querySelector<HTMLElement>('[data-cs-videos]');
  if (!band) return;

  const buttons = gsap.utils.toArray<HTMLButtonElement>('[data-cs-play]', band);
  if (!buttons.length) return;

  const videos = gsap.utils.toArray<HTMLVideoElement>('[data-cs-video]', band);
  const controller = new AbortController();
  const { signal } = controller;

  buttons.forEach((button) => {
    const media = button.closest<HTMLElement>('[data-cs-media]');
    const video = media?.querySelector<HTMLVideoElement>('[data-cs-video]');
    if (!media || !video) return;

    button.addEventListener(
      'click',
      () => {
        videos.forEach((other) => {
          if (other !== video) other.pause();
        });

        video.controls = true;
        media.setAttribute('data-playing', '');

        // Autoplay policy can still refuse; if it does, put the poster and the
        // play mark back rather than leaving a dead frame.
        void video.play().catch(() => {
          video.controls = false;
          media.removeAttribute('data-playing');
        });
      },
      { signal },
    );

    video.addEventListener(
      'ended',
      () => {
        video.controls = false;
        video.currentTime = 0;
        media.removeAttribute('data-playing');
      },
      { signal },
    );
  });

  cleanups.push(() => {
    controller.abort();
    videos.forEach((video) => video.pause());
  });
}

/**
 * Core experience — one feature open at a time.
 *
 * The open item is an attribute; the description's reveal and the panel's
 * crossfade are both CSS transitions off it (see CaseStudyExperience.astro).
 * This only decides which one is open, and keeps aria-expanded in step.
 *
 * Click, not hover: the description is content, and on touch there is no hover
 * to give it.
 */
function initExperience(cleanups: Array<() => void>): void {
  const section = document.querySelector<HTMLElement>('[data-cs-ex]');
  if (!section) return;

  const items = gsap.utils.toArray<HTMLElement>('[data-cs-ex-item]', section);
  const panels = gsap.utils.toArray<HTMLElement>('[data-cs-ex-panel]', section);
  if (items.length < 2) return;

  const controller = new AbortController();
  const { signal } = controller;

  const open = (index: number) => {
    items.forEach((item, i) => {
      const on = i === index;
      if (on) item.setAttribute('data-open', '');
      else item.removeAttribute('data-open');
      item
        .querySelector<HTMLButtonElement>('[data-cs-ex-toggle]')
        ?.setAttribute('aria-expanded', String(on));
    });

    panels.forEach((panel, i) => {
      if (i === index) panel.setAttribute('data-open', '');
      else panel.removeAttribute('data-open');
    });
  };

  items.forEach((item, i) => {
    item
      .querySelector<HTMLButtonElement>('[data-cs-ex-toggle]')
      ?.addEventListener('click', () => open(i), { signal });
  });

  cleanups.push(() => controller.abort());
}

/**
 * Case-study page behaviour. Returns a no-op on every other page — both parts
 * look for their own markup and leave if it isn't there.
 */
export function initCaseStudy(): () => void {
  const cleanups: Array<() => void> = [];

  initRail(cleanups);
  initVideos(cleanups);
  initExperience(cleanups);

  return () => cleanups.forEach((fn) => fn());
}
