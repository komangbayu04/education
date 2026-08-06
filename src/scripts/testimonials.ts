import { gsap, ScrollTrigger } from './gsap';
import { isTouch, prefersReducedMotion } from './utils/device';

/** Pixels per second the rail drifts on its own. */
const AUTO_SPEED = 42;
/** How long after a manual interaction before the drift picks back up. */
const RESUME_DELAY = 1400;

/**
 * Featured accordion — exactly one note open at a time.
 *
 * The open state is an attribute on the person, and the width change is a CSS
 * transition on flex-basis (see Testimonials.astro); this only decides *which*
 * one is open. Index 0 is the default, and releasing returns to it.
 *
 * Hover is the stated interaction, but focus is wired to the same path so the
 * notes are reachable by keyboard — every other hover state in this project
 * has a focus equivalent.
 *
 * Skipped entirely on touch: there is no hover there, and the CSS at that
 * width already lays every note out open.
 */
function initFeature(section: HTMLElement, cleanups: Array<() => void>): void {
  const feature = section.querySelector<HTMLElement>('[data-tm-feature]');
  if (!feature || isTouch()) return;

  const people = gsap.utils.toArray<HTMLElement>('[data-tm-person]', feature);
  if (people.length < 2) return;

  const controller = new AbortController();
  const { signal } = controller;

  /* One open note per ROW, not per section. The open note takes its width
     from the person beside it, so the accordion only ever balances within a
     row — clearing every other row on hover would collapse rows the pointer
     is nowhere near, and they would sit there noteless until hovered. */
  const rowOf = (person: HTMLElement) => person.parentElement;

  const apply = (index: number) => {
    const target = people[index];
    const row = rowOf(target);
    if (!row) return;

    people.forEach((person) => {
      if (rowOf(person) !== row) return;
      if (person === target) person.setAttribute('data-open', '');
      else person.removeAttribute('data-open');
    });
  };

  /* Which person a row falls back to. Starts as the first in each row — the
     state the markup ships in — and moves to whoever was last *chosen* there,
     by pressing play, pause or the sound. Hover still opens whatever it is
     over; this is only what the row returns to when the pointer leaves.

     Clicking a control is a stronger signal than passing over a card: it means
     that person is the one being watched, and their quote has to stay up
     rather than snap back to a neighbour's the moment the pointer moves. */
  const chosen = new Map<Element, HTMLElement>();

  const applyDefaults = () => {
    const seen = new Set<Element>();
    people.forEach((person) => {
      const row = rowOf(person);
      if (!row) return;

      const wanted = chosen.get(row) ?? (seen.has(row) ? null : person);
      seen.add(row);

      if (wanted === person) person.setAttribute('data-open', '');
      else person.removeAttribute('data-open');
    });
  };

  people.forEach((person, i) => {
    person.addEventListener('pointerenter', () => apply(i), { signal });
    person.addEventListener('focusin', () => apply(i), { signal });

    /* Pressing play, pause or the sound makes this the row's active card:
       opened right away, and stays open once the pointer has gone. Watching
       someone with their quote hidden is the wrong way round. */
    person.addEventListener(
      'click',
      (event) => {
        const control = (event.target as HTMLElement).closest('[data-tm-toggle], [data-tm-sound]');
        if (!control) return;

        const row = rowOf(person);
        if (row) chosen.set(row, person);
        apply(i);
      },
      { signal },
    );

    const video = person.querySelector<HTMLVideoElement>('[data-tm-video]');
    if (!video) return;

    /* Turning the sound on makes this the row's active card too — the same
       thing pressing play does, and for the same reason. It does NOT stop
       hover from working while it plays: the note closing does not touch the
       video, and `chosen` brings this card back the moment the pointer
       leaves. An audible card used to lock the whole row, which meant one
       press on the sound left every card in it unable to open. */
    video.addEventListener(
      'volumechange',
      () => {
        if (video.muted) return;
        const row = rowOf(person);
        if (row) chosen.set(row, person);
        apply(i);
      },
      { signal },
    );
  });

  const reset = () => applyDefaults();

  feature.addEventListener('pointerleave', reset, { signal });
  feature.addEventListener(
    'focusout',
    (event: FocusEvent) => {
      // Only reset once focus has actually left the whole row, not when it
      // moves between two controls inside it.
      if (!feature.contains(event.relatedTarget as Node | null)) reset();
    },
    { signal },
  );

  cleanups.push(() => controller.abort());
}

