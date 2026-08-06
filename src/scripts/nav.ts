import { Flip, gsap } from './gsap';
import { getLenis } from './scroll';
import { prefersReducedMotion } from './utils/device';

/** Columns across the mobile panel. Rows follow from the viewport's height. */
const COLS = 10;

/* Where the header becomes the pill, and where it goes back. Two thresholds
   rather than one: with a single line, a scroll that rests exactly on it would
   flip the header back and forth on every pixel of drift.

   They are far apart on purpose. The change takes a full second, and a gap
   this wide means an ordinary scroll is well clear of the other threshold long
   before it finishes — you have to deliberately scroll back to reverse it. */
const PILL_ENTER = 220;
const PILL_EXIT = 90;

/* Properties Flip has to carry across itself. Position and size it works out
   by measuring; this is paint, and CSS would otherwise snap it at the moment
   the attribute changes. The ground is not in here — it is its own layer with
   its own timing, below. */
const FLIP_PROPS = 'color';

/** How long the bar takes to change shape. */
const FLIP_DURATION = 0.6;

/* Where in that change the glass appears. The panel's shape is the bar's
   shape, and for most of the change that is a 36rem pill's radius stretched
   across the full width of the header — a shape this design does not have
   anywhere, which reads as something drawn wrong rather than something on its
   way. Held at 0 until the bar is nearly the size it is going to be, so what
   fades up is already the right shape. */
const GLASS_IN_AT = 0.7;

/**
 * Nav intro + mobile disclosure.
 *
 * The mobile panel is a full-screen black sheet, and it arrives as a field of
 * blocks falling from the top: every cell drops on its own beat — its row sets
 * the beat, a random jitter breaks the line — which is the same pixel language
 * the chapters hand over with on the home page.
 *
 * The field is built on open rather than at load: the row count depends on the
 * viewport, and a panel nobody has opened has no business holding a hundred
 * elements. Once every cell has landed the panel takes the colour itself, so
 * no seam between two cells can show for as long as it stays open.
 *
 * Returns a cleanup function.
 */
