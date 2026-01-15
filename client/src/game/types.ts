export type Tool =
  | "pan"
  | "road"
  | "house"
  | "well"
  | "market"
  | "warehouse"
  | "lumbermill"
  | "furniture_factory"
  | "clay_quarry"
  | "pottery"
  | "farm_chicken"
  | "farm_pig"
  | "farm_fish"
  | "farm_cow"
  | "bulldoze";

export type CellType =
  | "empty"
  | "road"
  | "house"
  | "well"
  | "market"
  | "warehouse"
  | "lumbermill"
  | "clay_quarry"
  | "pottery"
  | "furniture_factory"
  | "farm_chicken"
  | "farm_pig"
  | "farm_fish"
  | "farm_cow";

// Economy (MVP): raw resources only.
export type ResourceId = "wood" | "clay" | "grain" | "meat" | "fish" | "pottery" | "furniture" | "milk" | "beef";

export type EconomyState = Record<ResourceId, number>;

export type ProductionBlockReason = "no_workers" | "no_warehouse" | "warehouse_full" | "bad_placement" | "no_inputs";

export type ProductionRecipe = {
  durationMs: number;
  inputs?: Partial<Record<ResourceId, number>>;
  outputs: Partial<Record<ResourceId, number>>;
};


// --- Building inspectors (non-house) ---

export type MarketSlotId = "food" | "furniture" | "pottery" | "wine" | "other";

export type MarketSlots = Record<MarketSlotId, number>;

export type WarehouseInfo = {
  kind: "warehouse";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  efficiency: number; // 0..1
  capacity: number;
  total: number;
  stored: EconomyState;
};

export type MarketInfo = {
  kind: "market";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  efficiency: number; // 0..1
  capacity: number;
  total: number;
  slotMax: number;
  slots: MarketSlots;
};

export type LumbermillInfo = {
  kind: "lumbermill";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  hasForestAdj: boolean;
  hasWarehouse: boolean;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type ClayQuarryInfo = {
  kind: "clay_quarry";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type PotteryInfo = {
  kind: "pottery";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type FurnitureFactoryInfo = {
  kind: "furniture_factory";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type FarmChickenInfo = {
  kind: "farm_chicken";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type FarmPigInfo = {
  kind: "farm_pig";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type FarmFishInfo = {
  kind: "farm_fish";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  hasWaterAdj: boolean;
  hasFishSpotAdj: boolean;
  progress01: number; // 0..1
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  secondsToNext: number;
};

export type FarmCowInfo = {
  kind: "farm_cow";
  x: number;
  y: number;
  workersRequired: number;
  workersAssigned: number;
  workersNearby: number;
  efficiency: number; // 0..1
  blocked: ProductionBlockReason[];
  milkProgress01: number;
  milkSecondsToNext: number;
  beefProgress01: number;
  beefSecondsToNext: number;
};

export type BuildingInfo =
  | WarehouseInfo
  | MarketInfo
  | LumbermillInfo
  | ClayQuarryInfo
  | PotteryInfo
  | FurnitureFactoryInfo
  | FarmChickenInfo
  | FarmPigInfo
  | FarmFishInfo
  | FarmCowInfo;

export type Grid = {
  cols: number;
  rows: number;
  cells: Uint8Array; // 0 empty, 1 road, 2 house, 3 well, 4 market, 5 warehouse, 6 lumbermill, 7 clay_quarry, 8 pottery, 9 furniture_factory, 10 farm_chicken, 11 farm_pig, 12 farm_fish, 13 farm_cow
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

  // Risks (countdown seconds; -1 means unknown/uninitialized)
  riskFireS?: number;
  riskCollapseS?: number;
  riskCrimeS?: number;
  riskDiseaseS?: number;
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
  if (v === 7) return "clay_quarry";
  if (v === 8) return "pottery";
  if (v === 9) return "furniture_factory";
  if (v === 10) return "farm_chicken";
  if (v === 11) return "farm_pig";
  if (v === 12) return "farm_fish";
  if (v === 13) return "farm_cow";
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
                : t === "clay_quarry"
                  ? 7
                  : t === "pottery"
                    ? 8
                    : t === "furniture_factory"
                      ? 9
                      : t === "farm_chicken"
                        ? 10
                        : t === "farm_pig"
                          ? 11
                          : t === "farm_fish"
                            ? 12
                            : t === "farm_cow"
                              ? 13
                    : 0;
  grid.cells[idx(x, y, grid.cols)] = v;
}
