import { gsap, ScrollTrigger } from './gsap';
import { getLenis } from './scroll';
import { prefersReducedMotion } from './utils/device';

/** Columns across the panel's ground. Rows follow from the viewport's height. */
const COLS = 10;

/**
 * Nav intro, panel disclosure, and the panel's work preview.
 *
 * The panel is a full-screen dark sheet, and it arrives as a field of blocks
 * falling from the top: every cell drops on its own beat — its row sets the
 * beat, a random jitter breaks the line — which is the same pixel language the
 * chapters hand over with on the home page.
 *
 * The field is built on open rather than at load: the row count depends on the
 * viewport, and a panel nobody has opened has no business holding a hundred
 * elements. Once every cell has landed the panel takes the colour itself, so
 * no seam between two cells can show for as long as it stays open.
 *
 * The bar itself no longer does anything on scroll. It used to morph into a
 * floating pill, driven from here with GSAP Flip; that is gone.
 *
 * Returns a cleanup function.
 */
export function initNav(): () => void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const toggle = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const panel = nav.querySelector<HTMLElement>('[data-nav-mobile]');
  const blocks = panel?.querySelector<HTMLElement>('[data-nav-blocks]');
  const marked = panel ? gsap.utils.toArray<HTMLElement>('[data-nav-mobile-item]', panel) : [];

  /* What actually has a box, resolved at the moment it is needed.

     An element with `display: contents` generates no box of its own — its
     children are laid out by its grandparent instead — so animating it moves
     nothing. On a phone both the work preview and the card inside it are
     `display: contents` (see the mobile block in Nav.astro, where that is what
     lets the project names sit between the shot and the words), which left the
     shot and the blurb out of the open and close animations entirely: they
     appeared and vanished in one frame while everything around them moved.

     Resolved per open rather than once at init, because which elements are
     `contents` depends on the viewport, and the viewport can change between
     one opening and the next. */
  const paintable = (el: HTMLElement): HTMLElement[] =>
    getComputedStyle(el).display === 'contents'
      ? gsap.utils.toArray<HTMLElement>(':scope > *', el).flatMap(paintable)
      : [el];

  const animatable = () => marked.flatMap(paintable);

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
      gsap.set(animatable(), { opacity: 1, y: 0 });
      return;
    }

    buildField();
    gsap.set(animatable(), { opacity: 0, y: 18 });

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
      .to(animatable(), { opacity: 1, y: 0, duration: 0.34, ease: 'power3.out', stagger: 0.04 }, '-=0.22');
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
      .to(animatable(), { opacity: 0, y: -8, duration: 0.15, ease: 'power2.in' }, 0)
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
      { signal },
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
      { signal },
    );

    // Escape closes it, as it does every other dismissible layer.
    document.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (toggle.getAttribute('aria-expanded') !== 'true') return;
        toggle.setAttribute('aria-expanded', 'false');
        close();
      },
      { signal },
    );
  }

  /* --- The panel's work preview -------------------------------------------
     Pointing at a row shows that project beside it. Decoration on top of a
     working control, never the control itself: the rows are real links, and
     with this switched off the first project simply stays shown.

     Keyed by index rather than by slug — the markup pairs a row and a card by
     the same number, so there is nothing to keep in sync but the count. */
  const workLinks = gsap.utils.toArray<HTMLElement>('[data-nav-work-link]', nav);
  const workCards = gsap.utils.toArray<HTMLElement>('[data-nav-work-card]', nav);

  if (workLinks.length && workCards.length) {
    const show = (index: number) => {
      workLinks.forEach((link, i) => link.toggleAttribute('data-active', i === index));
      workCards.forEach((card, i) => card.toggleAttribute('data-active', i === index));
    };

    workLinks.forEach((link, i) => {
      link.addEventListener('pointerenter', () => show(i), { signal });
      // Keyboard users get the same preview — every other hover state in this
      // project has a focus equivalent.
      link.addEventListener('focus', () => show(i), { signal });
    });

    /**
     * Opens a case study by growing its preview into the page.
     *
     * The panel's shot is the same artwork the case study opens on, so rather
     * than the menu blinking out and a new page blinking in, the shot is lifted
     * out of the panel and scaled up until it is the screen. The navigation
     * happens under it, at the point where it covers everything, so what the
     * reader sees is one continuous move.
     *
     * A clone, not the shot itself: the real one is inside a panel that is
     * about to be scrolled, hidden and reset, and lifting it out of that
     * layout would collapse the card around it mid-animation.
     *
     * Transform only — a scale about the centre plus the translation that puts
     * that centre on the viewport's. Animating left/top/width/height would lay
     * the page out again on every frame of the one animation that has to be
     * smooth.
     */
    const growInto = (href: string, card: HTMLElement) => {
      const shot = card.querySelector<HTMLElement>('.nav__work-shot');
      if (!shot) return false;

      const from = shot.getBoundingClientRect();
      if (!from.width || !from.height) return false;

      const clone = shot.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {
        position: 'fixed',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        margin: '0',
        zIndex: '200',
        overflow: 'hidden',
        pointerEvents: 'none',
        willChange: 'transform',
      });
      // The shot fills its box by `cover` in the panel; the clone has to keep
      // doing that as the box grows, or the artwork letterboxes on the way up.
      const img = clone.querySelector<HTMLElement>('img');
      if (img) Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
      document.body.appendChild(clone);

      // `cover` again, but for the growth: whichever axis needs the most.
      const scale = Math.max(window.innerWidth / from.width, window.innerHeight / from.height);
      const dx = window.innerWidth / 2 - (from.left + from.width / 2);
      const dy = window.innerHeight / 2 - (from.top + from.height / 2);

      gsap
        .timeline({ onComplete: () => { window.location.href = href; } })
        // The panel goes first and faster, so the shot is travelling against
        // the page rather than against the menu it came out of.
        .to(panel, { autoAlpha: 0, duration: 0.32, ease: 'power2.out' }, 0)
        .to(
          clone,
          { x: dx, y: dy, scale, duration: 0.68, ease: 'power3.inOut', transformOrigin: '50% 50%' },
          0,
        );

      return true;
    };

    workLinks.forEach((link, i) => {
      link.addEventListener(
        'click',
        (event) => {
          const href = link.getAttribute('href');
          // Anything that is not a plain left click belongs to the browser:
          // open-in-new-tab, download, and the rest have to keep working.
          if (
            !href ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            link.getAttribute('target') === '_blank'
          ) {
            return;
          }
          // Under reduced motion the navigation is the whole event.
          if (prefersReducedMotion()) return;

          const card = workCards[i];
          if (!card) return;

          event.preventDefault();
          // The pointer may never have been over this row — a keyboard user
          // tabbing straight to it, say — so make sure the card it is about to
          // grow is the one on screen.
          show(i);
          if (!growInto(href, card)) window.location.href = href;
        },
        { signal },
      );
    });
  }

  if (!prefersReducedMotion()) {
    const inner = nav.querySelector('.nav__inner');

    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .to(inner, { opacity: 1, duration: 0.8 }, 0)
      .from(inner, { y: -14, duration: 0.9 }, 0);
  }

  const stopTone = initLogoTone(nav);

  return () => {
    stopTone();
    controller.abort();
    animation?.kill();
    lockScroll(false);
  };
}

