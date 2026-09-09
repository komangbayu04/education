import { isTouch } from './utils/device';

/**
 * What both models include — the card row, dragged.
 *
 * The row is an `overflow-x: auto` scroller, so a phone and a trackpad can
 * already move it and a keyboard can already tab through it. What it did not
 * have is the one gesture a row of cards on a desktop invites: taking hold of
 * one and pulling.
 *
 * Pointer events rather than mouse events, and bound only where the native
 * gesture is missing — a touch screen drags this already, and adding a second
 * handler on top of that fights the browser's own momentum. `isTouch()` is the
 * same test the rest of the site uses to decide whether a cursor exists.
 *
 * Three details that are the whole of it working properly:
 *
 *   the capture   the pointer is captured on the row, so a drag that leaves the
 *                 row — off the top of the window, or past the last card —
 *                 keeps being followed and still ends cleanly.
 *
 *   the snap      `scroll-snap-type` is switched off for the length of the
 *                 drag. Left on, every frame of a drag is a scroll the browser
 *                 then tries to settle to the nearest card, which reads as the
 *                 row fighting the hand holding it.
 *
 *   the threshold nothing is claimed until the pointer has moved a few pixels.
 *                 Below that it is a click, and a card that swallowed clicks
 *                 would be a card nothing inside it could ever be pressed.
 *
 * No momentum, deliberately. A flick that carries on after the hand has
 * stopped is a phone gesture; on a cursor it reads as the row overshooting.
 *
 * Returns a cleanup function.
 */
export function initIncluded(): () => void {
  const row = document.querySelector<HTMLElement>('[data-inc-drag]');
  if (!row || isTouch()) return () => {};

  /** How far the pointer travels before this is a drag and not a click. */
  const THRESHOLD = 4;

  let pointer = -1;
  let startX = 0;
  let startLeft = 0;
  let dragging = false;

  const down = (e: PointerEvent) => {
    /* Primary button only, and never on something that is already interactive:
       a link inside a card belongs to the link. */
    if (e.button !== 0 || pointer !== -1) return;
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea')) return;

    pointer = e.pointerId;
    startX = e.clientX;
    startLeft = row.scrollLeft;
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;

    const dx = e.clientX - startX;

    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD) return;
      dragging = true;
      /* Guarded: `setPointerCapture` throws NotFoundError if the pointer is no
         longer active by the time this runs — which a mouse released outside
         the window will be, and which stops the rest of this handler from ever
         reaching the line that actually moves the row. The capture is a nicety;
         the drag is not. */
      try {
        row.setPointerCapture(pointer);
      } catch {
        /* No capture. The drag still works while the pointer is over the row. */
      }
      row.dataset.incDragging = '';
      row.style.scrollSnapType = 'none';
    }

    /* Negative, because dragging the cards left means scrolling right — the
       row follows the hand rather than the scrollbar. */
    row.scrollLeft = startLeft - dx;
    e.preventDefault();
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;

    if (dragging) {
      try {
        row.releasePointerCapture(pointer);
      } catch {
        /* Never captured, or already gone. */
      }
      delete row.dataset.incDragging;
      row.style.removeProperty('scroll-snap-type');
      /* The click that would otherwise land at the end of the drag, swallowed
         once. Without it, letting go over a card counts as pressing it. */
      row.addEventListener('click', (c) => c.stopPropagation(), { capture: true, once: true });
    }

    pointer = -1;
    dragging = false;
  };

  row.addEventListener('pointerdown', down);
  row.addEventListener('pointermove', move);
  row.addEventListener('pointerup', up);
  row.addEventListener('pointercancel', up);
  /* Text selection is what a horizontal drag across words does by default, and
     it turns a pull into a highlight. */
  row.addEventListener('dragstart', (e) => e.preventDefault());

  return () => {
    row.removeEventListener('pointerdown', down);
    row.removeEventListener('pointermove', move);
    row.removeEventListener('pointerup', up);
    row.removeEventListener('pointercancel', up);
    delete row.dataset.incDragging;
    row.style.removeProperty('scroll-snap-type');
  };
}
