import { gsap } from './gsap';
import { getLenis } from './scroll';
import { getVariant } from '../config/variations';
import { isTouch, prefersReducedMotion } from './utils/device';

/**
 * Testimonials, the orbit cut — the sphere and the flight.
 *
 * Two jobs, and the second is the reason this cut exists:
 *
 *   the sphere  every founder is a point on a unit sphere, the sphere is
 *               rotated a little on every frame, and each point's x and y —
 *               scaled by the orbit box — is where its tile is drawn. A point
 *               whose z has gone negative is on the far side and is drawn at
 *               `scale: 0`. That is the whole of it: no 3D transforms, no
 *               perspective, one rotation and a projection.
 *
 *   the flight  pressing a tile does not open something over it. The tile is
 *               taken out of the rotation, tweened to the middle of the
 *               landing box in the read, and grown to fill it, while every
 *               other tile is scaled and faded to nothing. So the face you
 *               pressed is the picture you end up reading beside, and closing
 *               puts it back on the sphere where it would have been by then —
 *               not where it was when you pressed it, which would read as the
 *               sphere jumping backwards.
 *
 * The rotation runs on gsap's ticker rather than a requestAnimationFrame of
 * its own. There is one loop in this page (PRD §4.6) and Lenis is already on
 * it; a second one is a second layout pass per frame for no reason.
 *
 * Nothing here touches the scroll — see the component's docstring for why the
 * reference's wheel handling is deliberately absent. The one thing this does
 * take is the scroll *lock* while the read is open, which is Lenis's own stop.
 *
 * Under reduced motion none of this runs: the stylesheet's grid stands and
 * pressing a tile still opens the panel, without the flight. That path is
 * `initStatic` at the bottom.
 *
 * Returns a cleanup function.
 */

/** One tile's state on the sphere. */
interface Point {
  /** Position on the unit sphere. Rewritten in place every frame. */
  x: number;
  y: number;
  z: number;
  /** Projected pixel offset from the orbit's centre. */
  px: number;
  py: number;
  /** 0 on the far side, 1 on the near side. */
  facing: number;
  /** The ripple's progress for this tile, 0 → 1. */
  appear: number;
  appearAt: number;
}

/** How long a tile takes to arrive in the opening ripple, in ms. */
const APPEAR_MS = 700;

/** How far apart the last tile arrives from the first, in ms. */
const RIPPLE_MS = 520;

/** Idle rotation per frame, in radians. Y is the turn; X is the tilt, and it
 *  is deliberately an order of magnitude smaller — an even tumble on both axes
 *  reads as tumbling debris rather than as a globe. */
const IDLE_X = 0.00045;
const IDLE_Y = 0.0032;

/**
 * How much of the orbit box's short side the sphere's radius takes.
 *
 * Under 0.5 because a tile is drawn from its own centre, so a tile at the
 * sphere's edge hangs half its own width past it. At 0.46 a 14rem tile on a
 * 62rem-tall box still has room to clear the top and bottom, and on a wide
 * screen the sphere reaches most of the way across because the box is now the
 * full width of the viewport.
 */
const RADIUS_SCALE = 0.46;

/** The overshoot on a tile arriving. Small: a sphere of six things all
 *  bouncing is a toy. */
