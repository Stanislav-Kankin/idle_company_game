export type Tool = "pan" | "road" | "house";

export type CellType = "empty" | "road" | "house";

export type Grid = {
  cols: number;
  rows: number;
  cells: Uint8Array; // compact: 0 empty, 1 road, 2 house
};

export function idx(x: number, y: number, cols: number) {
  return y * cols + x;
}

export function getCell(grid: Grid, x: number, y: number): CellType {
  const v = grid.cells[idx(x, y, grid.cols)];
  if (v === 1) return "road";
  if (v === 2) return "house";
  return "empty";
}

export function setCell(grid: Grid, x: number, y: number, t: CellType) {
  grid.cells[idx(x, y, grid.cols)] = t === "road" ? 1 : t === "house" ? 2 : 0;
}
