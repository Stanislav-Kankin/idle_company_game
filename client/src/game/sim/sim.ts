import type { Grid } from "../types";

export type Walker = {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  step: number;
  nextMoveAt: number; // ms in performance.now() timebase

  // Backward-compat / different attach modes (we keep both fields to avoid breaking imports/usages)
  homeWellX?: number;
  homeWellY?: number;
  homeHouseX?: number;
  homeHouseY?: number;
};

const DIRS = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: 0, dy: 1 }, // S
  { dx: -1, dy: 0 }, // W
];

function inBounds(grid: Grid, x: number, y: number) {
  return x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;
}

function cellAt(grid: Grid, x: number, y: number) {
  if (!inBounds(grid, x, y)) return 0;
  return grid.cells[y * grid.cols + x];
}

function isRoad(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 1;
}

function isHouse(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 2;
}

function isWell(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 3;
}

export function listWells(grid: Grid): Array<{ x: number; y: number }> {
  const wells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (isWell(grid, x, y)) wells.push({ x, y });
    }
  }
  return wells;
}

export function listHouses(grid: Grid): Array<{ x: number; y: number }> {
  const houses: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (isHouse(grid, x, y)) houses.push({ x, y });
    }
  }
  return houses;
}

/**
 * Deterministic "water potential" from wells (radius-based).
 * Metric: Manhattan distance (diamond): |dx| + |dy| <= radius.
 */
export function computeWellWaterPotential(grid: Grid, radius: number): Uint8Array {
  const out = new Uint8Array(grid.cols * grid.rows);
  if (radius <= 0) return out;

  const wells = listWells(grid);
  for (const well of wells) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const x = well.x + dx;
        const y = well.y + dy;
        if (!inBounds(grid, x, y)) continue;
        out[y * grid.cols + x] = 1;
      }
    }
  }
  return out;
}

