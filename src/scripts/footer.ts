import { gsap, ScrollTrigger } from './gsap';
import { getLenis } from './scroll';
import { prefersReducedMotion } from './utils/device';

/**
 * The closing screen, which the page does not scroll to.
 *
 * It is fixed to the bottom of the window and sits behind everything; the last
 * section slides off it. So there is no animation here and there is nothing to
 * time — the reveal IS the scroll. What this file does is the two things that
 * cannot be done in a stylesheet.
 *
 * ONE: the spacer's height. The page needs somewhere to scroll once the
 * sections have ended, and that distance is the closing block's own height —
 * which is a screen less one cell of the pixel seam, since the block stops
 * short of the top so the section above keeps a strip of itself showing. The
 * stylesheet works that out on its own; this makes it exact, which matters on a
 * window too short for the block to fit in, where a spacer taken on trust would
 * leave part of the footer permanently above the top of the window.
 *
 * And the seam's colour, which belongs with the measuring for the same reason:
 * it is a fact about the page rather than about any animation. See paintSeam.
 *
 * TWO: telling the nav when the footer is actually visible. The block is
 * `position: fixed`, so its box has been in the window since the first pixel
 * of the page — and the nav's watcher decides by box and painted opacity, not
 * by what is on top of what. Declared on the footer itself, the capsule would
 * turn to glass over the hero. So the declarations sit on a marker that draws
 * nothing and is faded up as the block is uncovered: `painted()` reads that
 * opacity, and the nav learns about the footer exactly when the reader does.
 *
 * The founder-quote animation this replaces is gone entirely — the photograph
 * arriving as a card and opening into the band, the copy written on after it,
 * the wordmark drawing itself in pen strokes. A fixed footer is uncovered
 * rather than played.
 *
 * Returns a cleanup function.
 */
