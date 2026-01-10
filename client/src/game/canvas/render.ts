import type { Camera } from "./camera";
import type { Grid } from "../types";
import { WALKER_MOVE_EVERY_MS_DEFAULT, type Walker } from "../sim/sim";
import type { SpriteEntry, SpriteFrame, SpriteSet } from "../sprites/types";
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

function drawTerrainTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number, tv: number) {
  const px = x * tile;
  const py = y * tile;

  // pseudo-2D: top face + tiny shadow edge
  if (tv === TERRAIN.Water || tv === TERRAIN.FishSpot) {
    ctx.fillStyle = "rgba(14, 116, 144, 0.38)";
    ctx.fillRect(px, py, tile, tile);

    ctx.fillStyle = "rgba(3, 105, 161, 0.18)";
    ctx.fillRect(px, py + tile - 3, tile, 3);

    if (tv === TERRAIN.FishSpot) {
      ctx.fillStyle = "rgba(253, 224, 71, 0.95)";
      ctx.fillRect(px + tile * 0.7, py + tile * 0.25, 4, 4);
    }
    return;
  }

  if (tv === TERRAIN.Forest) {
    ctx.fillStyle = "rgba(22, 163, 74, 0.12)";
    ctx.fillRect(px, py, tile, tile);

    // tiny tree blobs
    ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
    ctx.fillRect(px + 6, py + 8, 4, 4);
    ctx.fillRect(px + tile - 12, py + 6, 3, 3);
    ctx.fillRect(px + tile - 10, py + tile - 12, 4, 4);
    return;
  }

  if (tv === TERRAIN.Mountain) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
    ctx.fillRect(px, py, tile, tile);

    ctx.fillStyle = "rgba(148, 163, 184, 0.22)";
    ctx.beginPath();
    ctx.moveTo(px + 6, py + tile - 6);
    ctx.lineTo(px + tile / 2, py + 8);
    ctx.lineTo(px + tile - 6, py + tile - 6);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // plain: keep dark base (already filled globally)
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
      drawTerrainTile(ctx, x, y, world.tile, tv);
    }
  }

  // Roads
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isRoad(grid, x, y)) {
        // Roads are auto-tiled procedurally for a continuous look.
        // (Our current road.png is an icon-like sprite and looks blocky when repeated.)
        drawRoad(ctx, x, y, world.tile, grid);
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
