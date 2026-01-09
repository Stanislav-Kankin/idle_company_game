import type { Grid } from "../types";

export type WalkerKind = "water" | "food";

export type Walker = {
  id: number;
  kind: WalkerKind;

  x: number;
  y: number;
  prevX: number;
  prevY: number;
  step: number;
  nextMoveAt: number;

  homeHouseX?: number;
  homeHouseY?: number;

  homeMarketX?: number;
  homeMarketY?: number;
};

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
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

function isMarket(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 4;
}

export function listWells(grid: Grid): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) if (isWell(grid, x, y)) out.push({ x, y });
  return out;
}

export function listHouses(grid: Grid): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) if (isHouse(grid, x, y)) out.push({ x, y });
  return out;
}

export function listMarkets(grid: Grid): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) if (isMarket(grid, x, y)) out.push({ x, y });
  return out;
}

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

function hasAdjacentRoad(grid: Grid, x: number, y: number) {
  for (const d of DIRS) if (isRoad(grid, x + d.dx, y + d.dy)) return true;
  return false;
}

function findSpawnRoadNear(grid: Grid, srcX: number, srcY: number): { x: number; y: number } | null {
  for (const d of DIRS) {
    const nx = srcX + d.dx;
    const ny = srcY + d.dy;
    if (isRoad(grid, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function applyServiceFromRoadTile(
  grid: Grid,
  expiry: Float64Array,
  now: number,
  roadX: number,
  roadY: number,
  durationMs: number
) {
  for (const d of DIRS) {
    const hx = roadX + d.dx;
    const hy = roadY + d.dy;
    if (!isHouse(grid, hx, hy)) continue;
    const i = hy * grid.cols + hx;
    expiry[i] = Math.max(expiry[i], now + durationMs);
  }
}

export function stepWalkers(
  grid: Grid,
  walkers: Walker[],
  now: number,
  services: { waterExpiry: Float64Array; foodExpiry: Float64Array },
  opts?: { moveEveryMs?: number; waterDurationMs?: number; foodDurationMs?: number }
): Walker[] {
  const moveEveryMs = opts?.moveEveryMs ?? 450;
  const waterDurationMs = opts?.waterDurationMs ?? 12_000;
  const foodDurationMs = opts?.foodDurationMs ?? 12_000;

  for (const w of walkers) {
    if (now < w.nextMoveAt) continue;

    const neighbors: Array<{ x: number; y: number }> = [];
    for (const d of DIRS) {
      const nx = w.x + d.dx;
      const ny = w.y + d.dy;
      if (!isRoad(grid, nx, ny)) continue;
      if (nx === w.prevX && ny === w.prevY) continue;
      neighbors.push({ x: nx, y: ny });
    }

    if (neighbors.length === 0) {
      for (const d of DIRS) {
        const nx = w.x + d.dx;
        const ny = w.y + d.dy;
        if (isRoad(grid, nx, ny)) neighbors.push({ x: nx, y: ny });
      }
    }

    if (neighbors.length > 0) {
      const pick = (w.step + w.id * 17) % neighbors.length;
      const next = neighbors[pick];

      w.prevX = w.x;
      w.prevY = w.y;
      w.x = next.x;
      w.y = next.y;
      w.step += 1;

      if (w.kind === "water") {
        applyServiceFromRoadTile(grid, services.waterExpiry, now, w.x, w.y, waterDurationMs);
      } else {
        applyServiceFromRoadTile(grid, services.foodExpiry, now, w.x, w.y, foodDurationMs);
      }
    }

    w.nextMoveAt = now + moveEveryMs;
  }

  return walkers;
}

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

    const exists = walkers.some(
      (w) => w.kind === "water" && w.homeHouseX === house.x && w.homeHouseY === house.y
    );
    if (exists) continue;

    const spawn = findSpawnRoadNear(grid, house.x, house.y);
    if (!spawn) continue;

    walkers.push({
      id: nextId++,
      kind: "water",
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

  return walkers.filter((w) => {
    if (w.kind !== "water") return true;
    if (w.homeHouseX === undefined || w.homeHouseY === undefined) return false;
    return eligibleKey.has(`${w.homeHouseX},${w.homeHouseY}`);
  });
}

export function ensureMarketLadiesForMarkets(grid: Grid, walkers: Walker[], now: number): Walker[] {
  const markets = listMarkets(grid);
  let nextId = walkers.reduce((m, w) => Math.max(m, w.id), 0) + 1;

  const marketKey = new Set(markets.map((m) => `${m.x},${m.y}`));

  for (const mkt of markets) {
    if (!hasAdjacentRoad(grid, mkt.x, mkt.y)) continue;

    const exists = walkers.some(
      (w) => w.kind === "food" && w.homeMarketX === mkt.x && w.homeMarketY === mkt.y
    );
    if (exists) continue;

    const spawn = findSpawnRoadNear(grid, mkt.x, mkt.y);
    if (!spawn) continue;

    walkers.push({
      id: nextId++,
      kind: "food",
      x: spawn.x,
      y: spawn.y,
      prevX: spawn.x,
      prevY: spawn.y,
      step: 0,
      nextMoveAt: now + 250,
      homeMarketX: mkt.x,
      homeMarketY: mkt.y,
    });
  }

  return walkers.filter((w) => {
    if (w.kind !== "food") return true;
    if (w.homeMarketX === undefined || w.homeMarketY === undefined) return false;
    return marketKey.has(`${w.homeMarketX},${w.homeMarketY}`);
  });
}
