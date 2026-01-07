export type Tool = "pan" | "road" | "house" | "well";

export type CellType = "empty" | "road" | "house" | "well";

export type Grid = {
  cols: number;
  rows: number;
  cells: Uint8Array; // 0 empty, 1 road, 2 house, 3 well
};

export function idx(x: number, y: number, cols: number) {
  return y * cols + x;
}

export function setCell(grid: Grid, x: number, y: number, t: CellType) {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return;

  const v = t === "road" ? 1 : t === "house" ? 2 : t === "well" ? 3 : 0;
  grid.cells[idx(x, y, grid.cols)] = v;
}
