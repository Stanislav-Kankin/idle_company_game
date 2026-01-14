import type { Camera } from "./camera";
import type { Grid } from "../types";
import { WALKER_MOVE_EVERY_MS_DEFAULT, type Walker } from "../sim/sim";
import type { SpriteEntry, SpriteFrame, SpriteId, SpriteSet } from "../sprites/types";
import { TERRAIN } from "../map/terrain";

export type WorldConfig = {
  tile: number;
  cols: number;
  rows: number;
};

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

function isWarehouse(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 5;
}

function isLumbermill(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 6;
}

function isClayQuarry(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 7;
}

function isPottery(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 8;
}

function isFurnitureFactory(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 9;
}

function isFarmChicken(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 10;
}

function isFarmPig(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 11;
}

function isFarmFish(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 12;
}

function isFarmCow(grid: Grid, x: number, y: number) {
  return cellAt(grid, x, y) === 13;
}

function getSpriteFrame(sp: SpriteEntry, now: number): SpriteFrame {
  if (!sp.frameMs || sp.frames.length <= 1) return sp.frames[0]!;
  const idx = Math.floor(now / sp.frameMs) % sp.frames.length;
  return sp.frames[idx]!;
}

function drawSpriteAnchored(ctx: CanvasRenderingContext2D, sp: SpriteEntry, ax: number, ay: number, now: number) {
  const fr = getSpriteFrame(sp, now);
  ctx.drawImage(fr.img, ax - sp.pivotX, ay - sp.pivotY);
}

function drawSpriteAtTileBottomCenter(
  ctx: CanvasRenderingContext2D,
  sp: SpriteEntry,
  x: number,
  y: number,
  tile: number,
  now: number
) {
  const ax = x * tile + tile / 2;
  const ay = y * tile + tile;
  drawSpriteAnchored(ctx, sp, ax, ay, now);
}