/**
 * Featured video — plays itself, silently; this is the switch for the sound.
 *
 * The markup autoplays every featured video muted and looping, which is the
 * only kind of autoplay a browser allows. So the question a control here
 * answers is no longer "start it" but "let me hear it", and that is all this
 * does: it unmutes, and hands over the native controls at the same time, since
 * from the moment someone wants the audio they want to be able to scrub and
 * pause it too.
 *
 * Only one is ever audible: turning on the sound for one mutes the other,
 * which otherwise leaves two people talking over each other on the same row.
 *
 * Off-screen videos are paused. Two remote clips decoding for the whole life
 * of the page is a cost with nothing to show for it while the section is
 * nowhere near the viewport — and on a phone it is battery. They pick up where
 * they left off when the section comes back.
 */
function initVideos(section: HTMLElement, cleanups: Array<() => void>): void {
  const videos = gsap.utils.toArray<HTMLVideoElement>('[data-tm-video]', section);
  if (!videos.length) return;

  const controller = new AbortController();
  const { signal } = controller;
  const buttons = gsap.utils.toArray<HTMLButtonElement>('[data-tm-sound]', section);

  /* Videos the viewer stopped by hand. The observer below resumes anything
     that comes back on screen, and without this it would override that
     decision the first time the section scrolled out and back. */
  const held = new WeakSet<HTMLVideoElement>();

  gsap.utils.toArray<HTMLButtonElement>('[data-tm-toggle]', section).forEach((button) => {
    const media = button.closest<HTMLElement>('[data-tm-media]');
    const video = media?.querySelector<HTMLVideoElement>('[data-tm-video]');
    if (!media || !video) return;

    /* aria-pressed carries "is playing" and the CSS swaps the mark off it, so
       the badge always offers the other state. The label is the action. */
    const sync = () => {
      const playing = !video.paused;
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', playing ? 'Pause this testimonial' : 'Play this testimonial');
    };

    button.addEventListener(
      'click',
      () => {
        if (video.paused) {
          held.delete(video);
          void video.play().catch(() => {});
        } else {
          held.add(video);
          video.pause();
        }
        sync();
      },
      { signal },
    );

    // Covers the native controls, and the observer pausing it off-screen.
    video.addEventListener('play', sync, { signal });
    video.addEventListener('pause', sync, { signal });
    sync();
  });

  buttons.forEach((button) => {
    const media = button.closest<HTMLElement>('[data-tm-media]');
    const video = media?.querySelector<HTMLVideoElement>('[data-tm-video]');
    if (!media || !video) return;

    /* The label is the action, not the state — "Turn on sound" while it is
       off, "Mute" while it is on. aria-pressed carries the state, and the CSS
       reads the same attribute to swap the slash for the waves. */
    const label = button.getAttribute('aria-label') ?? 'Turn on sound';

    const sync = () => {
      const on = !video.muted;
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? 'Mute this testimonial' : label);
      video.controls = on;
    };

    button.addEventListener(
      'click',
      () => {
        const turningOn = video.muted;

        if (turningOn) {
          videos.forEach((other) => {
            if (other !== video) other.muted = true;
          });
        }

        video.muted = !turningOn;
        // The click is the gesture that lets an unmuted video keep playing;
        // it may be paused — off-screen, or stopped by hand — and asking to
        // hear something is asking for it to be running.
        if (turningOn) {
          held.delete(video);
          void video.play().catch(() => {});
        }
        sync();
      },
      { signal },
    );

    // Also covers the other button muting this one, and the native controls.
    video.addEventListener('volumechange', sync, { signal });
    sync();
  });

  /* The attribute is in the markup, but a video restored from the back/forward
     cache can come back with the property out of step with it — and an
     unmuted video is exactly what autoplay is not allowed to be. */
  videos.forEach((video) => {
    video.muted = true;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        // Never restarts one the viewer stopped by hand.
        if (entry.isIntersecting) {
          if (!held.has(video)) void video.play().catch(() => {});
        } else video.pause();
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
}

/** How long each person holds the spotlight before it moves on. */
const SPOTLIGHT_INTERVAL = 10_000;

/**
 * Featured spotlight — the mobile face of the same two people.
 *
 * One is shown at a time and the rail of thumbnails chooses between them. It
 * advances on its own every ten seconds, and the first manual pick stops that
 * for good: once someone has said which one they want to look at, moving it
 * out from under them is the wrong answer. There is no restart timer, on
 * purpose — a rotation that comes back after a pause is the same surprise,
 * just delayed.
 */
function initSpotlight(section: HTMLElement, cleanups: Array<() => void>): void {
  const spot = section.querySelector<HTMLElement>('[data-tm-spot]');
  if (!spot) return;

  const panels = gsap.utils.toArray<HTMLElement>('[data-tm-spot-panel]', spot);
  const copies = gsap.utils.toArray<HTMLElement>('[data-tm-spot-copy]', spot);
  const picks = gsap.utils.toArray<HTMLButtonElement>('[data-tm-spot-pick]', spot);
  if (panels.length < 2) return;

  const controller = new AbortController();
  const { signal } = controller;
  let index = 0;
  let timer: number | undefined;

  const show = (next: number) => {
    index = ((next % panels.length) + panels.length) % panels.length;
    const mark = (els: HTMLElement[]) =>
      els.forEach((el, i) => {
        if (i === index) el.setAttribute('data-active', '');
        else el.removeAttribute('data-active');
      });
    mark(panels);
    mark(copies);
    mark(picks);
    // A video left playing in a panel nobody can see would keep talking.
    gsap.utils.toArray<HTMLVideoElement>('[data-tm-video]', spot).forEach((v, i) => {
      if (i !== index) v.pause();
    });
  };

  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };

  if (!prefersReducedMotion()) {
    timer = window.setInterval(() => show(index + 1), SPOTLIGHT_INTERVAL);
  }

  picks.forEach((button, i) => {
    button.addEventListener(
      'click',
      () => {
        stop();
        show(i);
      },
      { signal },
    );
  });

  // Asking to hear one is a choice too — the rotation would cut it off
  // mid-word.
  gsap.utils.toArray<HTMLElement>('[data-tm-sound]', spot).forEach((button) => {
    button.addEventListener('click', stop, { signal });
  });

  cleanups.push(() => {
    stop();
    controller.abort();
  });
}

