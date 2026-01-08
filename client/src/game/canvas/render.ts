import type { Camera } from "./camera";
import type { Grid } from "../types";
import type { Walker } from "../sim/sim";

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

function drawRoad(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number, grid: Grid) {
  const px = x * tile;
  const py = y * tile;

  const n = isRoad(grid, x, y - 1);
  const e = isRoad(grid, x + 1, y);
  const s = isRoad(grid, x, y + 1);
  const w = isRoad(grid, x - 1, y);

  ctx.fillStyle = "rgba(148, 163, 184, 0.10)";
  ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);

  const thickness = Math.max(8, Math.floor(tile * 0.34));
  const half = Math.floor((tile - thickness) / 2);

  ctx.fillStyle = "rgba(148, 163, 184, 0.92)";
  ctx.fillRect(px + half, py + half, thickness, thickness);

  if (n) ctx.fillRect(px + half, py, thickness, half + 1);
  if (s) ctx.fillRect(px + half, py + half + thickness - 1, thickness, half + 1);
  if (w) ctx.fillRect(px, py + half, half + 1, thickness);
  if (e) ctx.fillRect(px + half + thickness - 1, py + half, half + 1, thickness);

  ctx.strokeStyle = "rgba(30, 41, 59, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + half + 1, py + half + 1, thickness - 2, thickness - 2);
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  hasWaterPotential: boolean,
  recentlyServed: boolean
) {
  const px = x * tile;
  const py = y * tile;

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(px + 4, py + 6, tile - 8, tile - 8);

  ctx.fillStyle = "rgba(59, 130, 246, 0.88)";
  ctx.fillRect(px + 4, py + 8, tile - 8, tile - 10);

  ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 10);
  ctx.lineTo(px + tile / 2, py + 2);
  ctx.lineTo(px + tile - 4, py + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  const ww = Math.max(4, Math.floor(tile * 0.14));
  ctx.fillRect(px + 7, py + tile - 12, ww, ww);
  ctx.fillRect(px + tile - 7 - ww, py + tile - 12, ww, ww);

  // Base: water potential from wells radius layer
  if (hasWaterPotential) {
    ctx.fillStyle = "rgba(59, 130, 246, 0.18)";
    ctx.fillRect(px + 3, py + 7, tile - 6, tile - 10);
  }

  // Highlight: recently served by a walker (time-limited)
  if (recentlyServed) {
    ctx.strokeStyle = "rgba(34, 211, 238, 0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 3.5, py + 7.5, tile - 7, tile - 11);
  } else {
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
  const r = Math.max(6, Math.floor(tile * 0.20));

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

function drawWalker(ctx: CanvasRenderingContext2D, w: Walker, tile: number) {
  const px = w.x * tile;
  const py = w.y * tile;
  const cx = px + tile / 2;
  const cy = py + tile / 2;
  const r = Math.max(5, Math.floor(tile * 0.18));

  ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  world: WorldConfig,
  grid: Grid,
  hover: { x: number; y: number } | null,
  waterPotential: Uint8Array,
  waterExpiry: Float64Array,
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

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isRoad(grid, x, y)) drawRoad(ctx, x, y, world.tile, grid);
    }
  }

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      if (isWell(grid, x, y)) {
        drawWell(ctx, x, y, world.tile);
      } else if (isHouse(grid, x, y)) {
        const i = y * grid.cols + x;
        drawHouse(ctx, x, y, world.tile, waterPotential[i] === 1, waterExpiry[i] > now);
      }
    }
  }

  for (const wk of walkers) {
    if (wk.x < xStart - 1 || wk.x > xEnd + 1 || wk.y < yStart - 1 || wk.y > yEnd + 1) continue;
    drawWalker(ctx, wk, world.tile);
  }

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
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
    ctx.strokeRect(
      hover.x * world.tile + 0.5,
      hover.y * world.tile + 0.5,
      world.tile - 1,
      world.tile - 1
    );
  }

  const cx = Math.floor(world.cols / 2) * world.tile;
  const cy = Math.floor(world.rows / 2) * world.tile;
  ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
  ctx.fillRect(cx, cy, world.tile, world.tile);
}