function getHouseSpriteId(level: number) {
  if (level >= 3) return "house_l3" as const;
  if (level === 2) return "house_l2" as const;
  return "house_l1" as const;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2(x: number, y: number): number {
  // Fast deterministic hash -> [0,1)
  let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

function terrainAt(terrain: Uint8Array, cols: number, rows: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return TERRAIN.Plain;
  return terrain[y * cols + x] ?? TERRAIN.Plain;
}

function isWaterLike(tv: number): boolean {
  return tv === TERRAIN.Water || tv === TERRAIN.FishSpot;
}

function drawTerrainTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  tv: number,
  terrain: Uint8Array,
  cols: number,
  rows: number,
  now: number,
  sprites: SpriteSet | null
) {
  const px = x * tile;
  const py = y * tile;

  // Sprite-first terrain (optional). Falls back to procedural tiles if sprite missing.
  const terrainSpriteId: SpriteId | null =
    tv === TERRAIN.Water ? "terrain_water" :
    tv === TERRAIN.FishSpot ? "terrain_fish" :
    tv === TERRAIN.Forest ? "terrain_forest" :
    tv === TERRAIN.Mountain ? "terrain_mountain" : null;
  const tsp = terrainSpriteId ? sprites?.[terrainSpriteId] : undefined;
  if (tsp) {
    const fr = getSpriteFrame(tsp, now);
    // terrain sprites are tile-sized (32x32). draw scaled to current tile size.
    ctx.drawImage(fr.img as any, px, py, tile, tile);
    return;
  }

  const r = hash2(x, y);
  const n = terrainAt(terrain, cols, rows, x, y - 1);
  const e = terrainAt(terrain, cols, rows, x + 1, y);
  const s = terrainAt(terrain, cols, rows, x, y + 1);
  const w = terrainAt(terrain, cols, rows, x - 1, y);

  const shoreN = isWaterLike(tv) && !isWaterLike(n);
  const shoreE = isWaterLike(tv) && !isWaterLike(e);
  const shoreS = isWaterLike(tv) && !isWaterLike(s);
  const shoreW = isWaterLike(tv) && !isWaterLike(w);

  const nearWaterN = !isWaterLike(tv) && isWaterLike(n);
  const nearWaterE = !isWaterLike(tv) && isWaterLike(e);
  const nearWaterS = !isWaterLike(tv) && isWaterLike(s);
  const nearWaterW = !isWaterLike(tv) && isWaterLike(w);

  const edge = Math.max(3, Math.floor(tile * 0.14));

  // Water / FishSpot
  if (isWaterLike(tv)) {
    ctx.fillStyle = `rgba(14, 116, 144, ${0.26 + 0.10 * r})`;
    ctx.fillRect(px, py, tile, tile);

    // shoreline sand (inside water tile)
    if (shoreN) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.10)";
      ctx.fillRect(px, py, tile, edge);
    }
    if (shoreS) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.10)";
      ctx.fillRect(px, py + tile - edge, tile, edge);
    }
    if (shoreW) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.10)";
      ctx.fillRect(px, py, edge, tile);
    }
    if (shoreE) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.10)";
      ctx.fillRect(px + tile - edge, py, edge, tile);
    }

    // subtle depth edge
    ctx.fillStyle = "rgba(3, 105, 161, 0.14)";
    ctx.fillRect(px, py + tile - 3, tile, 3);

    // waves (cheap + deterministic)
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
    ctx.lineWidth = 1;
    const phase = r * 6.0;
    for (let k = 0; k < 2; k++) {
      const y0 = py + tile * (0.28 + k * 0.33) + (r - 0.5) * 2;
      ctx.beginPath();
      for (let t = 0; t <= tile; t += 6) {
        const yy = y0 + Math.sin((t / tile) * Math.PI * 2 + phase + k) * 1.4;
        if (t === 0) ctx.moveTo(px + t, yy);
        else ctx.lineTo(px + t, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    if (tv === TERRAIN.FishSpot) {
      // ripples + sparkle
      ctx.save();
      ctx.strokeStyle = "rgba(253, 224, 71, 0.55)";
      ctx.lineWidth = 1;
      const cx = px + tile * (0.60 + (r - 0.5) * 0.15);
      const cy = py + tile * (0.45 + (hash2(x + 9, y + 7) - 0.5) * 0.15);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 3, cy + 2, 2.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
      ctx.fillRect(px + tile * 0.72, py + tile * 0.22, 3, 3);
      ctx.restore();
    }
    return;
  }

  // Forest
  if (tv === TERRAIN.Forest) {
    ctx.fillStyle = `rgba(22, 163, 74, ${0.09 + 0.06 * r})`;
    ctx.fillRect(px, py, tile, tile);

    // clumps (deterministic per tile)
    const trees = 4 + Math.floor(hash2(x + 13, y + 17) * 3);
    for (let k = 0; k < trees; k++) {
      const rr = hash2(x * 7 + k * 31, y * 11 + k * 19);
      const ox = px + 6 + rr * (tile - 12);
      const oy = py + 6 + hash2(x * 5 + k * 23, y * 3 + k * 29) * (tile - 14);
      const rad = 3 + Math.floor(hash2(x + 101 + k, y + 203 + k) * 3);

      // canopy
      ctx.fillStyle = "rgba(34, 197, 94, 0.22)";
      ctx.beginPath();
      ctx.arc(ox, oy, rad + 1, 0, Math.PI * 2);
      ctx.fill();

      // shadow blob
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fillRect(ox - 2, oy + rad, 4, 2);
    }

    // wet edge near water (helps shore readability)
    if (nearWaterN) {
      ctx.fillStyle = "rgba(2, 132, 199, 0.06)";
      ctx.fillRect(px, py, tile, edge);
    }
    if (nearWaterS) {
      ctx.fillStyle = "rgba(2, 132, 199, 0.06)";
      ctx.fillRect(px, py + tile - edge, tile, edge);
    }
    if (nearWaterW) {
      ctx.fillStyle = "rgba(2, 132, 199, 0.06)";
      ctx.fillRect(px, py, edge, tile);
    }
    if (nearWaterE) {
      ctx.fillStyle = "rgba(2, 132, 199, 0.06)";
      ctx.fillRect(px + tile - edge, py, edge, tile);
    }
    return;
  }

  // Mountain
  if (tv === TERRAIN.Mountain) {
    ctx.fillStyle = `rgba(148, 163, 184, ${0.10 + 0.06 * r})`;
    ctx.fillRect(px, py, tile, tile);

    // main peak
    ctx.fillStyle = "rgba(148, 163, 184, 0.22)";
    ctx.beginPath();
    ctx.moveTo(px + 5, py + tile - 5);
    ctx.lineTo(px + tile * (0.52 + (r - 0.5) * 0.08), py + 8);
    ctx.lineTo(px + tile - 5, py + tile - 5);
    ctx.closePath();
    ctx.fill();

    // ridge shading
    ctx.strokeStyle = "rgba(30, 41, 59, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + tile - 9);
    ctx.lineTo(px + tile * 0.45, py + tile * 0.38);
    ctx.lineTo(px + tile - 8, py + tile - 9);
    ctx.stroke();

    // wet edge near water
    if (nearWaterN || nearWaterE || nearWaterS || nearWaterW) {
      ctx.fillStyle = "rgba(2, 132, 199, 0.05)";
      if (nearWaterN) ctx.fillRect(px, py, tile, edge);
      if (nearWaterS) ctx.fillRect(px, py + tile - edge, tile, edge);
      if (nearWaterW) ctx.fillRect(px, py, edge, tile);
      if (nearWaterE) ctx.fillRect(px + tile - edge, py, edge, tile);
    }
    return;
  }

  // Plain: subtle grass noise + wet edge near water
  if (tv === TERRAIN.Plain) {
    // micro noise
    if (r < 0.35) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.04)";
      ctx.fillRect(px + 4 + Math.floor(r * 7), py + 6 + Math.floor(hash2(x + 2, y + 3) * 9), 2, 2);
    }
    if (nearWaterN || nearWaterE || nearWaterS || nearWaterW) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.05)";
      if (nearWaterN) ctx.fillRect(px, py, tile, edge);
      if (nearWaterS) ctx.fillRect(px, py + tile - edge, tile, edge);
      if (nearWaterW) ctx.fillRect(px, py, edge, tile);
      if (nearWaterE) ctx.fillRect(px + tile - edge, py, edge, tile);
    }
  }
}