/**
 * Marquee — a native scroller that also drifts on its own.
 *
 * Native `overflow-x: auto` does the heavy lifting, so trackpad, touch and
 * scrollbar all work for free and correctly. On top of that:
 *   - the card list is rendered twice, and scrollLeft wraps at the halfway
 *     point, so the loop is seamless in both directions
 *   - a ticker callback adds the drift, paused only while the user is actually
 *     moving the rail — dragging it, or scrolling it sideways — and resumed a
 *     beat after they stop. Hovering does NOT pause it (explicit direction):
 *     the rail keeps travelling under a resting cursor.
 *   - pointer drag is added by hand, because a mouse otherwise has no way to
 *     scroll a horizontal rail
 *
 * Under reduced motion the drift never starts; the rail stays fully scrollable
 * by hand.
 */
function initMarquee(section: HTMLElement, cleanups: Array<() => void>): void {
  const rail = section.querySelector<HTMLElement>('[data-tm-rail]');
  const track = section.querySelector<HTMLElement>('[data-tm-track]');
  if (!rail || !track) return;

  const segments = gsap.utils.toArray<HTMLElement>('[data-tm-seg]', section);
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

  const syncProgress = () => {
    if (!segments.length || loopWidth <= 0) return;
    const ratio = (rail.scrollLeft % loopWidth) / loopWidth;
    const active = Math.min(segments.length - 1, Math.floor(ratio * segments.length));
    segments.forEach((seg, i) => {
      if (i === active) seg.setAttribute('data-active', '');
      else seg.removeAttribute('data-active');
    });
  };

  rail.addEventListener(
    'scroll',
    () => {
      wrap();
      syncProgress();
    },
    { signal, passive: true },
  );

  syncProgress();

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
        // Only capture once it's clearly a drag, so a plain click on a link
        // inside the rail still behaves like a click.
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

  // Suppress the click that follows a drag, so dragging across a card never
  // triggers something inside it.
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

  // --- Jump to a quote -----------------------------------------------------
  // The marks under the rail are buttons: pressing one scrolls that quote into
  // place. Their position is the same ratio syncProgress reads back, so this
  // is that calculation inverted — and it stays inside the copy the rail is
  // currently in, so the jump is never a whole loop long.
  let resumeAt = 0;

  const hold = () => {
    resumeAt = performance.now() + RESUME_DELAY;
  };

  segments.forEach((segment, i) => {
    segment.addEventListener(
      'click',
      () => {
        if (loopWidth <= 0 || !segments.length) return;
        hold();
        const base = Math.floor(rail.scrollLeft / loopWidth) * loopWidth;
        gsap.to(rail, {
          scrollLeft: base + (i / segments.length) * loopWidth,
          duration: 0.6,
          ease: 'power2.inOut',
          overwrite: true,
          onUpdate: syncProgress,
          onComplete: () => {
            wrap();
            syncProgress();
          },
        });
      },
      { signal },
    );
  });

  // --- Auto drift ----------------------------------------------------------
  if (prefersReducedMotion()) {
    cleanups.push(() => controller.abort());
    return;
  }

  // Sideways wheels only. This listener fires for *every* wheel over the rail,
  // including the plain vertical ones that are just scrolling the page past
  // this section — holding on those stopped the marquee for as long as the
  // cursor happened to rest here, which is the same complaint as the hover
  // pause, arriving by a different route.
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
  const tick = (time: number) => {
    const dt = Math.min(64, time - last);
    last = time;

    if (dragging || time < resumeAt || loopWidth <= 0) return;

    rail.scrollLeft += (AUTO_SPEED * dt) / 1000;
    wrap();
  };

  // gsap.ticker passes elapsed time in seconds; performance.now() is what the
  // hold timestamps use, so the callback reads the clock itself rather than
  // mixing the two units.
  const tickerHandler = () => tick(performance.now());
  gsap.ticker.add(tickerHandler);

  // The loop width depends on layout, so it has to be re-measured whenever
  // that changes.
  const observer = new ResizeObserver(() => {
    measure();
    syncProgress();
  });
  observer.observe(track);

  cleanups.push(() => {
    controller.abort();
    gsap.ticker.remove(tickerHandler);
    observer.disconnect();
  });
}

