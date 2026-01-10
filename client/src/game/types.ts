export type Tool =
  | "pan"
  | "road"
  | "house"
  | "well"
  | "market"
  | "warehouse"
  | "lumbermill"
  | "bulldoze";

export type CellType = "empty" | "road" | "house" | "well" | "market" | "warehouse" | "lumbermill";

// Economy (MVP): raw resources only.
export type ResourceId = "wood" | "clay" | "grain" | "meat" | "fish";

export type EconomyState = Record<ResourceId, number>;

export type Grid = {
  cols: number;
  rows: number;
  cells: Uint8Array; // 0 empty, 1 road, 2 house, 3 well, 4 market, 5 warehouse, 6 lumbermill
};

export type HouseInfo = {
  x: number;
  y: number;
  level: number; // 1..3
  population: number;

  hasRoadAdj: boolean;
  hasWaterPotential: boolean;

  waterServed: boolean; // time-limited (walker)
  foodServed: boolean; // time-limited (walker)
};

export type CityStats = {
  population: number;

  housesTotal: number;
  housesByLevel: { 1: number; 2: number; 3: number };

  withWaterPotential: number;
  withWaterServed: number;
  withFoodServed: number;
};

export function idx(x: number, y: number, cols: number) {
  return y * cols + x;
}

export function getCellValue(grid: Grid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return -1;
  return grid.cells[idx(x, y, grid.cols)];
}

export function cellTypeAt(grid: Grid, x: number, y: number): CellType {
  const v = getCellValue(grid, x, y);
  if (v === 1) return "road";
  if (v === 2) return "house";
  if (v === 3) return "well";
  if (v === 4) return "market";
  if (v === 5) return "warehouse";
  if (v === 6) return "lumbermill";
  return "empty";
}

export function hasAdjacentRoad(grid: Grid, x: number, y: number): boolean {
  return (
    cellTypeAt(grid, x, y - 1) === "road" ||
    cellTypeAt(grid, x + 1, y) === "road" ||
    cellTypeAt(grid, x, y + 1) === "road" ||
    cellTypeAt(grid, x - 1, y) === "road"
  );
}

// Low-level setter. Placement rules live in GameCanvas.
export function setCell(grid: Grid, x: number, y: number, t: CellType) {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return;

  const v =
    t === "road"
      ? 1
      : t === "house"
        ? 2
        : t === "well"
          ? 3
          : t === "market"
            ? 4
            : t === "warehouse"
              ? 5
              : t === "lumbermill"
                ? 6
                : 0;
  grid.cells[idx(x, y, grid.cols)] = v;
}