/**
 * The wordmark takes its colour from what is behind it.
 *
 * `mix-blend-mode: difference` is the usual way to do this and it does not
 * work here: the bar is a fixed, z-indexed stacking context of its own, so the
 * only backdrop the mark can blend with is the bar's own — transparent — and
 * it came out white on white. Isolating it would mean giving up the stacking
 * that keeps the bar above the panel.
 *
 * So the dark grounds are declared rather than detected, with
 * `data-nav-over="dark"`, and this watches whether one of them is behind the
 * mark. Declared because they cannot be read: the founder quote's darkness is
 * a photograph under a scrim, and no computed background colour anywhere in
 * that section says so.
 *
 * Both axes are tested, which is not fussiness — the "Ready to get going?"
 * block is dark at every width but sits in the right-hand column on a desktop,
 * where the mark passes to the left of it and must stay dark. Stacked, the
 * same block is full width and does pass under the mark.
 *
 * Returns a cleanup function.
 */
function initLogoTone(nav: HTMLElement): () => void {
  const logo = nav.querySelector<HTMLElement>('.nav__logo');
  const zones = gsap.utils.toArray<HTMLElement>('[data-nav-over="dark"]');
  if (!logo || !zones.length) return () => {};

  const root = document.documentElement;

  /* Measured on refresh and held, so a scroll costs no layout reads: the
     mark's box is fixed to the viewport and the zones' are in page space, so
     the only thing that changes between frames is how far the page has
     scrolled. */
  let mark = { top: 0, bottom: 0, left: 0, right: 0 };
  let boxes: Array<{ top: number; bottom: number; left: number; right: number }> = [];

  const measure = () => {
    const r = logo.getBoundingClientRect();
    mark = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    boxes = zones.map((zone) => {
      const b = zone.getBoundingClientRect();
      return { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY, left: b.left, right: b.right };
    });
  };

  const apply = () => {
    const y = window.scrollY;
    const over = boxes.some(
      (b) =>
        b.top - y < mark.bottom &&
        b.bottom - y > mark.top &&
        b.left < mark.right &&
        b.right > mark.left,
    );
    root.toggleAttribute('data-nav-over-dark', over);
  };

  measure();
  apply();

  /* Driven by ScrollTrigger rather than a scroll listener so it runs on the
     same ticker as everything else here — Lenis owns the scroll position, and
     a raw listener would be reading it a frame behind the rest of the page. */
  const watcher = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: apply,
    onRefresh: () => {
      measure();
      apply();
    },
  });

  return () => {
    watcher.kill();
    root.removeAttribute('data-nav-over-dark');
  };
}