export function initNav(): () => void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return () => {};

  const controller = new AbortController();
  const toggle = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const panel = nav.querySelector<HTMLElement>('[data-nav-mobile]');
  const blocks = panel?.querySelector<HTMLElement>('[data-nav-blocks]');
  const items = panel ? gsap.utils.toArray<HTMLElement>('[data-nav-mobile-item]', panel) : [];

  let field: HTMLElement[] = [];
  let animation: gsap.core.Timeline | null = null;

  const buildField = () => {
    if (!blocks) return;
    const cell = window.innerWidth / COLS;
    const rows = Math.max(1, Math.ceil(window.innerHeight / cell));

    blocks.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    blocks.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    blocks.replaceChildren();

    field = Array.from({ length: rows * COLS }, () => document.createElement('span'));
    blocks.append(...field);
    // Row index drives the fall; the jitter is what keeps it from reading as a
    // blind coming down.
    field.forEach((span, i) => {
      span.dataset.row = String(Math.floor(i / COLS));
    });
  };

  const lockScroll = (locked: boolean) => {
    const lenis = getLenis();
    if (locked) {
      document.documentElement.setAttribute('data-nav-open', '');
      lenis?.stop();
    } else {
      document.documentElement.removeAttribute('data-nav-open');
      lenis?.start();
    }
  };

  const open = () => {
    if (!panel) return;
    animation?.kill();
    panel.hidden = false;
    panel.removeAttribute('data-filled');
    lockScroll(true);

    if (prefersReducedMotion()) {
      panel.setAttribute('data-filled', '');
      gsap.set(items, { opacity: 1, y: 0 });
      return;
    }

    buildField();
    gsap.set(items, { opacity: 0, y: 18 });

    animation = gsap
      .timeline()
      /* Roughly 0.6s end to end: the row beat and the jitter both come down,
         because the field is a way in, not the thing being looked at. */
      .to(field, {
        scaleY: 1,
        duration: 0.26,
        ease: 'power2.out',
        stagger: (i, el) => Number((el as HTMLElement).dataset.row) * 0.016 + Math.random() * 0.07,
      })
      // Only now: with every cell landed, the panel's own colour can take over
      // and the cells stop mattering.
      .add(() => panel.setAttribute('data-filled', ''))
      .to(items, { opacity: 1, y: 0, duration: 0.34, ease: 'power3.out', stagger: 0.04 }, '-=0.22');
  };

  const close = () => {
    if (!panel) return;
    animation?.kill();

    const done = () => {
      panel.hidden = true;
      panel.removeAttribute('data-filled');
      blocks?.replaceChildren();
      field = [];
      lockScroll(false);
    };

    if (prefersReducedMotion() || !field.length) {
      done();
      return;
    }

    panel.removeAttribute('data-filled');
    animation = gsap
      .timeline({ onComplete: done })
      .to(items, { opacity: 0, y: -8, duration: 0.15, ease: 'power2.in' }, 0)
      .to(
        field,
        {
          scaleY: 0,
          duration: 0.22,
          ease: 'power2.in',
          stagger: (i, el) =>
            Number((el as HTMLElement).dataset.row) * 0.009 + Math.random() * 0.05,
        },
        0.06,
      );
  };

  if (toggle && panel) {
    toggle.addEventListener(
      'click',
      () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isOpen));
        if (isOpen) close();
        else open();
      },
      { signal: controller.signal },
    );

    // A link inside the panel navigates; the panel has to be gone by the time
    // the next page paints.
    panel.addEventListener(
      'click',
      (event: MouseEvent) => {
        if (!(event.target as HTMLElement).closest('a')) return;
        toggle.setAttribute('aria-expanded', 'false');
        close();
      },
      { signal: controller.signal },
    );
  }

  if (!prefersReducedMotion()) {
    const inner = nav.querySelector('.nav__inner');
    const rule = nav.querySelector('.nav__rule');

    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .to(inner, { opacity: 1, duration: 0.8 }, 0)
      .from(inner, { y: -14, duration: 0.9 }, 0)
      .to(rule, { scaleX: 1, duration: 1.2 }, 0.1);
  }

  /* --- Top ⇄ pill ---------------------------------------------------------
     The header is one component in both states: same wordmark, same toggle,
     same markup. All that changes is `data-nav-state`, which hands the layout
     to a different set of CSS rules — and Flip measures every element's box on
     both sides of that change and tweens between them, so the wordmark slides
     from the left edge to the centre and the bar draws itself in around it.

     Nothing is cloned and no second header is faded in over the first. That
     also means the mobile panel's open/close state, the toggle's aria wiring
     and any focus sitting inside the header all survive the change untouched.

     Two elements do come and go — the link row leaves, "Get in touch" arrives —
     so they get the onEnter/onLeave fades. Everything else is continuous. */
  const flipTargets = gsap.utils.toArray<HTMLElement>('[data-nav-flip]', nav);
  const bar = nav.querySelector<HTMLElement>('[data-nav-bar]');
  if (bar) flipTargets.unshift(bar);

  /* The pill's two ends. Deliberately NOT Flip targets: measured through the
     change they would be carried along by the bar, arriving already in place
     and sliding as the shape around them was still forming — two motions on
     top of each other, which is what read as wrong. They are hidden for the
     whole morph and walk in from their own edges afterwards, so the shape
     settles first and only then is it furnished. */
  const menu = nav.querySelector<HTMLElement>('[data-nav-menu]');
  const contact = nav.querySelector<HTMLElement>('[data-nav-contact]');
  const ends = [menu, contact].filter(Boolean) as HTMLElement[];
  const glass = nav.querySelector<HTMLElement>('[data-nav-glass]');

  /** Which edge each one comes from: the menu from the left, contact the right. */
  const ENTRY_X = 22;

  /* The change in flight, if there is one. Reversing direction mid-way has to
     stop it: two Flips animating the same elements leave the second one
     measuring boxes the first is still moving, and the bar jumps to wherever
     that lands. Killing it first means the new one starts from wherever
     things actually are. */
  let flip: gsap.core.Timeline | null = null;

  const setNavState = (next: 'top' | 'pill', animate = true) => {
    if (nav.dataset.navState === next) return;

    if (!animate || prefersReducedMotion() || !flipTargets.length) {
      nav.dataset.navState = next;
      gsap.set(ends, { clearProps: 'transform,opacity,visibility' });
      if (glass) gsap.set(glass, { autoAlpha: next === 'pill' ? 1 : 0 });
      return;
    }

    flip?.kill();
    gsap.killTweensOf(ends);
    if (glass) gsap.killTweensOf(glass);

    const state = Flip.getState(flipTargets, { props: FLIP_PROPS });
    nav.dataset.navState = next;

    // Off the moment the change starts, in both directions. Whatever is not
    // part of the new shape has no business being dragged into it.
    gsap.set(ends, { autoAlpha: 0 });

    flip = Flip.from(state, {
      /* Eased in as well as out: `expo.out` leaves at full speed from the
         first frame, which is what made this feel snatched however long it
         ran. `power2.inOut` starts from rest, so the bar gathers pace and
         settles instead of bolting. */
      duration: FLIP_DURATION,
      ease: 'power2.inOut',
      props: FLIP_PROPS,
      // The sides are flex parents whose own boxes move as well, so their
      // contents have to be flipped in the same pass rather than dragged along.
      nested: true,
      /* Load-bearing. The bar is centred by `margin-inline: auto` (.u-container),
         and Flip animates the change by setting an explicit width — so for
         every frame of the tween the auto margins re-centred a box Flip was
         also translating, and the two fought. Measured mid-flip, the left edge
         was at -33px on its way to +188: it set off in the wrong direction
         entirely, which is why the glass looked like it arrived from the left
         while the right stood still. Taking the targets out of flow for the
         duration leaves Flip the only thing positioning them, and both edges
         travel inward together. */
      absolute: true,
      // Held back until the bar is most of the way there — arriving early,
      // the new copy reads as a second thing happening at the same time.
      onEnter: (els) =>
        gsap.fromTo(
          els,
          { opacity: 0 },
          { opacity: 1, duration: 0.28, delay: 0.3, ease: 'power2.out' },
        ),
      onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.18, ease: 'power2.in' }),

      /* Only now. The bar has stopped moving and is the shape it is going to
         be, so these two arrive into something finished rather than into
         something still forming. Each comes from the edge it sits against —
         the menu from the left, the address from the right — which reads as
         them entering the bar rather than fading up inside it. */
      onComplete: () => {
        if (nav.dataset.navState !== 'pill') {
          /* Back at the top state. The address is display:none there, so only
             the toggle has anywhere to return to — and it fades rather than
             snapping back, which on a phone is the burger reappearing out of
             nothing the instant the bar lands. */
          gsap.set(ends, { clearProps: 'transform,opacity,visibility' });
          if (menu) gsap.fromTo(menu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 });
          return;
        }

        ends.forEach((el, i) => {
          gsap.fromTo(
            el,
            { autoAlpha: 0, x: el === contact ? ENTRY_X : -ENTRY_X },
            {
              autoAlpha: 1,
              x: 0,
              duration: 0.38,
              ease: 'power3.out',
              // Barely apart — enough that the two ends do not read as one
              // switch being thrown.
              delay: i * 0.05,
            },
          );
        });
      },
    });

    /* The ground, on the same timeline so it cannot drift out of step with the
       shape it belongs to. Going back to the top state it leaves at once — a
       glass panel stretching itself back out to full width is the same wrong
       shape, just in reverse. */
    if (glass && flip) {
      if (next === 'pill') {
        flip.fromTo(
          glass,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: FLIP_DURATION * (1 - GLASS_IN_AT), ease: 'power2.out' },
          FLIP_DURATION * GLASS_IN_AT,
        );
      } else {
        flip.to(glass, { autoAlpha: 0, duration: FLIP_DURATION * 0.22, ease: 'power2.in' }, 0);
      }
    }
  };

  /* Lenis scrolls the window, so this stays true whether the smooth wrapper is
     running or the user is on a device where it is not. */
  const onScroll = (animate = true) => {
    const y = window.scrollY;
    if (y > PILL_ENTER) setNavState('pill', animate);
    else if (y < PILL_EXIT) setNavState('top', animate);
  };

  window.addEventListener('scroll', () => onScroll(), {
    passive: true,
    signal: controller.signal,
  });

  /* A reload partway down the page opens in the state that belongs there —
     and does not animate into it, which would be a change nobody asked for by
     scrolling. */
  onScroll(false);

  return () => {
    controller.abort();
    animation?.kill();
    flip?.kill();
    gsap.killTweensOf(ends);
    if (glass) gsap.killTweensOf(glass);
    lockScroll(false);
  };
}
