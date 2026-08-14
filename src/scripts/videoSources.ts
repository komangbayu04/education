/**
 * Keeps per-breakpoint `<source media>` honest across a resize.
 *
 * A `<video>` with two cuts in it — a landscape file and a portrait one, picked
 * apart by `media` — chooses between them exactly once, when the element first
 * loads its resource. The attribute is not a live query: drag a phone-width
 * window out to desktop and the portrait file keeps playing inside the
 * landscape layout, and the reverse leaves a desktop cut cropped to a phone.
 *
 * `load()` is the only thing that re-runs that selection. This watches the one
 * breakpoint the cuts are made at and calls it on every video that says it has
 * more than one, which is what the `data-video-sources` attribute marks.
 *
 * It lived in hero.ts, for the hero's own film. A second film — the Nerd Apply
 * chapter's — needed the same thing, and a second copy of a subtlety like this
 * is how the two drift apart, so it is one module both of them opt into.
 *
 * Returns a cleanup function.
 */
export function initVideoSources(): () => void {
  const videos = Array.from(
    document.querySelectorAll<HTMLVideoElement>('video[data-video-sources]'),
  );
  if (!videos.length) return () => {};

  /* The same 48rem the sources themselves are cut at. Written once here rather
     than per video: if a cut is ever made at a different width, the query in
     the markup and this one have to move together, and that is easier to see
     when there is one of them. */
  const narrow = window.matchMedia('(max-width: 48rem)');

  const reselect = () => {
    for (const video of videos) {
      video.load();
      /* load() pauses, and autoplay only fires for a first load — so without
         this the film picks up the right file and then sits on its first
         frame. Rejection is fine and expected: a policy that refuses autoplay
         here was already refusing it before the resize. */
      void video.play().catch(() => {});
    }
  };

  narrow.addEventListener('change', reselect);

  return () => narrow.removeEventListener('change', reselect);
}
