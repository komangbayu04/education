/**
 * Build-time pixel fields.
 *
 * The case-study pages scatter squares on a cell grid the same way the home
 * page's chapter handovers do. Which cells get a square is a density curve —
 * densest at one edge, thinning to nothing — so it has to be rolled rather
 * than expressed as a repeating gradient.
 *
 * Seeded on purpose: an unseeded Math.random() would reshuffle the squares on
 * every build, so a deploy could silently change the artwork.
 */

/** mulberry32 — small, fast, and stable for a fixed seed. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Cell {
  /** 1-based, ready for grid-column / grid-row. */
  col: number;
  row: number;
}

/**
 * @param seed     any fixed number — change it to reshuffle deliberately
 * @param rows     how many rows the grid has
 * @param density  odds of a square per column, first entry = first column
 */
export function pixelField(seed: number, rows: number, density: number[]): Cell[] {
  const random = rng(seed);
  const cells: Cell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < density.length; col += 1) {
      if (random() < density[col]) cells.push({ col: col + 1, row: row + 1 });
    }
  }

  return cells;
}
