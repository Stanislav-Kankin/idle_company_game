import type { Camera } from "./camera";
import type { Grid, CellType } from "../types";

export type WorldConfig = {
  tile: number;
  cols: number;
  rows: number;
};

function cellColor(t: CellType) {
  if (t === "road") return "rgba(148, 163, 184, 0.9)";
  if (t === "house") return "rgba(59, 130, 246, 0.9)";
  return null;
}

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  world: WorldConfig,
  grid: Grid,
  hover: { x: number; y: number } | null
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

  // draw placed objects
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const v = grid.cells[y * grid.cols + x];
      if (v === 0) continue;

      const t: CellType = v === 1 ? "road" : "house";
      const c = cellColor(t);
      if (!c) continue;

      ctx.fillStyle = c;
      // slight padding for aesthetics
      ctx.fillRect(x * world.tile + 2, y * world.tile + 2, world.tile - 4, world.tile - 4);
    }
  }

  // grid lines on top
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

  // hover highlight
  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < world.cols && hover.y < world.rows) {
    ctx.fillStyle = "rgba(250, 204, 21, 0.18)";
    ctx.fillRect(hover.x * world.tile, hover.y * world.tile, world.tile, world.tile);

    ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
    ctx.strokeRect(hover.x * world.tile + 0.5, hover.y * world.tile + 0.5, world.tile - 1, world.tile - 1);
  }

  // center marker
  const cx = Math.floor(world.cols / 2) * world.tile;
  const cy = Math.floor(world.rows / 2) * world.tile;
  ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
  ctx.fillRect(cx, cy, world.tile, world.tile);
}