export function initFooter(): () => void {
  const close = document.querySelector<HTMLElement>('[data-close]');
  if (!close) return () => {};

  const spacer = document.querySelector<HTMLElement>('.close__spacer');
  const zone = close.querySelector<HTMLElement>('[data-close-zone]');
  const root = document.documentElement;

  const cleanups: Array<() => void> = [];

  // --- The spacer ----------------------------------------------------------
  /**
   * What colour the pixel seam at the top of the block is painted in.
   *
   * The block stops a cell short of the screen now, so the last strip of the
   * section above it stays visible and the squares fall out of that strip into
   * the footer. Which means they have to be ITS colour, and which section it is
   * is not fixed: chapter 8 ships as three variations and the reader picks one
   * in the browser, the film wall and the orbit grid on white and the scattered
   * one on the page's cream. A seam hard-coded to either is a band of the wrong
   * colour rather than a dissolve, on a third of the readers.
   *
   * So it is read rather than declared — walking back from the spacer past
   * whichever variations have switched themselves off, and taking the first
   * painted ground it finds. Re-read on every refresh, because the variation
   * can be changed without the page reloading.
   */
  const paintSeam = () => {
    let node = spacer?.previousElementSibling as HTMLElement | null;

    while (node) {
      const style = getComputedStyle(node);
      if (style.display !== 'none') {
        /* A section at the foot of a page wrapper can name itself as the strip
           the seam falls out of — the case-study pages sit inside one element
           with a white ground, and their last panel is a different colour. */
        const inner = node.querySelector<HTMLElement>('[data-footer-seam]');
        const ground = (inner ? getComputedStyle(inner) : style).backgroundColor;
        /* Transparent is not an answer — it means this element paints nothing
           and what shows through it is something else's ground. */
        if (ground && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(ground)) {
          close.style.setProperty('--close-seam', ground);
          return;
        }
      }
      node = node.previousElementSibling as HTMLElement | null;
    }

    close.style.removeProperty('--close-seam');
  };

  const measure = () => {
    const h = Math.round(close.getBoundingClientRect().height);
    if (h > 0) root.style.setProperty('--close-h', `${h}px`);
    paintSeam();
  };

  measure();

  /* Three ways to hear about the same change, because no one of them covers
     every case and the cost of missing one is a spacer that no longer matches
     the block it is standing in for.

     The observer is the general answer: the block is a screen tall, so it
     changes when the window does — and on a phone the window changes when the
     address bar slides away, which fires no resize event at all.

     `resize` is the ordinary case, and it is here as well as the observer
     because a ResizeObserver's callback is delivered in the browser's
     rendering steps. That is exactly the right place for it and exactly the
     place I could not exercise: the preview this was built against has its
     rendering loop frozen, so the observer never fired there and the spacer sat
     at the old window's height through every resize. A plain listener runs
     whether anything is being painted or not.

     And ScrollTrigger's own refresh, which is when every other measurement on
     this page is retaken. */
  const observer = new ResizeObserver(() => {
    measure();
    ScrollTrigger.refresh();
  });
  observer.observe(close);
  cleanups.push(() => observer.disconnect());

  window.addEventListener('resize', measure);
  cleanups.push(() => window.removeEventListener('resize', measure));

  ScrollTrigger.addEventListener('refreshInit', measure);
  cleanups.push(() => ScrollTrigger.removeEventListener('refreshInit', measure));

  // --- The nav's reading ---------------------------------------------------
  /* Faded up across the last screen before the block is fully uncovered, so the
     capsule turns as the dark ground becomes what the reader is looking at
     rather than a screen early or a screen late.

     Measured against the spacer, which is the only element on the page whose
     position IS the reveal: the block itself never moves. */
  /* NOT ON A PHONE. The block is in the page there rather than fixed behind
     it (see the note at the foot of Footer.astro), so its box is only under the
     bar when it really is under the bar — and the spacer this would be measured
     against is not displayed. The zone is simply left painted.

     `gsap.matchMedia` rather than one reading of the query, so a tablet turned
     across 768px swaps modes: each branch's tween and inline opacity are
     reverted by gsap when its query stops matching, and the other is built. */
  if (zone && spacer) {
    const mm = gsap.matchMedia();

    mm.add('(max-width: 48rem)', () => {
      gsap.set(zone, { opacity: 1 });

      /* THE SAME ARRIVAL AS THE DESKTOP'S, and the same thing bounces: the
         sheet, not what it uncovers. The block is in the page here rather than
         fixed behind it, so the sheet is simply the section above it and the
         room it springs into is the band the block hides under that section —
         `--close-rise` in Footer.astro.

         The one thing this has to do that the desktop does not is put the
         sheet in front. The block sits under the section above by that band,
         and being later in the document it would otherwise paint over it. */
      const sheetNow = (): HTMLElement | null => {
        let node = close.previousElementSibling as HTMLElement | null;
        while (node) {
          if (getComputedStyle(node).display !== 'none') return node;
          node = node.previousElementSibling as HTMLElement | null;
        }
        return null;
      };

      const lifted: HTMLElement[] = [];
      const front = (el: HTMLElement) => {
        if (lifted.includes(el)) return;
        lifted.push(el);
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.zIndex = '1';
      };

      const cells = gsap.utils.toArray<HTMLElement>(close.querySelectorAll('.close__seam span'));
      let sheet: HTMLElement | null = null;
      let armed = true;
      let snap: gsap.core.Tween | null = null;

      /* The band, less a margin, so a rounding never pulls the sheet off the
         top of the photograph. */
      const overshoot = () => {
        const rise = parseFloat(getComputedStyle(close).getPropertyValue('--close-rise')) || 0;
        return Math.max(24, Math.min(rise * 16 - 8, 96));
      };

      const hideCells = () => {
        if (prefersReducedMotion()) return;
        gsap.set(cells, { autoAlpha: 0 });
      };
      hideCells();

      const bounce = () => {
        sheet = sheetNow();
        if (!sheet) return;
        front(sheet);
        gsap
          .timeline({ defaults: { overwrite: 'auto' } })
          .to(sheet, { y: () => -overshoot(), duration: 0.22, ease: 'power2.out' })
          .to(sheet, { y: 0, duration: 1.45, ease: 'elastic.out(1, 0.28)' })
          .fromTo(
            cells,
            { autoAlpha: 0 },
            {
              autoAlpha: 1,
              duration: 0.18,
              ease: 'none',
              stagger: { amount: 0.5, from: 'random' },
            },
            0.46,
          );
      };

      const DURATION = 0.85;

      const lift = () => {
        const lenis = getLenis();
        const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const proxy = { y: window.scrollY };
        lenis?.stop();

        snap = gsap.to(proxy, {
          y: end,
          duration: DURATION,
          ease: 'power2.inOut',
          onUpdate: () => {
            if (lenis) lenis.scrollTo(proxy.y, { immediate: true, force: true });
            else window.scrollTo(0, proxy.y);
          },
          onComplete: () => {
            lenis?.start();
            snap = null;
          },
        });

        gsap.delayedCall(DURATION * 0.8, bounce);
      };

      /* The block itself is the trigger here — the spacer it is measured
         against on a desktop is not displayed at this width. A fifth of it
         showing is its top reaching four fifths of the way up the window. */
      const snapTrigger = ScrollTrigger.create({
        trigger: close,
        start: 'top bottom',
        end: 'top 80%',
        invalidateOnRefresh: true,
        onLeave: () => {
          if (!armed || snap || prefersReducedMotion()) return;
          armed = false;
          lift();
        },
        onLeaveBack: () => {
          armed = true;
          gsap.killTweensOf(cells);
          hideCells();
        },
      });

      return () => {
        snapTrigger.kill();
        if (snap) {
          snap.kill();
          getLenis()?.start();
        }
        gsap.killTweensOf(bounce);
        gsap.killTweensOf(cells);
        gsap.set(cells, { clearProps: 'opacity,visibility' });
        if (sheet) {
          gsap.killTweensOf(sheet);
          gsap.set(sheet, { clearProps: 'transform' });
        }
        lifted.forEach((el) => {
          el.style.removeProperty('z-index');
          el.style.removeProperty('position');
        });
      };
    });

    mm.add('(min-width: 48.0625rem)', () => {
      /* THE BLOCK IS NOT PAINTED UNTIL ITS SPACER IS ON SCREEN. It is behind the
         page and fully covered until then, so hiding it changes nothing a
         reader can see — except when something above has come up short. A pin
         left at an old window's height is exactly that, and the footer's
         copyright and links showed through the gap under the hero. An
         IntersectionObserver is asked by the browser on the real layout of the
         moment, so there are no stored measurements in it to go stale. */
      const guard = new IntersectionObserver(
        ([entry]) => {
          const below = !entry.isIntersecting && entry.boundingClientRect.top > 0;
          close.style.visibility = below ? 'hidden' : '';
        },
        { rootMargin: '0px 0px 1px 0px' },
      );
      guard.observe(spacer);

      gsap.fromTo(
        zone,
        { opacity: 0 },
        {
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: spacer,
            start: 'top bottom',
            end: 'top 35%',
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );

      /* THE SNAP. Once a fifth of the block is uncovered on the way down, the
         page stops waiting for the wheel and lifts the rest of the way itself,
         and the sheet it lifts bounces as it comes to rest.

         IT IS THE SHEET THAT BOUNCES, NOT WHAT IS UNDER IT. The closing block
         is fixed and the page slides off it, like a blind being drawn or the
         cover pulled across a car boot: the thing that springs is the sheet
         going up, and the photograph, the wordmark and the links it uncovers
         are simply there, still. Copy that bounced into place was the page
         announcing itself twice.

         So the bounce is a short overshoot on the last section — the strip of
         it that stays showing above the block — and back. Its travel is capped
         by how much of that strip there is: further than the strip is deep and
         the page would be pulled off the top of the block, showing the ground
         behind it. Armed again once the reader is back in the section above. */
      /* WHICH ELEMENT THE SHEET IS, asked rather than assumed. The section
         above the spacer is whichever cut of chapter 8 the reader has picked,
         and the other two are still in the page with `display: none` on them —
         so the sibling immediately before the spacer is, two times out of
         three, a section that paints nothing. Bouncing that moved nothing at
         all. Same walk as paintSeam above, and made at the moment it is
         needed, because the pick can change without the page reloading. */
      const sheetNow = (): HTMLElement | null => {
        let node = spacer.previousElementSibling as HTMLElement | null;
        while (node) {
          if (getComputedStyle(node).display !== 'none') return node;
          node = node.previousElementSibling as HTMLElement | null;
        }
        return null;
      };

      let sheet: HTMLElement | null = null;
      let armed = true;
      let snap: gsap.core.Tween | null = null;

      /* How far the sheet may travel: the strip of it above the block, plus the
         run of photograph above that (`--close-lift` in Footer.astro), less a
         margin so a rounding never pulls the sheet off the top of the picture.
         Read at the moment it is used, because both are window-relative. */
      const overshoot = () => {
        const strip = close.getBoundingClientRect().top;
        const lift = parseFloat(getComputedStyle(close).getPropertyValue('--close-lift')) || 0;
        const room = strip + lift * 16 - 8;
        return Math.max(24, Math.min(room, 96));
      };

      /* AND THE SQUARES FALL IN AFTER IT. The seam is a row of cells of the
         section's own colour, cut out of the top of the block — the strip
         above dissolving into the photograph. Drawn with the block, it was
         simply there the moment the sheet cleared it, and it sat in exactly
         the place the eye was watching: the bounce happened behind a pattern
         that had not moved, which is most of why the bounce was hard to see.

         So the cells are held back and dealt in once the sheet has settled —
         the edge lands, and then the strip crumbles into it. Held back only
         while there is a bounce to wait for: with reduced motion, or before
         the page has ever been scrolled this far, they are just there. */
      const cells = gsap.utils.toArray<HTMLElement>(close.querySelectorAll('.close__seam span'));
      const hideCells = () => {
        if (prefersReducedMotion()) return;
        gsap.set(cells, { autoAlpha: 0 });
      };
      hideCells();

      /* Up fast, down slow and wobbling — a blind let go of rather than a panel
         being placed. Nearly a second and a half of settling: at a quarter of
         that the bounce was over before the eye had found it. */
      const bounce = () => {
        sheet = sheetNow();
        if (!sheet) return;
        gsap
          .timeline({ defaults: { overwrite: 'auto' } })
          .to(sheet, { y: () => -overshoot(), duration: 0.22, ease: 'power2.out' })
          .to(sheet, { y: 0, duration: 1.45, ease: 'elastic.out(1, 0.28)' })
          /* Dealt at random rather than swept, which is how every other field
             of squares on this site arrives — and dealt ON THE FIRST BOUNCE,
             not after the last of them. 0.46s in: the sheet is up and back
             down and has just passed its resting line for the first time
             (measured off this ease — rest is crossed at 0.32 and the far
             side of the first swing is reached at 0.44). The squares land as
             the edge hits, and the small wobble that is left runs under them
             rather than being waited out with nothing happening. */
          .fromTo(
            cells,
            { autoAlpha: 0 },
            {
              autoAlpha: 1,
              duration: 0.18,
              ease: 'none',
              stagger: { amount: 0.5, from: 'random' },
            },
            0.46,
          );
      };

      const DURATION = 0.85;

      const lift = () => {
        const lenis = getLenis();
        const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const proxy = { y: window.scrollY };
        lenis?.stop();

        snap = gsap.to(proxy, {
          y: end,
          duration: DURATION,
          /* Gentle at the start so the wheel's own motion runs straight into
             it, and still moving at the end so the bounce has momentum to
             carry on from. */
          ease: 'power2.inOut',
          onUpdate: () => {
            if (lenis) lenis.scrollTo(proxy.y, { immediate: true, force: true });
            else window.scrollTo(0, proxy.y);
          },
          onComplete: () => {
            lenis?.start();
            snap = null;
          },
        });

        gsap.delayedCall(DURATION * 0.8, bounce);
      };

      const snapTrigger = ScrollTrigger.create({
        trigger: spacer,
        /* From the moment the spacer's top enters to the moment a fifth of
           the block is showing. */
        start: 'top bottom',
        end: () => `top+=${Math.round(spacer.offsetHeight * 0.2)} bottom`,
        invalidateOnRefresh: true,
        onLeave: () => {
          if (!armed || snap || prefersReducedMotion()) return;
          armed = false;
          lift();
        },
        onLeaveBack: () => {
          armed = true;
          /* Back in the section above: the seam is covered again, so it is
             taken back for the next arrival rather than left dealt. */
          gsap.killTweensOf(cells);
          hideCells();
        },
      });

      return () => {
        guard.disconnect();
        close.style.visibility = '';
        snapTrigger.kill();
        if (snap) {
          snap.kill();
          getLenis()?.start();
        }
        gsap.killTweensOf(bounce);
        gsap.killTweensOf(cells);
        gsap.set(cells, { clearProps: 'opacity,visibility' });
        if (sheet) {
          gsap.killTweensOf(sheet);
          gsap.set(sheet, { clearProps: 'transform' });
        }
      };
    });

    cleanups.push(() => {
      mm.revert();
      gsap.set(zone, { clearProps: 'opacity' });
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    root.style.removeProperty('--close-h');
    close.style.removeProperty('--close-seam');
  };
}