function easeOutBack(t: number, s = 1.18): number {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Depth, as a size.
 *
 * A tile's distance from the middle of the sphere is how far away it is, so it
 * is drawn smaller — full size dead centre, a fifth of that at the rim. The
 * reference does this and it is not decoration: with forty-two tiles at one
 * uniform size the near face is a flat pegboard, and the thing that makes the
 * same forty-two read as a globe is that the ones at the edge are small.
 *
 * Distance is normalised against the sphere's own radius, so it is 0 at the
 * centre and 1 at the rim whatever the screen is.
 *
 * The exponent keeps the middle of the sphere close to full size and spends
 * the shrink near the edge — linear falloff shrinks tiles that are barely off
 * centre and the whole sphere reads as small.
 */
const DEPTH_MIN = 0.2;

function depthScale(px: number, py: number, radius: number): number {
  const d = clamp01(Math.hypot(px, py) / radius);
  return DEPTH_MIN + (1 - DEPTH_MIN) * (1 - Math.pow(d, 1.35));
}

export function initTestimonialsSphere(): () => void {
  if (getVariant('testimonials') !== 'orbit') return () => {};

  const section = document.querySelector<HTMLElement>('[data-tms]');
  if (!section) return () => {};

  /* The nav's "What founders say" points at #founders, and the wall carries
     that id in the markup because it is the default cut. Same handover as
     testimonialsFloat.ts: it moves here for as long as this is the section on
     the page, and goes back on cleanup. */
  const wall = document.querySelector<HTMLElement>('[data-tm]');
  const anchor = section.dataset.anchor;
  const tookAnchor = Boolean(anchor && wall?.id === anchor);
  if (tookAnchor && anchor) {
    wall?.removeAttribute('id');
    section.id = anchor;
  }

  const restoreAnchor = () => {
    if (!tookAnchor || !anchor) return;
    section.removeAttribute('id');
    if (wall) wall.id = anchor;
  };

  const items = gsap.utils.toArray<HTMLElement>('[data-tms-item]', section);
  const panels = gsap.utils.toArray<HTMLElement>('[data-tms-panel]', section);
  const orbit = section.querySelector<HTMLElement>('[data-tms-orbit]');
  const read = section.querySelector<HTMLElement>('[data-tms-read]');
  const backdrop = section.querySelector<HTMLElement>('[data-tms-backdrop]');
  const land = section.querySelector<HTMLElement>('[data-tms-land]');
  const closeBtn = section.querySelector<HTMLButtonElement>('[data-tms-close]');
  const prevBtn = section.querySelector<HTMLButtonElement>('[data-tms-prev]');
  const nextBtn = section.querySelector<HTMLButtonElement>('[data-tms-next]');

  if (!orbit || !read || !backdrop || !land || !closeBtn || !prevBtn || !nextBtn || !items.length) {
    return () => restoreAnchor();
  }

  const controller = new AbortController();
  const { signal } = controller;

  /**
   * Which founder a tile is.
   *
   * The sphere carries more points than there are founders — see ORBIT_POINTS
   * in the component — so a tile's own index is a position on the sphere and
   * not a person. `data-tms-source` is the person, and it is what the panels
   * are indexed by. Everything that turns a tile into something to read goes
   * through here; nothing else may use the tile index against `panels`.
   */
  const sourceOf = (tile: number) => Number(items[tile]?.dataset.tmsSource ?? tile);

  /* Reduced motion: no sphere, no flight. The grid in the stylesheet is
     already the finished layout, so all that is left to wire is the press. */
  if (prefersReducedMotion()) {
    const stop = initStatic({ items, panels, read, backdrop, closeBtn, prevBtn, nextBtn, signal });
    return () => {
      controller.abort();
      stop();
      restoreAnchor();
    };
  }

  // --- The sphere ----------------------------------------------------------
  const N = items.length;
  const points: Point[] = [];
  const now = performance.now();

  /**
   * A Fibonacci sphere, then turned by a random amount before the first frame.
   *
   * The turn matters and is not decoration. Without it every reload draws the
   * same face at the front, and since the tiles are handed out in the order
   * they are written, the first founder in the data would be the one who
   * greets every reader. The lattice itself is deterministic; where it is
   * standing when you arrive is not.
   */
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spinX = (Math.random() - 0.5) * Math.PI;
  const spinY = (Math.random() - 0.5) * Math.PI * 2;
  const cosSpinX = Math.cos(spinX);
  const sinSpinX = Math.sin(spinX);
  const cosSpinY = Math.cos(spinY);
  const sinSpinY = Math.sin(spinY);

  for (let i = 0; i < N; i += 1) {
    const y = N === 1 ? 0 : 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x0 = Math.cos(theta) * r;
    const z0 = Math.sin(theta) * r;

    const y1 = y * cosSpinX - z0 * sinSpinX;
    const z1 = y * sinSpinX + z0 * cosSpinX;
    const x2 = x0 * cosSpinY + z1 * sinSpinY;
    const z2 = -x0 * sinSpinY + z1 * cosSpinY;

    points.push({
      x: x2,
      y: y1,
      z: z2,
      px: 0,
      py: 0,
      facing: 0,
      appear: 0,
      /* The ripple starts from the tile the lattice put nearest the top and
         spreads down, so the section fills rather than blinking on. */
      appearAt: now + ((1 - y1) / 2) * RIPPLE_MS,
    });
  }

  /**
   * The sphere's radius, off the orbit box.
   *
   * NOT called here. `data-tms-live` is what gives the orbit a height of its
   * own — until it is on, the box is only as tall as one row of the static
   * grid, and a radius measured then is about a quarter of the right one. So
   * the attribute goes on first and this runs after it; see the bottom of this
   * function.
   */
  let radius = 1;
  const measure = () => {
    const rect = orbit.getBoundingClientRect();
    radius = Math.max(1, Math.min(rect.width, rect.height) * RADIUS_SCALE);
  };

  // --- Drag ----------------------------------------------------------------
  /* Momentum, in radians per frame, decaying towards the idle rotation. Set by
     the drag and by nothing else. */
  let spinVelX = 0;
  let spinVelY = 0;
  let dragging = false;
  let dragged = false;
  let lastX = 0;
  let lastY = 0;

  /* Pointer, not mouse: one path covers mouse and pen. Touch is excluded up
     front — see the component's docstring — so a touchmove never has to choose
     between turning the sphere and scrolling the page. */
  const canDrag = !isTouch();

  if (canDrag) {
    orbit.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch' || openIndex !== -1) return;
        dragging = true;
        dragged = false;
        lastX = event.clientX;
        lastY = event.clientY;
        orbit.setAttribute('data-tms-dragging', '');
        /* Capture so a drag that leaves the orbit box — which it will, the
           moment the sphere is flicked — keeps sending moves here rather than
           to whatever is under the cursor. It can throw when the pointer is
           already gone, and a throw here would leave `dragging` stuck on. */
        try {
          orbit.setPointerCapture(event.pointerId);
        } catch {
          /* Uncaptured is still draggable, just not past the edge. */
        }
      },
      { signal },
    );

    orbit.addEventListener(
      'pointermove',
      (event) => {
        if (!dragging) return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true;
        /* Clamped, because a flick across a trackpad can hand over a delta of
           several hundred pixels in one event and the sphere would snap round
           rather than turn. */
        spinVelY = Math.max(-0.12, Math.min(0.12, -dx * 0.005));
        spinVelX = Math.max(-0.12, Math.min(0.12, dy * 0.005));
        lastX = event.clientX;
        lastY = event.clientY;
      },
      { signal },
    );

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      orbit.removeAttribute('data-tms-dragging');
      try {
        if (orbit.hasPointerCapture(event.pointerId)) orbit.releasePointerCapture(event.pointerId);
      } catch {
        /* Already released with the pointer. */
      }
    };

    orbit.addEventListener('pointerup', endDrag, { signal });
    orbit.addEventListener('pointercancel', endDrag, { signal });
  }

  // --- Hover ---------------------------------------------------------------
  /* An attribute rather than :hover, because a tile under the cursor can be
     carried out from under it by the rotation, and :hover would then stay on
     until the pointer moved again. */
  let hovered = -1;

  const setHover = (index: number) => {
    if (hovered === index) return;
    if (hovered !== -1) items[hovered]?.removeAttribute('data-tms-hover');
    hovered = index;
    if (index !== -1) items[index]?.setAttribute('data-tms-hover', '');
  };

  items.forEach((item, i) => {
    item.addEventListener('pointerenter', () => {
      if (!dragging && openIndex === -1) setHover(i);
    }, { signal });
    item.addEventListener('pointerleave', () => {
      if (hovered === i) setHover(-1);
    }, { signal });
  });

  // --- The read ------------------------------------------------------------
  /* Which founder is up, or -1 for the sphere. Declared before the handlers
     above use it — they only read it when they fire, which is after this. */
  let openIndex = -1;
  let flight: gsap.core.Tween | null = null;
  /* The flown tile's transform while it is under gsap's control rather than
     the loop's. */
  const flown = { px: 0, py: 0, scale: 1 };
  let lastFocus: HTMLElement | null = null;

  const apply = (item: HTMLElement, px: number, py: number, scale: number, opacity: number) => {
    item.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${scale})`;
    item.style.opacity = String(opacity);
  };

  /** Where a tile would sit right now if it were still on the sphere. */
  const restingScale = (index: number) => (points[index].facing ? 1 : 0);

  /* What the loop would be drawing this tile at right now — depth included, or
     the flight takes off from a size the tile is not and jumps on frame one. */
  const currentScale = (index: number) => {
    const p = points[index];
    return p.facing ? p.appear * depthScale(p.px, p.py, radius) : 0;
  };

  /**
   * The flight's destination: the middle of the landing box, expressed as an
   * offset from the orbit's centre, and the scale that fills it.
   *
   * Measured on every open rather than cached. The landing box is a fraction
   * of the viewport and the orbit's centre moves with the page scroll, so a
   * number taken once is wrong the second time it is used.
   */
  const target = () => {
    const orbitRect = orbit.getBoundingClientRect();
    const landRect = land.getBoundingClientRect();
    const size = items[0].offsetWidth || 1;
    return {
      px: landRect.left + landRect.width / 2 - (orbitRect.left + orbitRect.width / 2),
      py: landRect.top + landRect.height / 2 - (orbitRect.top + orbitRect.height / 2),
      scale: Math.min(landRect.width, landRect.height) / size,
    };
  };

  const showPanel = (tile: number) => {
    const source = sourceOf(tile);
    panels.forEach((panel, i) => {
      panel.hidden = i !== source;
    });
    const panel = panels[source];
    if (!panel) return;
    const blocks = [...panel.children];
    if (!blocks.length) return;
    gsap.fromTo(
      blocks,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.07,
        overwrite: true,
        clearProps: 'transform',
      },
    );
  };

  const open = (index: number) => {
    if (openIndex !== -1 || index < 0 || index >= N) return;
    openIndex = index;
    setHover(-1);
    lastFocus = document.activeElement as HTMLElement | null;

    orbit.setAttribute('data-tms-open', '');
    read.hidden = false;
    showPanel(index);

    getLenis()?.stop();
    document.documentElement.setAttribute('data-tms-open', '');

    const item = items[index];
    const p = points[index];
    /* Start from where it actually is, not from where the maths says it
       should be — a tile mid-ripple is not at scale 1 and starting the flight
       from 1 is a visible jump on the first frame. */
    flown.px = p.px;
    flown.py = p.py;
    flown.scale = currentScale(index);
    item.style.zIndex = '63';

    const to = target();
    flight?.kill();
    flight = gsap.to(flown, {
      px: to.px,
      py: to.py,
      scale: to.scale,
      duration: 0.8,
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => apply(item, flown.px, flown.py, flown.scale, 1),
    });

    gsap.to(backdrop, { autoAlpha: 1, duration: 0.45, ease: 'power2.out', overwrite: true });
    gsap.to(read, {
      autoAlpha: 1,
      duration: 0.4,
      ease: 'power2.out',
      delay: 0.18,
      overwrite: true,
      onComplete: () => closeBtn.focus({ preventScroll: true }),
    });
  };

  /** Swap the founder without going back to the sphere. */
  const step = (delta: number) => {
    if (openIndex === -1) return;
    const from = openIndex;
    const next = (openIndex + delta + N) % N;
    if (next === from) return;

    const outgoing = items[from];
    const incoming = items[next];

    openIndex = next;
    outgoing.style.zIndex = '';
    incoming.style.zIndex = '63';

    /* Nothing to unwind on the outgoing tile: the loop owns it again the
       moment it is no longer the open one, and while the read is up the loop
       draws every unopened tile at nothing. Taking it to zero here is only so
       it does not show for the one frame before the loop next runs. */
    flight?.kill();
    outgoing.style.opacity = '0';

    const to = target();
    const p = points[next];
    flown.px = p.px;
    flown.py = p.py;
    flown.scale = currentScale(next);
    apply(incoming, flown.px, flown.py, flown.scale, 1);

    flight = gsap.to(flown, {
      px: to.px,
      py: to.py,
      scale: to.scale,
      duration: 0.7,
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => apply(incoming, flown.px, flown.py, flown.scale, 1),
    });

    const panel = panels[sourceOf(from)];
    if (panel) {
      gsap.to(panel, {
        autoAlpha: 0,
        duration: 0.2,
        overwrite: true,
        onComplete: () => {
          gsap.set(panel, { clearProps: 'opacity,visibility' });
          showPanel(next);
        },
      });
    } else {
      showPanel(next);
    }
  };

  let closing = false;

  const close = () => {
    if (openIndex === -1 || closing) return;
    closing = true;
    const index = openIndex;
    const item = items[index];

    gsap.to(read, { autoAlpha: 0, duration: 0.3, ease: 'power2.in', overwrite: true });
    gsap.to(backdrop, { autoAlpha: 0, duration: 0.5, delay: 0.15, ease: 'power2.in', overwrite: true });

    /* Home is wherever the sphere has turned to by now, and it keeps moving
       while the tile travels — so the target is read on every frame of the
       tween rather than once at the start. Anything else lands the tile at a
       stale position and the sphere jerks to meet it. */
    flight?.kill();
    const from = { px: flown.px, py: flown.py, scale: flown.scale };
    const trip = { t: 0 };
    flight = gsap.to(trip, {
      t: 1,
      duration: 0.8,
      ease: 'power2.inOut',
      overwrite: true,
      onUpdate: () => {
        const p = points[index];
        const t = trip.t;
        apply(
          item,
          from.px + (p.px - from.px) * t,
          from.py + (p.py - from.py) * t,
          from.scale + (currentScale(index) - from.scale) * t,
          1,
        );
      },
      onComplete: () => {
        item.style.zIndex = '';
        openIndex = -1;
        closing = false;
        orbit.removeAttribute('data-tms-open');
        read.hidden = true;
        panels.forEach((panel) => {
          panel.hidden = true;
          gsap.set(panel, { clearProps: 'opacity,visibility' });
        });
        gsap.set([...panels].flatMap((panel) => [...panel.children]), {
          clearProps: 'opacity,visibility,transform',
        });
        document.documentElement.removeAttribute('data-tms-open');
        getLenis()?.start();
        lastFocus?.focus({ preventScroll: true });
        lastFocus = null;
      },
    });
  };

  items.forEach((item, i) => {
    item.addEventListener(
      'click',
      () => {
        // A drag that ended over a tile is a drag, not a press.
        if (dragged) {
          dragged = false;
          return;
        }
        open(i);
      },
      { signal },
    );
  });

  closeBtn.addEventListener('click', close, { signal });
  prevBtn.addEventListener('click', () => step(-1), { signal });
  nextBtn.addEventListener('click', () => step(1), { signal });

  backdrop.addEventListener('click', close, { signal });
  read.addEventListener(
    'click',
    (event) => {
      if (event.target === read) close();
    },
    { signal },
  );

  /* What a <dialog> would have given us for nothing. Escape closes, and the
     arrows walk — the read has no scroll of its own to steal them from. */
  document.addEventListener(
    'keydown',
    (event) => {
      if (openIndex === -1) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    },
    { signal },
  );

  // --- The loop ------------------------------------------------------------
  const tick = () => {
    const t = performance.now();

    /* Momentum bleeds off towards the idle turn rather than towards zero, so
       a released drag settles into the drift instead of stopping dead and
       starting again. */
    if (!dragging) {
      spinVelX *= 0.95;
      spinVelY *= 0.95;
    }

    const rotX = spinVelX + IDLE_X;
    const rotY = spinVelY + IDLE_Y;
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    for (let i = 0; i < N; i += 1) {
      const p = points[i];

      const y1 = p.y * cosX - p.z * sinX;
      const z1 = p.y * sinX + p.z * cosX;
      const x2 = p.x * cosY + z1 * sinY;
      const z2 = -p.x * sinY + z1 * cosY;

      p.x = x2;
      p.y = y1;
      p.z = z2;
      p.px = x2 * radius;
      p.py = y1 * radius;
      p.facing = z2 > 0 ? 1 : 0;

      const progress = (t - p.appearAt) / APPEAR_MS;
      p.appear = progress <= 0 ? 0 : progress >= 1 ? 1 : easeOutBack(progress);

      /* The open tile is gsap's, and every other tile is drawn away while the
         read is up — not hidden, because it has to be visibly leaving. */
      if (i === openIndex) continue;

      const item = items[i];
      const scale =
        restingScale(i) * depthScale(p.px, p.py, radius) * p.appear * (openIndex === -1 ? 1 : 0);
      const opacity = clamp01(z2 * 10) * clamp01(p.appear * 1.15) * (openIndex === -1 ? 1 : 0);
      apply(item, p.px, p.py, scale, opacity);
      /* Depth order. Without it a tile crossing the front of the sphere passes
         behind the ones it should be in front of. */
      item.style.zIndex = String(Math.round(z2 * 100));
    }
  };

  /* In this order, and the order is the whole of it: the attribute switches
     the stylesheet to the absolute layout and gives the orbit its real height,
     `measure` reads that height, and only then is there a frame to draw. Any
     other order sizes the sphere against the static grid's one-row box. */
  orbit.setAttribute('data-tms-live', '');
  measure();
  tick();
  gsap.ticker.add(tick);

  const onResize = () => measure();
  window.addEventListener('resize', onResize, { signal });

  return () => {
    controller.abort();
    gsap.ticker.remove(tick);
    flight?.kill();
    if (openIndex !== -1) {
      document.documentElement.removeAttribute('data-tms-open');
      getLenis()?.start();
    }
    orbit.removeAttribute('data-tms-live');
    orbit.removeAttribute('data-tms-open');
    orbit.removeAttribute('data-tms-dragging');
    items.forEach((item) => {
      item.removeAttribute('data-tms-hover');
      item.style.removeProperty('transform');
      item.style.removeProperty('opacity');
      item.style.removeProperty('z-index');
    });
    restoreAnchor();
  };
}

/**
 * Reduced motion. No sphere and no flight — the tiles stay in the stylesheet's
 * grid and the press cuts straight to the panel, which is content and so is
 * not something to withhold. Escape and the arrows still work, because they
 * are how you get out and how you get around.
 */
function initStatic(deps: {
  items: HTMLElement[];
  panels: HTMLElement[];
  read: HTMLElement;
  backdrop: HTMLElement;
  closeBtn: HTMLButtonElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  signal: AbortSignal;
}): () => void {
  const { items, panels, read, backdrop, closeBtn, prevBtn, nextBtn, signal } = deps;
  const N = items.length;
  let openIndex = -1;
  let lastFocus: HTMLElement | null = null;

  /* Same tile-to-founder mapping as the sphere above, for the same reason. */
  const show = (tile: number) => {
    const source = Number(items[tile]?.dataset.tmsSource ?? tile);
    panels.forEach((panel, i) => {
      panel.hidden = i !== source;
    });
  };

  const open = (index: number) => {
    openIndex = index;
    lastFocus = document.activeElement as HTMLElement | null;
    show(index);
    read.hidden = false;
    gsap.set([backdrop, read], { autoAlpha: 1 });
    getLenis()?.stop();
    document.documentElement.setAttribute('data-tms-open', '');
    closeBtn.focus({ preventScroll: true });
  };

  const close = () => {
    if (openIndex === -1) return;
    openIndex = -1;
    read.hidden = true;
    gsap.set([backdrop, read], { autoAlpha: 0 });
    panels.forEach((panel) => {
      panel.hidden = true;
    });
    document.documentElement.removeAttribute('data-tms-open');
    getLenis()?.start();
    lastFocus?.focus({ preventScroll: true });
    lastFocus = null;
  };

  const step = (delta: number) => {
    if (openIndex === -1) return;
    openIndex = (openIndex + delta + N) % N;
    show(openIndex);
  };

  items.forEach((item, i) => item.addEventListener('click', () => open(i), { signal }));
  closeBtn.addEventListener('click', close, { signal });
  prevBtn.addEventListener('click', () => step(-1), { signal });
  nextBtn.addEventListener('click', () => step(1), { signal });
  backdrop.addEventListener('click', close, { signal });
  read.addEventListener(
    'click',
    (event) => {
      if (event.target === read) close();
    },
    { signal },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (openIndex === -1) return;
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
    },
    { signal },
  );

  return () => {
    if (openIndex !== -1) {
      document.documentElement.removeAttribute('data-tms-open');
      getLenis()?.start();
    }
  };
}