function getRoadMask(grid: Grid, x: number, y: number): number {
  // mask bits: N=1, E=2, S=4, W=8
  let m = 0;
  if (isRoad(grid, x, y - 1)) m |= 1;
  if (isRoad(grid, x + 1, y)) m |= 2;
  if (isRoad(grid, x, y + 1)) m |= 4;
  if (isRoad(grid, x - 1, y)) m |= 8;
  return m & 15;
}

function drawRoad(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number, grid: Grid) {
  const px = x * tile;
  const py = y * tile;

  const n = isRoad(grid, x, y - 1);
  const e = isRoad(grid, x + 1, y);
  const s = isRoad(grid, x, y + 1);
  const w = isRoad(grid, x - 1, y);

  // IMPORTANT: no per-tile "shadow block".
  // We draw the connected road shape twice (shadow + top), so the strip looks continuous.
  const thickness = Math.max(10, Math.floor(tile * 0.46));
  const half = Math.floor((tile - thickness) / 2);

  const shadowDx = 1;
  const shadowDy = 2;

  const drawShape = (dx: number, dy: number, fill: string) => {
    ctx.fillStyle = fill;

    // center
    ctx.fillRect(px + half + dx, py + half + dy, thickness, thickness);

    // connectors (overlap between neighboring tiles => continuous)
    if (n) ctx.fillRect(px + half + dx, py + dy, thickness, half + 1);
    if (s) ctx.fillRect(px + half + dx, py + half + thickness - 1 + dy, thickness, half + 1);
    if (w) ctx.fillRect(px + dx, py + half + dy, half + 1, thickness);
    if (e) ctx.fillRect(px + half + thickness - 1 + dx, py + half + dy, half + 1, thickness);
  };

  // shadow under the road shape
  drawShape(shadowDx, shadowDy, "rgba(0, 0, 0, 0.22)");

  // top surface
  drawShape(0, 0, "rgba(148, 163, 184, 0.92)");

  // subtle edge/shade for pseudo-2D depth (kept minimal to avoid grid-like seams)
  ctx.fillStyle = "rgba(30, 41, 59, 0.14)";
  ctx.fillRect(px + half, py + half + thickness - 2, thickness, 2);
  ctx.fillRect(px + half + thickness - 2, py + half, 2, thickness);
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  level: number,
  hasWaterPotential: boolean,
  recentlyWatered: boolean,
  recentlyFed: boolean
) {
  const px = x * tile;
  const py = y * tile;

  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(px + 5, py + 10, tile - 10, tile - 12);

  // pseudo-2D building: front wall + side wall + roof top
  const front =
    level <= 1 ? "rgba(59, 130, 246, 0.90)" : level === 2 ? "rgba(99, 102, 241, 0.90)" : "rgba(168, 85, 247, 0.90)";
  const side =
    level <= 1 ? "rgba(37, 99, 235, 0.92)" : level === 2 ? "rgba(79, 70, 229, 0.92)" : "rgba(147, 51, 234, 0.92)";
  const roof =
    level <= 1 ? "rgba(30, 64, 175, 0.92)" : level === 2 ? "rgba(67, 56, 202, 0.92)" : "rgba(107, 33, 168, 0.92)";

  // front wall
  ctx.fillStyle = front;
  ctx.fillRect(px + 6, py + 12, tile - 14, tile - 18);

  // side wall
  ctx.fillStyle = side;
  ctx.fillRect(px + tile - 12, py + 10, 6, tile - 16);

  // roof (simple trapezoid)
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(px + 6, py + 12);
  ctx.lineTo(px + tile - 12, py + 10);
  ctx.lineTo(px + tile - 6, py + 13);
  ctx.lineTo(px + 12, py + 15);
  ctx.closePath();
  ctx.fill();

  // windows
  ctx.fillStyle = "rgba(255, 255, 255, 0.70)";
  const ww = Math.max(4, Math.floor(tile * 0.14));
  ctx.fillRect(px + 10, py + tile - 16, ww, ww);
  ctx.fillRect(px + 10 + ww + 4, py + tile - 16, ww, ww);

  if (hasWaterPotential) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.16)";
    ctx.fillRect(px + 3, py + 7, tile - 6, tile - 10);
  }

  if (recentlyWatered) {
    ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3.5, py + 7.5, tile - 7, tile - 11);
  }

  if (recentlyFed) {
    ctx.strokeStyle = "rgba(34, 197, 94, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5.5, py + 9.5, tile - 11, tile - 15);
  }
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  // base
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(px + 6, py + 12, tile - 12, tile - 16);

  ctx.fillStyle = "rgba(148, 163, 184, 0.72)";
  ctx.fillRect(px + 7, py + 12, tile - 14, tile - 18);

  const cx = px + tile / 2;
  const cy = py + tile / 2 + 2;
  const r = Math.max(6, Math.floor(tile * 0.2));

  ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(30, 41, 59, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMarket(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(px + 5, py + 10, tile - 10, tile - 12);

  // body
  ctx.fillStyle = "rgba(251, 191, 36, 0.92)";
  ctx.fillRect(px + 6, py + 12, tile - 14, tile - 18);

  // roof stripe
  ctx.fillStyle = "rgba(239, 68, 68, 0.90)";
  ctx.fillRect(px + 6, py + 10, tile - 14, 6);

  // side shade
  ctx.fillStyle = "rgba(30, 41, 59, 0.20)";
  ctx.fillRect(px + tile - 12, py + 12, 6, tile - 18);

  ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 6.5, py + 10.5, tile - 13, tile - 17);
}

