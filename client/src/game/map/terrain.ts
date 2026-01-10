export const TERRAIN = {
  Plain: 0,
  Forest: 1,
  Water: 2,
  Mountain: 3,
  FishSpot: 4,
} as const;

export type TerrainValue = (typeof TERRAIN)[keyof typeof TERRAIN];

/**
 * True if the cell blocks construction (Iteration B).
 * Forest is NOT blocked (can be built on for now).
 */
export function isTerrainBlockedForBuilding(v: number): boolean {
  return v === TERRAIN.Water || v === TERRAIN.Mountain || v === TERRAIN.FishSpot;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function idx(x: number, y: number, cols: number): number {
  return y * cols + x;
}

function inBounds(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

/**
 * Deterministic PRNG (mulberry32).
 * Returns float in [0,1).
 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function paintRandomWalkBlob(
  out: Uint8Array,
  cols: number,
  rows: number,
  startX: number,
  startY: number,
  steps: number,
  value: number,
  rng: () => number,
  canOverwrite: (prev: number) => boolean
) {
  let x = startX;
  let y = startY;

  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  for (let s = 0; s < steps; s++) {
    const i = idx(x, y, cols);
    const prev = out[i] ?? 0;
    if (canOverwrite(prev)) out[i] = value;

    // occasional soft spread to one neighbor
    if (rng() < 0.25) {
      const d2 = randInt(rng, 0, 3);
      const nx = x + dx[d2];
      const ny = y + dy[d2];
      if (inBounds(nx, ny, cols, rows)) {
        const j = idx(nx, ny, cols);
        const prev2 = out[j] ?? 0;
        if (canOverwrite(prev2)) out[j] = value;
      }
    }

    const d = randInt(rng, 0, 3);
    x = clampInt(x + dx[d], 1, cols - 2);
    y = clampInt(y + dy[d], 1, rows - 2);
  }
}

function hasShoreNeighbor(terrain: Uint8Array, cols: number, rows: number, x: number, y: number): boolean {
  // fish spot should be on water near shore (adjacent to NON-water)
  const i = idx(x, y, cols);
  const v = terrain[i] ?? TERRAIN.Plain;
  if (v !== TERRAIN.Water) return false;

  const neigh = [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];

  for (const [nx, ny] of neigh) {
    if (!inBounds(nx, ny, cols, rows)) continue;
    const nv = terrain[idx(nx, ny, cols)] ?? TERRAIN.Plain;
    if (nv !== TERRAIN.Water && nv !== TERRAIN.FishSpot) return true;
  }
  return false;
}

/**
 * Generate terrain deterministically by seed.
 * Encoded in Uint8Array:
 * 0 plain, 1 forest, 2 water, 3 mountain, 4 fish spot.
 */
export function generateTerrain(cols: number, rows: number, seed: number): Uint8Array {
  const t = new Uint8Array(cols * rows); // Plain
  const rng = mulberry32(seed);

  const size = cols * rows;

  // Tuned for ~80x60. Works for other sizes too.
  const waterBlobs = Math.max(2, Math.floor(size / 2500));
  const forestBlobs = Math.max(3, Math.floor(size / 1800));
  const mountainBlobs = Math.max(2, Math.floor(size / 3500));

  const waterSteps = Math.floor((size * 0.06) / waterBlobs);
  const forestSteps = Math.floor((size * 0.1) / forestBlobs);
  const mountainSteps = Math.floor((size * 0.04) / mountainBlobs);

  // Water first (blocks building)
  for (let k = 0; k < waterBlobs; k++) {
    const sx = randInt(rng, 5, cols - 6);
    const sy = randInt(rng, 5, rows - 6);
    paintRandomWalkBlob(t, cols, rows, sx, sy, waterSteps, TERRAIN.Water, rng, (prev) => prev === TERRAIN.Plain);
  }

  // Forest (allowed to build on for now)
  for (let k = 0; k < forestBlobs; k++) {
    const sx = randInt(rng, 3, cols - 4);
    const sy = randInt(rng, 3, rows - 4);
    paintRandomWalkBlob(t, cols, rows, sx, sy, forestSteps, TERRAIN.Forest, rng, (prev) => prev === TERRAIN.Plain);
  }

  // Mountains (block building) — can overwrite forest/plain, but not water.
  for (let k = 0; k < mountainBlobs; k++) {
    const sx = randInt(rng, 6, cols - 7);
    const sy = randInt(rng, 6, rows - 7);
    paintRandomWalkBlob(
      t,
      cols,
      rows,
      sx,
      sy,
      mountainSteps,
      TERRAIN.Mountain,
      rng,
      (prev) => prev === TERRAIN.Plain || prev === TERRAIN.Forest
    );
  }

  // Fish spots: subset of water near shore
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (!hasShoreNeighbor(t, cols, rows, x, y)) continue;

      if (rng() < 0.1) {
        t[idx(x, y, cols)] = TERRAIN.FishSpot;
      }
    }
  }

  return t;
}
