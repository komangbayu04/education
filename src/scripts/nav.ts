import { gsap } from './gsap';
import { prefersReducedMotion } from './utils/device';

/** Nav intro + mobile disclosure. Returns a cleanup function. */
export function initNav(): () => void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return () => {};

  const controller = new AbortController();
  const toggle = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const panel = nav.querySelector<HTMLElement>('[data-nav-mobile]');

  if (toggle && panel) {
    toggle.addEventListener(
      'click',
      () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));

        if (open) {
          gsap.to(panel, {
            height: 0,
            opacity: 0,
            duration: 0.4,
            ease: 'power3.inOut',
            onComplete: () => {
              panel.hidden = true;
              gsap.set(panel, { clearProps: 'all' });
            },
          });
        } else {
          panel.hidden = false;
          gsap.fromTo(
            panel,
            { height: 0, opacity: 0 },
            { height: 'auto', opacity: 1, duration: 0.5, ease: 'power3.out' },
          );
        }
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

  return () => controller.abort();
}