/**
 * Testimonials (chapter 8) — the hover accordion, the marquee, and a one-shot
 * reveal when the section first scrolls into view.
 *
 * Same contract as the other post-scene sections: the reveal is not scrubbed
 * and not pinned, because the handover into this section is plain document
 * scroll.
 *
 * Returns a cleanup function.
 */
export function initTestimonials(): () => void {
  const section = document.querySelector<HTMLElement>('[data-tm]');
  if (!section) return () => {};

  const cleanups: Array<() => void> = [];

  initFeature(section, cleanups);
  initSpotlight(section, cleanups);
  initVideos(section, cleanups);
  initMarquee(section, cleanups);

  if (prefersReducedMotion()) {
    // CSS already renders the finished section under the same query.
    return () => cleanups.forEach((fn) => fn());
  }

  const people = gsap.utils.toArray<HTMLElement>('[data-tm-person]', section);
  const cards = gsap.utils.toArray<HTMLElement>('.tm__quote-card', section);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: { trigger: section, start: 'top 75%', once: true },
  });

  if (people.length) {
    tl.fromTo(people, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, 0);
  }

  if (cards.length) {
    // Only the first few are on screen; staggering all of them (including the
    // duplicated copy) would run long after the rail has scrolled past.
    tl.fromTo(
      cards.slice(0, 6),
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 },
      0.25,
    );
    tl.set(cards.slice(6), { opacity: 1 }, 0.25);
  }

  cleanups.push(() => {
    tl.scrollTrigger?.kill();
    tl.kill();
  });

  return () => {
    cleanups.forEach((fn) => fn());
    ScrollTrigger.refresh();
  };
}
