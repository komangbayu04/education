/**
 * What both models include — the kinds of work, and the shots beside them.
 *
 * The list is nine buttons and one stack of shot pairs, all of it in the
 * markup; this points the stack at whichever kind of work is being read. A
 * pointer over a line, or a keyboard on it, is the whole of the interaction —
 * there is no timer and nothing advances on its own, because the list is
 * something a reader runs their eye down rather than a carousel.
 *
 * The pointer leaves and the last one read stays up. Nothing snapping back to
 * a default is the point: the shots are an illustration of the line under the
 * cursor a moment ago, not a state to be tidied away.
 *
 * `aria-current` says which line is showing, and the shots are `aria-hidden` in
 * the markup — a reader who is not pointing at anything gets the list, which is
 * the content; the pictures repeat nothing it says.
 *
 * This file used to drag a row of numbered cards that ran off the right-hand
 * edge. The cards are gone (see Included.astro), and so is the drag.
 *
 * Returns a cleanup function.
 */
export function initIncluded(): () => void {
  const list = document.querySelector<HTMLElement>('[data-inc-kinds]');
  const pairs = [...document.querySelectorAll<HTMLElement>('[data-inc-pair]')];
  if (!list || !pairs.length) return () => {};

  const kinds = [...list.querySelectorAll<HTMLButtonElement>('[data-inc-kind]')];
  const controller = new AbortController();
  const { signal } = controller;

  const show = (index: number) => {
    kinds.forEach((kind) => {
      const on = Number(kind.dataset.incKind) === index;
      if (on) kind.setAttribute('aria-current', 'true');
      else kind.removeAttribute('aria-current');
    });
    pairs.forEach((pair) => {
      pair.toggleAttribute('data-on', Number(pair.dataset.incPair) === index);
    });
  };

  kinds.forEach((kind) => {
    const index = Number(kind.dataset.incKind);
    /* `pointerenter` rather than `mouseenter` so a tap shows it too, and
       `focus` so tabbing through the list moves the shots with it. */
    kind.addEventListener('pointerenter', () => show(index), { signal });
    kind.addEventListener('focus', () => show(index), { signal });
    kind.addEventListener('click', () => show(index), { signal });
  });

  return () => controller.abort();
}
