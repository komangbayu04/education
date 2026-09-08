import { gsap, ScrollTrigger } from './gsap';
import { getLenis, scrollToTarget } from './scroll';
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

  /**
   * A menu link that points at a section of the page you are already on.
   *
   * Left to the browser, `/#work` from the home page is a jump — an instant cut
   * to the section with none of the easing every other movement on this site
   * has, and one that Lenis then has to be told about after the fact. Handled
   * here it is the same eased scroll as everything else.
   *
   * Only when the path matches. From a case study the same link is a real
   * navigation, and this stands aside for the router to make it — the wipe
   * covers it, the new page arrives, and main.ts reads the fragment there.
   *
   * The header is fixed over the page, so the target is offset by its height:
   * scrolled flush, a section's first line sits underneath the bar.
   */
  const scrollToSection = (link: HTMLAnchorElement, event: MouseEvent) => {
    // Anything but a plain left click belongs to the browser.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;

    const url = new URL(link.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;

    const target = document.querySelector<HTMLElement>(url.hash);
    if (!target) return;

    event.preventDefault();
    history.pushState(null, '', url.hash);
    scrollToTarget(target);
  };

  /* Only on a change, never on a repeat.
     `close()` releases the lock again from its own onComplete, a fifth of a
     second after the click that started it — and Lenis's `start()` resets its
     animation state, which cancels whatever scroll is in flight. A menu link
     to a section therefore closed the menu, wrote the fragment, and then had
     its scroll killed halfway by the panel finishing its exit. Latching the
     state means the second release is the no-op it was always meant to be. */
  let scrollLocked = false;

  const lockScroll = (locked: boolean) => {
    if (locked === scrollLocked) return;
    scrollLocked = locked;

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

    /* A link inside the panel navigates, and the panel has to be gone by the
       time the next page paints — except for the work rows, which are the one
       case where it must not be. Those open a case study by morphing the frame
       they are standing next to, and the router photographs the outgoing page
       the moment the navigation starts: close the panel here and what it
       photographs is a frame already halfway through fading out. They release
       the panel themselves, without animating it. */
    panel.addEventListener(
      'click',
      (event: MouseEvent) => {
        const link = (event.target as HTMLElement).closest('a');
        if (!link) return;
        if (link.hasAttribute('data-nav-work-link')) return;
        toggle.setAttribute('aria-expanded', 'false');
        /* Released here rather than left to the close animation, so the page is
           free to move at the moment the scroll is asked for rather than a
           fifth of a second later. */
        lockScroll(false);
        close();
        scrollToSection(link, event);
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
      workCards.forEach((card, i) => {
        const active = i === index;
        card.toggleAttribute('data-active', active);
      });
    };

    workLinks.forEach((link, i) => {
      link.addEventListener('pointerenter', () => show(i), { signal });
      // Keyboard users get the same preview — every other hover state in this
      // project has a focus equivalent.
      link.addEventListener('focus', () => show(i), { signal });
    });

    /**
     * Opens a case study.
     *
     * The move itself is not built here — it belongs to the router, with the
     * pixel wipe in src/scripts/pageTransition.ts over the top of it.
     *
     * This used to do it by hand: clone the shot, scale it until it covered the
     * screen, then `window.location.href`. Two things were wrong with that. The
     * thing that grew was a photograph of a phone and the thing that arrived was
     * the case study's own opening, so the two never met — the zoom ended and
     * the page cut. And that assignment is a full document load, which tears
     * down the router and takes the transition with it.
     *
     * So the click does exactly two things: closes the menu, and lets the link
     * be a link. Everything else is the router's, and the wipe over the top of
     * it is src/scripts/pageTransition.ts.
     */
    const openProject = () => {
      /* The panel is left standing, and nothing here is animated.

         The wipe covers the screen before the swap, so the menu is behind a
         full field of squares by the time the page changes — closing it with
         an animation would only be a second thing moving under something
         nobody can see. The state is corrected instead: the toggle is shut and
         the scroll lock released so the next page does not inherit it. The
         panel is left exactly as the reader last saw it, because the next page
         renders its own, closed. */
      animation?.kill();
      toggle?.setAttribute('aria-expanded', 'false');
      lockScroll(false);
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

          /* Not prevented, and that is the change: the router needs the
             navigation to be its own. `show(i)` still runs, so the card that
             morphs is the one the reader is looking at — a keyboard user may
             have tabbed straight here without the pointer ever being over the
             row. */
          show(i);
          openProject();
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
  const stopHere = initSectionLabel(nav);

  return () => {
    stopHere();
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
 * mark. Declared because they cannot be read: the footer's darkness is
 * a photograph under a black overlay, and no computed background colour
 * anywhere in that section says so.
 *
 * Both axes are tested, which is not fussiness — the "Ready to get going?"
 * block is dark at every width but sits in the right-hand column on a desktop,
 * where the mark passes to the left of it and must stay dark. Stacked, the
 * same block is full width and does pass under the mark.
 *
 * Returns a cleanup function.
 */
/**
 * How much of an element is actually on screen, as the product of its own
 * opacity and every ancestor's.
 *
 * Being in the right place is not enough, and the scene is why. Its chapters
 * are stacked layers, all of them `inset: 0` and all of them full size from the
 * first frame — the one you see is the one that has been faded up. So a
 * chapter's box is behind the bar from scroll 0, a screen and a half before it
 * is visible, and testing geometry alone turned the mark white over the white
 * hero. Reading the layer's opacity is what separates "is in that part of the
 * page" from "is what is on screen there".
 *
 * Shared by both watchers below: which section is behind the bar and how dark
 * it is are the same question asked twice.
 */
function painted(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  let alpha = 1;

  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    alpha *= Number(style.opacity);
    if (alpha === 0) return 0;
    node = node.parentElement;
  }

  return alpha;
}

function initLogoTone(nav: HTMLElement): () => void {
  const logo = nav.querySelector<HTMLElement>('.nav__logo');
  const zones = gsap.utils.toArray<HTMLElement>('[data-nav-over="dark"]');
  if (!logo || !zones.length) return () => {};

  const root = document.documentElement;

  /* The mark is fixed to the viewport, so its box only changes when the layout
     does — that one is worth holding. */
  let mark = { top: 0, bottom: 0, left: 0, right: 0 };

  const measure = () => {
    const r = logo.getBoundingClientRect();
    mark = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };

  /* The zones are read live, every update, and that is not the wasteful half of
     a trade — it is the only version that is correct.

     They were cached in page space on refresh, with the scroll position
     subtracted per frame to get back to the viewport. That arithmetic assumes a
     zone moves up the screen as the page scrolls, which is true of an ordinary
     section and false of the first one this had to handle: the Nerd Apply
     chapter lives inside the pinned scene, so while the pin holds it, it stays
     at the top of the viewport while `scrollY` runs on without it. Cached at
     scroll 0 and read at 1200, the sum put a zone that was filling the screen
     1200px above it, and the mark stayed ink on a near-black chapter.

     Three rects per update, on elements the browser has already laid out. */

  /* How much of a zone is actually on screen, as the product of its own opacity
     and every ancestor's.

     Being in the right place is not enough, and the scene is why. Its chapters
     are stacked layers, all of them `inset: 0` and all of them full size from
     the first frame — the one you see is the one that has been faded up. So the
     dark chapter's box is behind the mark from scroll 0, a screen and a half
     before it is visible, and testing geometry alone turned the mark white over
     the white hero. Reading the layer's opacity is what separates "is in that
     part of the page" from "is what is on screen there". */
  /* Half, because the chapters cross-fade: at 0.5 the dark one is as much of
     what you see as the light one it is replacing, which is the moment the mark
     has to have changed by. Paired with the 0.28s ease on its colour, so the
     two crossings meet in the middle rather than the mark snapping late. */
  const COVERED = 0.5;

  const apply = () => {
    const over = zones.some((zone) => {
      const b = zone.getBoundingClientRect();
      const overlaps =
        b.top < mark.bottom && b.bottom > mark.top && b.left < mark.right && b.right > mark.left;

      return overlaps && painted(zone) >= COVERED;
    });
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

/**
 * Where you are, in the middle of the capsule.
 *
 * Every section that wants a name declares one with `data-nav-section`, the
 * same way the dark ones declare themselves with `data-nav-over`. Declared and
 * not derived, because a heading is not a label: "Hear what our clients said
 * about their experiences with us!" is the founders section's title and cannot
 * be what the bar reads, and the scene's chapters have no heading in the DOM
 * order the bar would have to guess from.
 *
 * WHICH ONE WINS. The bar is a line across the viewport, so the section the
 * reader is in is the one painted under that line — not the one nearest the
 * top of the page, and not the first one to intersect the viewport. Two things
 * make that reading correct where a simpler one is not:
 *
 *   the pin   the scene's chapters are stacked layers that all occupy the same
 *             box for the whole of the pin, so geometry alone says three
 *             sections are under the bar at once from the first frame. Their
 *             opacity is what separates them, which is what `painted` reads.
 *
 *   the join  sections overlap deliberately at their edges — Two ways in is
 *             pulled up over the held last frame of Our work, and the two are
 *             both under the bar for the length of that dissolve. The most
 *             painted one is the one being looked at, so the label changes
 *             when the dissolve passes half rather than at either end of it.
 *
 * A section that is behind the bar but faded to nothing does not win, and when
 * nothing wins at all the label is left as it was rather than blanked — the
 * gaps are the moments between two sections, and a bar that empties in them
 * flickers once per join.
 *
 * The text is swapped under a fade the stylesheet owns: this sets one
 * attribute, waits for it, writes, and clears. Returns a cleanup function.
 */
function initSectionLabel(nav: HTMLElement): () => void {
  const here = nav.querySelector<HTMLElement>('[data-nav-here]');
  const label = nav.querySelector<HTMLElement>('[data-nav-here-label]');
  const sections = gsap.utils.toArray<HTMLElement>('[data-nav-section]');
  if (!here || !label || !sections.length) return () => {};

  const bar = nav.querySelector<HTMLElement>('.nav__bar') ?? nav;

  /* The bar is fixed, so its box only moves when the layout does. */
  let line = { top: 0, bottom: 0 };
  const measure = () => {
    const r = bar.getBoundingClientRect();
    line = { top: r.top, bottom: r.bottom };
  };

  /* Below this a section is a leftover rather than the thing on screen. Half,
     like the tone watcher's own threshold and for the same reason: at 0.5 a
     crossfading section is as much of what you see as the one it is replacing,
     which is the moment the name has to have changed by. */
  const COVERED = 0.5;

  let current = label.textContent?.trim() ?? '';
  let timer = 0;

  const write = (next: string) => {
    if (next === current) return;
    current = next;

    /* Out, write, in. The wait is the stylesheet's transition; matching it
       here rather than reading it back keeps the two in one place to change,
       and being a few ms out only means the text is written a frame into a
       fade that is already at zero. */
    window.clearTimeout(timer);
    here.setAttribute('data-nav-here-out', '');
    timer = window.setTimeout(() => {
      label.textContent = next;
      here.removeAttribute('data-nav-here-out');
    }, 280);
  };

  const apply = () => {
    let best: HTMLElement | null = null;
    let bestAlpha = COVERED;

    for (const section of sections) {
      const b = section.getBoundingClientRect();
      // Crossing the bar's own line, not merely on screen somewhere.
      if (b.top >= line.bottom || b.bottom <= line.top) continue;

      const alpha = painted(section);
      /* `>=` rather than `>`, so that among equally painted sections — which
         is every ordinary pair, both fully opaque, overlapping only at a
         join — the later one in the document wins. That is the one arriving,
         and arriving is the direction the reader is going. */
      if (alpha >= bestAlpha) {
        best = section;
        bestAlpha = alpha;
      }
    }

    // Nothing under the bar: keep the last name rather than blanking.
    if (best?.dataset.navSection) write(best.dataset.navSection);
  };

  measure();
  apply();

  /* Same ticker as everything else here — Lenis owns the scroll position, and
     a raw scroll listener would be reading it a frame behind the page. */
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
    window.clearTimeout(timer);
    watcher.kill();
    here.removeAttribute('data-nav-here-out');
  };
}
