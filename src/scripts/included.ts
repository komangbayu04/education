/**
 * What both models include — the kinds of work, and the pictures beside them.
 *
 * Each reading of the section is a SCOPE (`[data-inc-scope]`): a list of
 * buttons and a stack of pictures, all of it in the markup. This points a
 * scope's pictures at whichever kind of work is being read in that scope's own
 * list. A pointer over a line, or a keyboard on it, is the whole of the
 * interaction — there is no timer and nothing advances on its own, because the
 * list is something a reader runs their eye down rather than a carousel.
 *
 * Scopes and not one list, because the section has more than one reading
 * (src/config/variations.ts) and all of them are in the page: one list driving
 * every stack of pictures would light up shots in a layout nobody is looking
 * at, and a hidden list could never be pointed at to change the visible one.
 *
 * The pointer leaves and the last one read stays up. Nothing snapping back to
 * a default is the point: the pictures are an illustration of the line under
 * the cursor a moment ago, not a state to be tidied away.
 *
 * `aria-current` says which line is showing, and the pictures are `aria-hidden`
 * in the markup — a reader who is not pointing at anything gets the list,
 * which is the content; the pictures repeat nothing it says.
 *
 * THE ARC. Where a list's lines are `.inc__arc-kind`, each one is also given a
 * `--shift`: three steps in for the line being read, two for its neighbours,
 * one for theirs, none beyond. The stylesheet turns that into an indent, so
 * the list bows out towards the reader's place in it.
 *
 * Returns a cleanup function.
 */

/** How far the arc reaches either side of the line being read. */
const ARC = 3;

export function initIncluded(): () => void {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-inc-scope]')];
  if (!scopes.length) return () => {};

  const controller = new AbortController();
  const { signal } = controller;

  scopes.forEach((scope) => {
    const list = scope.querySelector<HTMLElement>('[data-inc-kinds]');
    const pairs = [...scope.querySelectorAll<HTMLElement>('[data-inc-pair]')];
    if (!list || !pairs.length) return;

    const kinds = [...list.querySelectorAll<HTMLButtonElement>('[data-inc-kind]')];

    const show = (index: number) => {
      kinds.forEach((kind) => {
        const at = Number(kind.dataset.incKind);
        if (at === index) kind.setAttribute('aria-current', 'true');
        else kind.removeAttribute('aria-current');

        if (kind.classList.contains('inc__arc-kind')) {
          kind.style.setProperty('--shift', String(Math.max(0, ARC - Math.abs(at - index))));
        }
      });
      pairs.forEach((pair) => {
        pair.toggleAttribute('data-on', Number(pair.dataset.incPair) === index);
      });
    };

    /* The line the markup marks as current, so the arc is drawn before the
       reader has done anything. */
    const start = kinds.find((kind) => kind.getAttribute('aria-current') === 'true');
    if (start) show(Number(start.dataset.incKind));

    kinds.forEach((kind) => {
      const index = Number(kind.dataset.incKind);
      /* `pointerenter` rather than `mouseenter` so a tap shows it too, and
         `focus` so tabbing through the list moves the pictures with it. */
      kind.addEventListener('pointerenter', () => show(index), { signal });
      kind.addEventListener('focus', () => show(index), { signal });
      kind.addEventListener('click', () => show(index), { signal });
    });
  });

  return () => controller.abort();
}