function drawWarehouse(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  // building base
  ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
  ctx.fillRect(px + 6, py + 14, tile - 12, tile - 12);

  // roof
  ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 14);
  ctx.lineTo(px + tile / 2, py + 6);
  ctx.lineTo(px + tile - 4, py + 14);
  ctx.closePath();
  ctx.fill();

  // door
  ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
  ctx.fillRect(px + tile / 2 - 4, py + tile - 12, 8, 10);
}

function drawLumbermill(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
  ctx.fillRect(px + 6, py + 16, tile - 12, tile - 14);

  // roof
  ctx.fillStyle = "rgba(16, 185, 129, 0.95)";
  ctx.beginPath();
  ctx.moveTo(px + 5, py + 16);
  ctx.lineTo(px + tile / 2, py + 8);
  ctx.lineTo(px + tile - 5, py + 16);
  ctx.closePath();
  ctx.fill();

  // log symbol
  ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 10, py + tile - 14);
  ctx.lineTo(px + tile - 10, py + tile - 14);
  ctx.stroke();
}

function drawClayQuarry(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  // base
  ctx.fillStyle = "rgba(120, 120, 120, 0.35)";
  ctx.fillRect(px + 4, py + tile / 2, tile - 8, tile / 2 - 4);

  // pit
  ctx.fillStyle = "rgba(80, 80, 80, 0.55)";
  ctx.beginPath();
  ctx.ellipse(px + tile / 2, py + tile * 0.72, tile * 0.28, tile * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // small pile
  ctx.fillStyle = "rgba(160, 160, 160, 0.55)";
  ctx.beginPath();
  ctx.moveTo(px + tile * 0.22, py + tile * 0.58);
  ctx.lineTo(px + tile * 0.36, py + tile * 0.52);
  ctx.lineTo(px + tile * 0.46, py + tile * 0.62);
  ctx.closePath();
  ctx.fill();
}

function drawPottery(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  // workshop base
  ctx.fillStyle = "rgba(125, 92, 60, 0.55)";
  ctx.fillRect(px + 6, py + tile / 2 + 4, tile - 12, tile / 2 - 8);

  // roof
  ctx.fillStyle = "rgba(110, 70, 40, 0.65)";
  ctx.beginPath();
  ctx.moveTo(px + 6, py + tile / 2 + 4);
  ctx.lineTo(px + tile / 2, py + 8);
  ctx.lineTo(px + tile - 6, py + tile / 2 + 4);
  ctx.closePath();
  ctx.fill();

  // kiln circle
  ctx.fillStyle = "rgba(90, 90, 90, 0.65)";
  ctx.beginPath();
  ctx.arc(px + tile * 0.72, py + tile * 0.72, tile * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawFurnitureFactory(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(100, 116, 139, 0.55)";
  ctx.fillRect(px + 6, py + tile / 2 + 4, tile - 12, tile / 2 - 8);

  ctx.fillStyle = "rgba(71, 85, 105, 0.65)";
  ctx.beginPath();
  ctx.moveTo(px + 6, py + tile / 2 + 4);
  ctx.lineTo(px + tile / 2, py + 10);
  ctx.lineTo(px + tile - 6, py + tile / 2 + 4);
  ctx.closePath();
  ctx.fill();

  // chair-ish icon
  ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + tile * 0.62, py + tile * 0.62);
  ctx.lineTo(px + tile * 0.62, py + tile * 0.80);
  ctx.moveTo(px + tile * 0.62, py + tile * 0.70);
  ctx.lineTo(px + tile * 0.78, py + tile * 0.70);
  ctx.stroke();
}

function drawFarmChicken(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(245, 158, 11, 0.45)";
  ctx.fillRect(px + 7, py + tile / 2 + 6, tile - 14, tile / 2 - 10);

  ctx.fillStyle = "rgba(234, 88, 12, 0.55)";
  ctx.beginPath();
  ctx.moveTo(px + 7, py + tile / 2 + 6);
  ctx.lineTo(px + tile / 2, py + 10);
  ctx.lineTo(px + tile - 7, py + tile / 2 + 6);
  ctx.closePath();
  ctx.fill();
}

function drawFarmPig(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(248, 113, 113, 0.40)";
  ctx.fillRect(px + 7, py + tile / 2 + 6, tile - 14, tile / 2 - 10);

  ctx.fillStyle = "rgba(239, 68, 68, 0.52)";
  ctx.fillRect(px + 10, py + 12, tile - 20, 10);
}

function drawFarmFish(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(14, 116, 144, 0.30)";
  ctx.fillRect(px + 7, py + tile / 2 + 6, tile - 14, tile / 2 - 10);

  ctx.fillStyle = "rgba(253, 224, 71, 0.85)";
  ctx.fillRect(px + tile * 0.68, py + tile * 0.60, 4, 3);
}

function drawFarmCow(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(148, 163, 184, 0.40)";
  ctx.fillRect(px + 7, py + tile / 2 + 6, tile - 14, tile / 2 - 10);

  ctx.fillStyle = "rgba(30, 41, 59, 0.65)";
  ctx.fillRect(px + 11, py + 12, tile - 22, 10);
}


function drawWalker(ctx: CanvasRenderingContext2D, wk: Walker, tile: number, now: number) {
  // Smooth interpolation between prev -> current using nextMoveAt cadence.
  const startAt = wk.nextMoveAt - WALKER_MOVE_EVERY_MS_DEFAULT;
  const t = clamp01((now - startAt) / WALKER_MOVE_EVERY_MS_DEFAULT);

  const fx = lerp(wk.prevX, wk.x, t);
  const fy = lerp(wk.prevY, wk.y, t);

  const cx = fx * tile + tile / 2;
  const cy = fy * tile + tile / 2;

  ctx.save();
  ctx.translate(cx, cy);

  const body = wk.kind === "water" ? "rgba(34, 211, 238, 0.95)" : "rgba(250, 204, 21, 0.95)";

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 7, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, -4, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // torso
  ctx.strokeStyle = body;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 5);
  ctx.stroke();

  // arms
  ctx.beginPath();
  ctx.moveTo(-3, 1);
  ctx.lineTo(3, 1);
  ctx.stroke();

  // legs
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(-2.5, 8);
  ctx.moveTo(0, 5);
  ctx.lineTo(2.5, 8);
  ctx.stroke();

  // prop (bucket/basket)
  ctx.fillStyle = wk.kind === "water" ? "rgba(125, 211, 252, 0.85)" : "rgba(34, 197, 94, 0.85)";
  ctx.fillRect(3, 2, 3, 3);

  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  world: WorldConfig,
  terrain: Uint8Array,
  grid: Grid,
  hover: { x: number; y: number } | null,
  waterPotential: Uint8Array,
  waterExpiry: Float64Array,
  foodExpiry: Float64Array,
  houseLevels: Uint8Array,
  now: number,
  walkers: Walker[],
  sprites: SpriteSet | null
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, w, h);

  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom);

  const worldW = world.cols * world.tile;
  const worldH = world.rows * world.tile;

  ctx.fillStyle = "#0f1b30";
  ctx.fillRect(0, 0, worldW, worldH);

  const viewX0 = cam.x;
  const viewY0 = cam.y;
  const viewX1 = cam.x + w / cam.zoom;
  const viewY1 = cam.y + h / cam.zoom;

  const xStart = Math.max(0, Math.floor(viewX0 / world.tile));
  const yStart = Math.max(0, Math.floor(viewY0 / world.tile));
  const xEnd = Math.min(world.cols, Math.ceil(viewX1 / world.tile));
  const yEnd = Math.min(world.rows, Math.ceil(viewY1 / world.tile));

  // Terrain layer
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = y * grid.cols + x;
      const tv = terrain[i] ?? TERRAIN.Plain;
      drawTerrainTile(ctx, x, y, world.tile, tv, terrain, world.cols, world.rows, now, sprites);
    }
  }

  // Roads
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isRoad(grid, x, y)) {
        const mask = getRoadMask(grid, x, y);
        const sid = (`road_${mask}` as unknown) as SpriteId;
        const sp = sprites?.[sid];
        if (sp) {
          // draw at tile center (road sprites are tile-sized)
          drawSpriteAnchored(ctx, sp, x * world.tile + world.tile / 2, y * world.tile + world.tile / 2, now);
        } else {
          // fallback: procedural road for a continuous look.
          drawRoad(ctx, x, y, world.tile, grid);
        }
      }
    }
  }

  // Buildings
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isWell(grid, x, y)) {
        const sp = sprites?.well;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawWell(ctx, x, y, world.tile);
      } else if (isMarket(grid, x, y)) {
        const sp = sprites?.market;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawMarket(ctx, x, y, world.tile);
      } else if (isWarehouse(grid, x, y)) {
        const sp = sprites?.warehouse;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawWarehouse(ctx, x, y, world.tile);
      } else if (isLumbermill(grid, x, y)) {
        const sp = sprites?.lumbermill;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawLumbermill(ctx, x, y, world.tile);
      } else if (isClayQuarry(grid, x, y)) {
        const sp = sprites?.clay_quarry;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawClayQuarry(ctx, x, y, world.tile);
      } else if (isPottery(grid, x, y)) {
        const sp = sprites?.pottery;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawPottery(ctx, x, y, world.tile);
      } else if (isFurnitureFactory(grid, x, y)) {
        const sp = sprites?.furniture_factory;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawFurnitureFactory(ctx, x, y, world.tile);
      } else if (isFarmChicken(grid, x, y)) {
        const sp = sprites?.farm_chicken;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawFarmChicken(ctx, x, y, world.tile);
      } else if (isFarmPig(grid, x, y)) {
        const sp = sprites?.farm_pig;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawFarmPig(ctx, x, y, world.tile);
      } else if (isFarmFish(grid, x, y)) {
        const sp = sprites?.farm_fish;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawFarmFish(ctx, x, y, world.tile);
      } else if (isFarmCow(grid, x, y)) {
        const sp = sprites?.farm_cow;
        if (sp) drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
        else drawFarmCow(ctx, x, y, world.tile);
      } else if (isHouse(grid, x, y)) {
        const i = y * grid.cols + x;
        const level = houseLevels[i] || 1;
        const sid = getHouseSpriteId(level);
        const sp = sprites?.[sid];
        if (sp) {
          drawSpriteAtTileBottomCenter(ctx, sp, x, y, world.tile, now);
          // overlays for service status
          const px = x * world.tile;
          const py = y * world.tile;
          if (waterPotential[i] === 1) {
            ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
            ctx.fillRect(px + 3, py + 7, world.tile - 6, world.tile - 10);
          }
          if (waterExpiry[i] > now) {
            ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 4.5, py + 8.5, world.tile - 9, world.tile - 11);
          }
          if (foodExpiry[i] > now) {
            ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 6.5, py + 10.5, world.tile - 13, world.tile - 15);
          }
        } else {
          drawHouse(ctx, x, y, world.tile, level, waterPotential[i] === 1, waterExpiry[i] > now, foodExpiry[i] > now);
        }
      }
    }
  }

  // Walkers
  for (const wk of walkers) {
    if (wk.x < xStart - 1 || wk.x > xEnd + 1 || wk.y < yStart - 1 || wk.y > yEnd + 1) continue;
    const sp = wk.kind === "water" ? sprites?.walker_water : sprites?.walker_food;
    if (sp) {
      const startAt = wk.nextMoveAt - WALKER_MOVE_EVERY_MS_DEFAULT;
      const tt = clamp01((now - startAt) / WALKER_MOVE_EVERY_MS_DEFAULT);
      const fx = lerp(wk.prevX, wk.x, tt);
      const fy = lerp(wk.prevY, wk.y, tt);

      // anchor near tile bottom so it "stands" on the ground
      const ax = fx * world.tile + world.tile / 2;
      const ay = fy * world.tile + world.tile - 2;

      // small shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(ax, ay - 1, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      drawSpriteAnchored(ctx, sp, ax, ay, now);
    } else {
      drawWalker(ctx, wk, world.tile, now);
    }
  }

  // Grid lines
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;

  for (let x = xStart; x <= xEnd; x++) {
    ctx.beginPath();
    ctx.moveTo(x * world.tile, yStart * world.tile);
    ctx.lineTo(x * world.tile, yEnd * world.tile);
    ctx.stroke();
  }
  for (let y = yStart; y <= yEnd; y++) {
    ctx.beginPath();
    ctx.moveTo(xStart * world.tile, y * world.tile);
    ctx.lineTo(xEnd * world.tile, y * world.tile);
    ctx.stroke();
  }

  // Hover
  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < world.cols && hover.y < world.rows) {
    ctx.fillStyle = "rgba(250, 204, 21, 0.14)";
    ctx.fillRect(hover.x * world.tile, hover.y * world.tile, world.tile, world.tile);

    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
    ctx.strokeRect(hover.x * world.tile + 0.5, hover.y * world.tile + 0.5, world.tile - 1, world.tile - 1);
  }
}
