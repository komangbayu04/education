import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

/** Pixels per second the approach rail drifts on its own. */
const AUTO_SPEED = 38;
/** How long after a manual interaction before the drift picks back up. */
const RESUME_DELAY = 1200;

/**
 * Approach rail — a native scroller that also drifts on its own.
 *
 * Same mechanism as the testimonials marquee, for the same reasons: native
 * `overflow-x: auto` gives trackpad, touch and scrollbar correct behaviour for
 * free, the item list is rendered twice so scrollLeft can wrap at the halfway
 * point in either direction, and a ticker adds the drift on top.
 *
 * Pointer drag is added by hand — a mouse has no other way to move a
 * horizontal rail — and the drift pauses only while the rail is actually being
 * moved, never on a resting cursor.
 *
 * There is no fixed feature: whichever item is nearest the centre of the rail
 * is the one wearing the mat and the caption, so dragging brings the next
 * shape into the frame instead of carrying the frame away. The switch has a
 * dead band, because the active item is also the widest one — without it the
 * width change would move its own centre back under the threshold and the two
 * neighbours would trade places every frame.
 *
 * It opens with the middle item of the first copy centred.
 */
function initRail(cleanups: Array<() => void>): void {
  const rail = document.querySelector<HTMLElement>('[data-cs-rail]');
  const track = rail?.querySelector<HTMLElement>('[data-cs-track]');
  if (!rail || !track) return;

  const controller = new AbortController();
  const { signal } = controller;

  /** Width of one copy of the list — the point scrollLeft wraps at. */
  let loopWidth = 0;
  const measure = () => {
    loopWidth = track.scrollWidth / 2;
  };
  measure();

  // Guard so the wrap, which writes scrollLeft, doesn't recurse through its
  // own scroll event.
  let wrapping = false;
  const wrap = () => {
    if (wrapping || loopWidth <= 0) return;
    if (rail.scrollLeft >= loopWidth) {
      wrapping = true;
      rail.scrollLeft -= loopWidth;
      wrapping = false;
    } else if (rail.scrollLeft <= 0) {
      wrapping = true;
      rail.scrollLeft += loopWidth;
      wrapping = false;
    }
  };

  const items = gsap.utils.toArray<HTMLElement>('[data-cs-ap-item]', track);

  /** Distance the new candidate has to win by before the frame moves. */
  const DEAD_BAND = 24;
  let active = -1;

  const syncActive = () => {
    if (!items.length) return;
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

    if (best === active) return;
    if (active >= 0) {
      const current = items[active];
      const currentDistance = Math.abs(current.offsetLeft + current.offsetWidth / 2 - mid);
      if (bestDistance > currentDistance - DEAD_BAND) return;
    }

    items.forEach((item, i) => {
      if (i === best) item.setAttribute('data-active', '');
      else item.removeAttribute('data-active');
    });
    active = best;
  };

  const centreStart = () => {
    if (!items.length || loopWidth <= 0) return;
    // Middle of the first copy — the list is rendered twice.
    const target = items[Math.floor(items.length / 4)];

    // Feature it *before* measuring, with transitions suppressed for one
    // frame: the active item is the wide one, and measuring it mid-transition
    // centres the rail on a width it is about to stop having.
    rail.setAttribute('data-instant', '');
    items.forEach((item) => {
      if (item === target) item.setAttribute('data-active', '');
      else item.removeAttribute('data-active');
    });
    active = items.indexOf(target);

    rail.scrollLeft = target.offsetLeft - (rail.clientWidth - target.offsetWidth) / 2;
    wrap();
    requestAnimationFrame(() => rail.removeAttribute('data-instant'));
  };
  centreStart();

  rail.addEventListener(
    'scroll',
    () => {
      wrap();
      syncActive();
    },
    { signal, passive: true },
  );

  // --- Manual drag ---------------------------------------------------------
  let dragging = false;
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

  // --- Auto drift ----------------------------------------------------------
  const observer = new ResizeObserver(() => {
    const before = loopWidth;
    measure();
    // A resize re-lays the track, so the old scroll offset means nothing.
    if (before !== loopWidth) centreStart();
  });
  observer.observe(track);

  if (prefersReducedMotion()) {
    cleanups.push(() => {
      controller.abort();
      observer.disconnect();
    });
    return;
  }

  let resumeAt = 0;
  const hold = () => {
    resumeAt = performance.now() + RESUME_DELAY;
  };

  // Sideways wheels only: a plain vertical wheel over the rail is the page
  // scrolling past this section, not an attempt to move it.
  rail.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) hold();
    },
    { signal, passive: true },
  );
  rail.addEventListener('touchstart', hold, { signal, passive: true });
  rail.addEventListener('touchmove', hold, { signal, passive: true });

  let last = performance.now();
  const tick = () => {
    const time = performance.now();
    const dt = Math.min(64, time - last);
    last = time;

    if (dragging || time < resumeAt || loopWidth <= 0) return;

    rail.scrollLeft += (AUTO_SPEED * dt) / 1000;
    wrap();
    syncActive();
  };

  gsap.ticker.add(tick);

  cleanups.push(() => {
    controller.abort();
    gsap.ticker.remove(tick);
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