function findSpawnRoadNearWell(
  grid: Grid,
  wellX: number,
  wellY: number
): { x: number; y: number } | null {
  for (const d of DIRS) {
    const nx = wellX + d.dx;
    const ny = wellY + d.dy;
    if (isRoad(grid, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function findSpawnRoadNearHouse(
  grid: Grid,
  houseX: number,
  houseY: number
): { x: number; y: number } | null {
  for (const d of DIRS) {
    const nx = houseX + d.dx;
    const ny = houseY + d.dy;
    if (isRoad(grid, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function hasAdjacentRoad(grid: Grid, x: number, y: number) {
  for (const d of DIRS) {
    if (isRoad(grid, x + d.dx, y + d.dy)) return true;
  }
  return false;
}

export function applyWaterFromRoadTile(
  grid: Grid,
  waterExpiry: Float64Array,
  now: number,
  roadX: number,
  roadY: number,
  waterDurationMs: number
) {
  // Houses adjacent (4-neighborhood) get water
  for (const d of DIRS) {
    const hx = roadX + d.dx;
    const hy = roadY + d.dy;
    if (!isHouse(grid, hx, hy)) continue;
    const i = hy * grid.cols + hx;
    waterExpiry[i] = Math.max(waterExpiry[i], now + waterDurationMs);
  }
}

export function stepWalkers(
  grid: Grid,
  walkers: Walker[],
  now: number,
  waterExpiry: Float64Array,
  opts?: {
    moveEveryMs?: number;
    waterDurationMs?: number;
  }
): Walker[] {
  const moveEveryMs = opts?.moveEveryMs ?? 450;
  const waterDurationMs = opts?.waterDurationMs ?? 12_000;

  for (const w of walkers) {
    if (now < w.nextMoveAt) continue;

    // choose next road neighbor
    const neighbors: Array<{ x: number; y: number }> = [];
    for (const d of DIRS) {
      const nx = w.x + d.dx;
      const ny = w.y + d.dy;
      if (!isRoad(grid, nx, ny)) continue;
      // avoid immediately going back if we have other choices
      if (nx === w.prevX && ny === w.prevY) continue;
      neighbors.push({ x: nx, y: ny });
    }

    // if dead-end (only back), allow backtracking
    if (neighbors.length === 0) {
      for (const d of DIRS) {
        const nx = w.x + d.dx;
        const ny = w.y + d.dy;
        if (isRoad(grid, nx, ny)) neighbors.push({ x: nx, y: ny });
      }
    }

    if (neighbors.length > 0) {
      // deterministic pick (no Math.random)
      const pick = (w.step + w.id * 17) % neighbors.length;
      const next = neighbors[pick];

      w.prevX = w.x;
      w.prevY = w.y;
      w.x = next.x;
      w.y = next.y;
      w.step += 1;

      applyWaterFromRoadTile(grid, waterExpiry, now, w.x, w.y, waterDurationMs);
    }

    w.nextMoveAt = now + moveEveryMs;
  }

  return walkers;
}

/**
 * Legacy (kept to avoid breaking older code): one walker per WELL.
 * NOTE: Current design direction is "walkers are attached to houses"; use ensureWaterCarriersForHouses.
 */
export function ensureWalkersForWells(grid: Grid, walkers: Walker[], now: number): Walker[] {
  const wells = listWells(grid);
  let nextId = walkers.reduce((m, w) => Math.max(m, w.id), 0) + 1;

  // One walker per well (legacy)
  for (const well of wells) {
    const exists = walkers.some((w) => w.homeWellX === well.x && w.homeWellY === well.y);
    if (exists) continue;

    const spawn = findSpawnRoadNearWell(grid, well.x, well.y);
    if (!spawn) continue;

    walkers.push({
      id: nextId++,
      x: spawn.x,
      y: spawn.y,
      prevX: spawn.x,
      prevY: spawn.y,
      step: 0,
      nextMoveAt: now + 250,
      homeWellX: well.x,
      homeWellY: well.y,
    });
  }

  // Remove walkers whose well was deleted
  const wellKey = new Set(wells.map((w) => `${w.x},${w.y}`));
  return walkers.filter(
    (w) =>
      w.homeWellX !== undefined &&
      w.homeWellY !== undefined &&
      wellKey.has(`${w.homeWellX},${w.homeWellY}`)
  );
}

/**
 * Caesar-like: walkers exist for HOUSES, not wells.
 * A house is eligible if:
 *  - it is a house tile
 *  - it has an adjacent road tile (4-neighborhood)
 *  - it has water potential (from wells radius layer)
 *
 * One water-carrier per eligible house (MVP).
 */
export function ensureWaterCarriersForHouses(
  grid: Grid,
  waterPotential: Uint8Array,
  walkers: Walker[],
  now: number
): Walker[] {
  const houses = listHouses(grid);
  let nextId = walkers.reduce((m, w) => Math.max(m, w.id), 0) + 1;

  const eligibleKey = new Set<string>();

  for (const house of houses) {
    const i = house.y * grid.cols + house.x;
    const eligible = waterPotential[i] === 1 && hasAdjacentRoad(grid, house.x, house.y);
    if (!eligible) continue;

    const key = `${house.x},${house.y}`;
    eligibleKey.add(key);

    const exists = walkers.some((w) => w.homeHouseX === house.x && w.homeHouseY === house.y);
    if (exists) continue;

    const spawn = findSpawnRoadNearHouse(grid, house.x, house.y);
    if (!spawn) continue;

    walkers.push({
      id: nextId++,
      x: spawn.x,
      y: spawn.y,
      prevX: spawn.x,
      prevY: spawn.y,
      step: 0,
      nextMoveAt: now + 250,
      homeHouseX: house.x,
      homeHouseY: house.y,
    });
  }

  // Remove walkers if the house is gone or no longer eligible
  return walkers.filter(
    (w) =>
      w.homeHouseX !== undefined &&
      w.homeHouseY !== undefined &&
      eligibleKey.has(`${w.homeHouseX},${w.homeHouseY}`)
  );
}
