import { gsap } from './gsap';
import { getLenis } from './scroll';
import { prefersReducedMotion } from './utils/device';

/** Columns across the mobile panel. Rows follow from the viewport's height. */
const COLS = 10;

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

  return () => {
    controller.abort();
    animation?.kill();
    lockScroll(false);
  };
}
