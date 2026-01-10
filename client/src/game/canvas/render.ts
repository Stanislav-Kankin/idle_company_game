import type { Camera } from "./camera";
import type { Grid } from "../types";
import { WALKER_MOVE_EVERY_MS_DEFAULT, type Walker } from "../sim/sim";
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

function drawRoad(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number, grid: Grid) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
  ctx.fillRect(px + 8, py + 8, tile - 16, tile - 16);

  ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
  if (isRoad(grid, x, y - 1)) ctx.fillRect(px + tile / 2 - 4, py, 8, tile / 2);
  if (isRoad(grid, x + 1, y)) ctx.fillRect(px + tile / 2, py + tile / 2 - 4, tile / 2, 8);
  if (isRoad(grid, x, y + 1)) ctx.fillRect(px + tile / 2 - 4, py + tile / 2, 8, tile / 2);
  if (isRoad(grid, x - 1, y)) ctx.fillRect(px, py + tile / 2 - 4, tile / 2, 8);
}

function drawMarket(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(234, 179, 8, 0.9)";
  ctx.fillRect(px + 5, py + 8, tile - 10, tile - 14);

  ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 6.5, py + 9.5, tile - 13, tile - 17);
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

  ctx.fillStyle = "rgba(59, 130, 246, 0.86)";
  if (level === 2) ctx.fillStyle = "rgba(99, 102, 241, 0.86)";
  if (level >= 3) ctx.fillStyle = "rgba(168, 85, 247, 0.86)";

  ctx.fillRect(px + 6, py + 10, tile - 12, tile - 14);

  ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
  ctx.fillRect(px + 6, py + 7, tile - 12, 6);

  if (hasWaterPotential) {
    ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    ctx.fillRect(px + 3, py + 3, tile - 6, tile - 6);
  }

  if (recentlyWatered) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3.5, py + 7.5, tile - 7, tile - 11);
  }

  if (recentlyFed) {
    ctx.strokeStyle = "rgba(34, 197, 94, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5.5, py + 9.5, tile - 11, tile - 15);
  }

  if (!recentlyWatered && !recentlyFed) {
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4.5, py + 8.5, tile - 9, tile - 11);
  }
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
  ctx.fillRect(px + 6, py + 10, tile - 12, tile - 14);

  const cx = px + tile / 2;
  const cy = py + tile / 2 + 2;
  const r = Math.max(6, Math.floor(tile * 0.2));

  ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(125, 211, 252, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

  // "Human" silhouette (simple, no assets yet)
  const body = wk.kind === "water" ? "rgba(56, 189, 248, 0.95)" : "rgba(34, 197, 94, 0.95)";
  const shadow = "rgba(0,0,0,0.25)";

  // shadow
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(0, 6, 5, 2.5, 0, 0, Math.PI * 2);
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
  ctx.lineTo(0, 4);
  ctx.stroke();

  // arms
  ctx.beginPath();
  ctx.moveTo(-3, 1);
  ctx.lineTo(3, 1);
  ctx.stroke();

  // legs
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(-2.5, 7);
  ctx.moveTo(0, 4);
  ctx.lineTo(2.5, 7);
  ctx.stroke();

  // tiny prop (bucket/basket)
  if (wk.kind === "water") {
    ctx.fillStyle = "rgba(125, 211, 252, 0.85)";
    ctx.fillRect(3, 2, 3, 3);
  } else {
    ctx.fillStyle = "rgba(250, 204, 21, 0.85)";
    ctx.fillRect(3, 2, 3, 3);
  }

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
  walkers: Walker[]
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

  // Terrain base (Iteration B): water/forest/mountain + fish spots.
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = y * grid.cols + x;
      const tv = terrain[i] ?? TERRAIN.Plain;

      if (tv === TERRAIN.Water || tv === TERRAIN.FishSpot) {
        ctx.fillStyle = "rgba(14, 116, 144, 0.35)";
        ctx.fillRect(x * world.tile, y * world.tile, world.tile, world.tile);

        if (tv === TERRAIN.FishSpot) {
          ctx.fillStyle = "rgba(253, 224, 71, 0.95)";
          ctx.fillRect(x * world.tile + world.tile * 0.72, y * world.tile + world.tile * 0.28, 3, 3);
        }
      } else if (tv === TERRAIN.Forest) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
        ctx.fillRect(x * world.tile, y * world.tile, world.tile, world.tile);
      } else if (tv === TERRAIN.Mountain) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
        ctx.fillRect(x * world.tile, y * world.tile, world.tile, world.tile);

        ctx.fillStyle = "rgba(148, 163, 184, 0.28)";
        ctx.fillRect(x * world.tile + 6, y * world.tile + 10, world.tile - 12, 4);
      }
    }
  }

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isRoad(grid, x, y)) drawRoad(ctx, x, y, world.tile, grid);
    }
  }

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isWell(grid, x, y)) drawWell(ctx, x, y, world.tile);
      else if (isMarket(grid, x, y)) drawMarket(ctx, x, y, world.tile);
      else if (isHouse(grid, x, y)) {
        const i = y * grid.cols + x;
        const level = houseLevels[i] || 1;
        drawHouse(ctx, x, y, world.tile, level, waterPotential[i] === 1, waterExpiry[i] > now, foodExpiry[i] > now);
      }
    }
  }

  for (const wk of walkers) {
    if (wk.x < xStart - 1 || wk.x > xEnd + 1 || wk.y < yStart - 1 || wk.y > yEnd + 1) continue;
    drawWalker(ctx, wk, world.tile, now);
  }

  ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
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

  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < world.cols && hover.y < world.rows) {
    ctx.fillStyle = "rgba(250, 204, 21, 0.14)";
    ctx.fillRect(hover.x * world.tile, hover.y * world.tile, world.tile, world.tile);

    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
    ctx.strokeRect(hover.x * world.tile + 0.5, hover.y * world.tile + 0.5, world.tile - 1, world.tile - 1);
  }
}
