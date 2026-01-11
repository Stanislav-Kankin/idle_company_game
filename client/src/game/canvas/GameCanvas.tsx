import { useEffect, useMemo, useRef } from "react";
import { useCanvasSize } from "./useCanvasSize";
import { render, type WorldConfig } from "./render";
import { attachInput } from "./input";
import type { Camera } from "./camera";
import { clamp } from "./camera";
import {
  cellTypeAt,
  hasAdjacentRoad,
  type BuildingInfo,
  type CityStats,
  type EconomyState,
  type Grid,
  type HouseInfo,
  type MarketSlots,
  type ProductionBlockReason,
  type ProductionRecipe,
  type Tool,
  setCell,
} from "../types";
import {
  computeCityStats,
  computeHousePopulation,
  computeWellWaterPotential,
  ensureMarketLadiesForMarkets,
  ensureWaterCarriersForHouses,
  stepHouseEvolution,
  stepWalkers,
  WELL_RADIUS,
  type Walker,
} from "../sim/sim";
import {
  WAREHOUSE_CAPACITY,
  emptyEconomyState,
  totalStored,
} from "../sim/warehouse";
import { stepProduction } from "../sim/production";
import { generateTerrain, isTerrainBlockedForBuilding, TERRAIN } from "../map/terrain";
import { loadSprites } from "../sprites/loader";
import type { SpriteSet } from "../sprites/types";
import type { I18nKey } from "../../i18n";

const MARKET_CAPACITY = 50;
const MARKET_SLOT_MAX = 10;

// per 1 wood (requested): 1 minute
const LUMBERMILL_WOOD_TIME_MS = 60_000;
const LUMBERMILL_RECIPE: ProductionRecipe = { durationMs: LUMBERMILL_WOOD_TIME_MS, outputs: { wood: 1 } };

// Clay Quarry: 1 clay per 2 minutes
const CLAY_QUARRY_TIME_MS = 120_000;
const CLAY_QUARRY_RECIPE: ProductionRecipe = { durationMs: CLAY_QUARRY_TIME_MS, outputs: { clay: 1 } };

// Pottery: 4 clay -> 1 pottery per 4.5 minutes
const POTTERY_TIME_MS = 270_000;
const POTTERY_RECIPE: ProductionRecipe = { durationMs: POTTERY_TIME_MS, inputs: { clay: 4 }, outputs: { pottery: 1 } };

// Workforce (Iteration C2)
const WORKER_RADIUS_TILES = 10;
const WORKERS_LUMBERMILL = 10;
const WORKERS_MARKET = 2;
const WORKERS_CLAY_QUARRY = 8;
const WORKERS_POTTERY = 10;

type MinimapPayload = {
  cols: number;
  rows: number;
  cells: Uint8Array;
  tileSize: number;
  cam: Camera;
  viewW: number;
  viewH: number;
  terrain: Uint8Array;
};

type CameraApi = {
  centerOnWorld: (worldX: number, worldY: number) => void;
};

export function GameCanvas(props: {
  tool: Tool;
  onHover?: (tile: { x: number; y: number } | null) => void;

  // inspector / stats callbacks
  onHouseHoverInfo?: (info: HouseInfo | null) => void;
  onHouseSelect?: (info: HouseInfo | null) => void;

  onBuildingHoverInfo?: (info: BuildingInfo | null) => void;
  onBuildingSelect?: (info: BuildingInfo | null) => void;

  onStats?: (stats: CityStats) => void;
  onEconomy?: (eco: EconomyState) => void;

  // UI toast/messages (i18n key lives in UI)
  notifyKey?: (key: I18nKey) => void;

  onMinimap?: (payload: MinimapPayload) => void;
  onCameraApi?: (api: CameraApi) => void;

  // economy (UI-owned for now)
  buildCosts: Record<Tool, number>;
  trySpend: (amount: number) => boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useCanvasSize();

  // Bigger map (~1.5x): 80x60 -> 120x90
  const world: WorldConfig = useMemo(() => ({ tile: 32, cols: 120, rows: 90 }), []);

  // New terrain each reload: seed generated on mount.
  const seedRef = useRef<number>(((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1);
  const terrainRef = useRef<Uint8Array>(generateTerrain(world.cols, world.rows, seedRef.current));

  const spritesRef = useRef<SpriteSet | null>(null);

  const gridRef = useRef<Grid>({
    cols: world.cols,
    rows: world.rows,
    cells: new Uint8Array(world.cols * world.rows),
  });

  const waterExpiryRef = useRef<Float64Array>(new Float64Array(world.cols * world.rows));
  const foodExpiryRef = useRef<Float64Array>(new Float64Array(world.cols * world.rows));
  const waterPotentialRef = useRef<Uint8Array>(new Uint8Array(world.cols * world.rows));

  // NOTE: sim/render expect Uint8Array for house levels
  const houseLevelsRef = useRef<Uint8Array>(new Uint8Array(world.cols * world.rows));
  const houseSatisfiedSinceRef = useRef<Float64Array>(new Float64Array(world.cols * world.rows)); // ms (performance.now)

  const walkersRef = useRef<Walker[]>([]);

  // Economy (Iteration C MVP): raw resources; updated by a fixed-step tick.
  const economyRef = useRef<EconomyState>(emptyEconomyState());
  const ecoCarryMsRef = useRef<number>(0);
  const lastEcoFrameAtRef = useRef<number | null>(null);

  // Building state (Iteration C): per-building stores / timers.
  const warehousesRef = useRef<Map<number, EconomyState>>(new Map());
  const marketsRef = useRef<Map<number, MarketSlots>>(new Map());
  const lumbermillProgressRef = useRef<Map<number, number>>(new Map()); // ms
  const clayQuarryProgressRef = useRef<Map<number, number>>(new Map()); // ms
  const potteryProgressRef = useRef<Map<number, number>>(new Map()); // ms

  // Workforce assignment (recomputed periodically)
  const workersAssignedRef = useRef<Map<number, number>>(new Map());
  const workersNearbyRef = useRef<Map<number, number>>(new Map());

  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const camInitializedRef = useRef(false);

  const toolRef = useRef<Tool>(props.tool);
  const onHoverRef = useRef<typeof props.onHover>(props.onHover);
  const onHouseHoverInfoRef = useRef<typeof props.onHouseHoverInfo>(props.onHouseHoverInfo);
  const onHouseSelectRef = useRef<typeof props.onHouseSelect>(props.onHouseSelect);
  const onBuildingHoverInfoRef = useRef<typeof props.onBuildingHoverInfo>(props.onBuildingHoverInfo);
  const onBuildingSelectRef = useRef<typeof props.onBuildingSelect>(props.onBuildingSelect);
  const onStatsRef = useRef<typeof props.onStats>(props.onStats);
  const onEconomyRef = useRef<typeof props.onEconomy>(props.onEconomy);
  const notifyKeyRef = useRef<typeof props.notifyKey>(props.notifyKey);
  const onMinimapRef = useRef<typeof props.onMinimap>(props.onMinimap);

  const buildCostsRef = useRef<Record<Tool, number>>(props.buildCosts);
  const trySpendRef = useRef<(amount: number) => boolean>(props.trySpend);

  useEffect(() => void (toolRef.current = props.tool), [props.tool]);
  useEffect(() => void (onHoverRef.current = props.onHover), [props.onHover]);
  useEffect(() => void (onHouseHoverInfoRef.current = props.onHouseHoverInfo), [props.onHouseHoverInfo]);
  useEffect(() => void (onHouseSelectRef.current = props.onHouseSelect), [props.onHouseSelect]);
  useEffect(() => void (onBuildingHoverInfoRef.current = props.onBuildingHoverInfo), [props.onBuildingHoverInfo]);
  useEffect(() => void (onBuildingSelectRef.current = props.onBuildingSelect), [props.onBuildingSelect]);
  useEffect(() => void (onStatsRef.current = props.onStats), [props.onStats]);
  useEffect(() => void (onEconomyRef.current = props.onEconomy), [props.onEconomy]);
  useEffect(() => void (notifyKeyRef.current = props.notifyKey), [props.notifyKey]);
  useEffect(() => void (onMinimapRef.current = props.onMinimap), [props.onMinimap]);
  useEffect(() => void (buildCostsRef.current = props.buildCosts), [props.buildCosts]);
  useEffect(() => void (trySpendRef.current = props.trySpend), [props.trySpend]);

  // Optional sprites (fallback renderer works without them)
  useEffect(() => {
    let alive = true;

    loadSprites()
      .then((set) => {
        if (!alive) return;
        spritesRef.current = set;
      })
      .catch(() => {
        // ignore, fallback drawings will be used
      });

    return () => {
      alive = false;
    };
  }, []);

  // Register camera API for minimap control (tap/drag)
  useEffect(() => {
    if (!props.onCameraApi) return;

    const centerOnWorld = (worldX: number, worldY: number) => {
      const cam = camRef.current;
      const zoom = Math.max(0.0001, cam.zoom);

      const worldW = world.cols * world.tile;
      const worldH = world.rows * world.tile;

      const viewWorldW = w / zoom;
      const viewWorldH = h / zoom;

      const nx = worldX - viewWorldW / 2;
      const ny = worldY - viewWorldH / 2;

      const maxX = Math.max(0, worldW - viewWorldW);
      const maxY = Math.max(0, worldH - viewWorldH);

      camRef.current = {
        ...cam,
        x: clamp(nx, 0, maxX),
        y: clamp(ny, 0, maxY),
      };
    };

    props.onCameraApi({ centerOnWorld });
  }, [props.onCameraApi, w, h, world]);

  // init / re-center once we know canvas size
  useEffect(() => {
    if (camInitializedRef.current) return;
    if (w <= 0 || h <= 0) return;

    const worldW = world.cols * world.tile;
    const worldH = world.rows * world.tile;

    camRef.current = {
      x: Math.max(0, worldW / 2 - w / 2),
      y: Math.max(0, worldH / 2 - h / 2),
      zoom: 1,
    };

    camInitializedRef.current = true;
  }, [w, h, world]);

  function getHouseInfoAt(x: number, y: number, now: number): HouseInfo | null {
    if (cellTypeAt(gridRef.current, x, y) !== "house") return null;

    const i = y * gridRef.current.cols + x;
    const level = houseLevelsRef.current[i] || 1;

    const hasRoadAdj = hasAdjacentRoad(gridRef.current, x, y);
    const hasWaterPotential = waterPotentialRef.current[i] === 1;
    const waterServed = waterExpiryRef.current[i] > now;
    const foodServed = foodExpiryRef.current[i] > now;

    const population = computeHousePopulation(level, hasRoadAdj, hasWaterPotential, foodServed);

    return { x, y, level, population, hasRoadAdj, hasWaterPotential, waterServed, foodServed };
  }

  function emptyMarketSlots(): MarketSlots {
    return { food: 0, furniture: 0, pottery: 0, wine: 0, other: 0 };
  }

  function syncBuildingStateFromGrid(): void {
    const cells = gridRef.current.cells;

    // Ensure state exists for present buildings
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (v === 5) {
        if (!warehousesRef.current.has(i)) warehousesRef.current.set(i, emptyEconomyState());
      } else if (v === 4) {
        if (!marketsRef.current.has(i)) marketsRef.current.set(i, emptyMarketSlots());
      } else if (v === 6) {
        if (!lumbermillProgressRef.current.has(i)) lumbermillProgressRef.current.set(i, 0);
      } else if (v === 7) {
        if (!clayQuarryProgressRef.current.has(i)) clayQuarryProgressRef.current.set(i, 0);
      } else if (v === 8) {
        if (!potteryProgressRef.current.has(i)) potteryProgressRef.current.set(i, 0);
      }
    }

    // Prune removed buildings
    for (const k of Array.from(warehousesRef.current.keys())) {
      if (cells[k] !== 5) warehousesRef.current.delete(k);
    }
    for (const k of Array.from(marketsRef.current.keys())) {
      if (cells[k] !== 4) marketsRef.current.delete(k);
    }
    for (const k of Array.from(lumbermillProgressRef.current.keys())) {
      if (cells[k] !== 6) lumbermillProgressRef.current.delete(k);
    }
    for (const k of Array.from(clayQuarryProgressRef.current.keys())) {
      if (cells[k] !== 7) clayQuarryProgressRef.current.delete(k);
    }
    for (const k of Array.from(potteryProgressRef.current.keys())) {
      if (cells[k] !== 8) potteryProgressRef.current.delete(k);
    }

    // Keep workforce maps only for active buildings that require workers.
    for (const k of Array.from(workersAssignedRef.current.keys())) {
      if (cells[k] !== 4 && cells[k] !== 5 && cells[k] !== 6 && cells[k] !== 7 && cells[k] !== 8) workersAssignedRef.current.delete(k);
    }
    for (const k of Array.from(workersNearbyRef.current.keys())) {
      if (cells[k] !== 4 && cells[k] !== 5 && cells[k] !== 6 && cells[k] !== 7 && cells[k] !== 8) workersNearbyRef.current.delete(k);
    }
  }

  function requiredWorkersForCell(v: number): number {
    if (v === 6) return WORKERS_LUMBERMILL;
    if (v === 4) return WORKERS_MARKET;
    if (v === 7) return WORKERS_CLAY_QUARRY;
    if (v === 8) return WORKERS_POTTERY;
    return 0;
  }

  function recomputeWorkforce(now: number): void {
    // Build house worker pool
    const cols = gridRef.current.cols;
    const rows = gridRef.current.rows;
    const cells = gridRef.current.cells;

    type HousePool = { idx: number; x: number; y: number; total: number; remain: number };
    const houses: HousePool[] = [];

    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 2) continue; // house
      const x = i % cols;
      const y = (i / cols) | 0;

      const level = houseLevelsRef.current[i] || 1;
      const hasRoadAdj = hasAdjacentRoad(gridRef.current, x, y);
      const hasWaterPotential = waterPotentialRef.current[i] === 1;
      const foodServed = foodExpiryRef.current[i] > now;

      const pop = computeHousePopulation(level, hasRoadAdj, hasWaterPotential, foodServed);
      if (pop <= 0) continue;

      houses.push({ idx: i, x, y, total: pop, remain: pop });
    }

    // Prepare demands (stable order by cell index)
    type Demand = { idx: number; x: number; y: number; required: number };
    const demands: Demand[] = [];

    for (let i = 0; i < cells.length; i++) {
      const req = requiredWorkersForCell(cells[i] ?? 0);
      if (req <= 0) continue;
      const x = i % cols;
      const y = (i / cols) | 0;
      demands.push({ idx: i, x, y, required: req });
    }

    // Reset maps
    workersAssignedRef.current.clear();
    workersNearbyRef.current.clear();

    // Greedy assignment: nearest houses first (Manhattan distance), shared pool
    for (const d of demands) {
      const candidates: { h: HousePool; dist: number }[] = [];
      let supply = 0;

      for (const h of houses) {
        const dx = Math.abs(h.x - d.x);
        const dy = Math.abs(h.y - d.y);
        const dist = dx + dy;
        if (dist > WORKER_RADIUS_TILES) continue;
        supply += h.total;
        if (h.remain > 0) candidates.push({ h, dist });
      }

      candidates.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.h.idx - b.h.idx));

      let assigned = 0;
      for (const c of candidates) {
        if (assigned >= d.required) break;
        const take = Math.min(c.h.remain, d.required - assigned);
        if (take <= 0) continue;
        c.h.remain -= take;
        assigned += take;
      }

      workersAssignedRef.current.set(d.idx, assigned);
      workersNearbyRef.current.set(d.idx, supply);
    }
  }

  function findNearestWarehouseIndex(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const cols = gridRef.current.cols;

    for (const idx of warehousesRef.current.keys()) {
      const wx = idx % cols;
      const wy = (idx / cols) | 0;
      const d = Math.abs(wx - x) + Math.abs(wy - y);
      if (d < bestDist) {
        bestDist = d;
        best = idx;
      }
    }
    return best;
  }

  function getBuildingInfoAt(x: number, y: number): BuildingInfo | null {
    const ct = cellTypeAt(gridRef.current, x, y);
    if (ct !== "warehouse" && ct !== "market" && ct !== "lumbermill" && ct !== "clay_quarry" && ct !== "pottery") return null;

    const cols = gridRef.current.cols;
    const i = y * cols + x;

    // Make inspector robust even if state wasn't initialized yet
    syncBuildingStateFromGrid();

    const v = gridRef.current.cells[i] ?? 0;
    const req = requiredWorkersForCell(v);
    const assigned = workersAssignedRef.current.get(i) ?? 0;
    const nearby = workersNearbyRef.current.get(i) ?? 0;
    const efficiency = req > 0 ? Math.min(1, assigned / req) : 1;

    if (ct === "warehouse") {
      const stored = warehousesRef.current.get(i) ?? emptyEconomyState();
      return {
        kind: "warehouse",
        x,
        y,
        workersRequired: req,
        workersAssigned: assigned,
        workersNearby: nearby,
        efficiency,
        capacity: WAREHOUSE_CAPACITY,
        total: totalStored(stored),
        stored: { ...stored },
      };
    }

    if (ct === "market") {
      const slots = marketsRef.current.get(i) ?? emptyMarketSlots();
      const total = (slots.food ?? 0) + (slots.furniture ?? 0) + (slots.pottery ?? 0) + (slots.wine ?? 0) + (slots.other ?? 0);
      return {
        kind: "market",
        x,
        y,
        workersRequired: req,
        workersAssigned: assigned,
        workersNearby: nearby,
        efficiency,
        capacity: MARKET_CAPACITY,
        total,
        slotMax: MARKET_SLOT_MAX,
        slots: { ...slots },
      };
    }

    if (ct === "lumbermill") {
      const progressMs = lumbermillProgressRef.current.get(i) ?? 0;
      const clamped = Math.max(0, Math.min(LUMBERMILL_WOOD_TIME_MS, progressMs));

      const blocked: ProductionBlockReason[] = [];
      const hasForestAdj = hasAdjacentForest(x, y);
      const nearest = findNearestWarehouseIndex(x, y);

      if (req > 0 && assigned <= 0) blocked.push("no_workers");
      if (!hasForestAdj) blocked.push("bad_placement");
      if (nearest === null) blocked.push("no_warehouse");
      else {
        const store = warehousesRef.current.get(nearest) ?? emptyEconomyState();
        if (totalStored(store) >= WAREHOUSE_CAPACITY) blocked.push("warehouse_full");
      }

      const secondsToNext =
        blocked.length === 0 && efficiency > 0
          ? Math.ceil(Math.max(0, (LUMBERMILL_WOOD_TIME_MS - clamped) / (1000 * efficiency)))
          : -1;

      return {
        kind: "lumbermill",
        x,
        y,
        workersRequired: req,
        workersAssigned: assigned,
        workersNearby: nearby,
        hasForestAdj,
        hasWarehouse: warehousesRef.current.size > 0,
        progress01: clamped / LUMBERMILL_WOOD_TIME_MS,
        efficiency,
        blocked,
        secondsToNext,
      };
    }

    if (ct === "clay_quarry") {
      const progressMs = clayQuarryProgressRef.current.get(i) ?? 0;
      const clamped = Math.max(0, Math.min(CLAY_QUARRY_TIME_MS, progressMs));

      const blocked: ProductionBlockReason[] = [];
      const nearest = findNearestWarehouseIndex(x, y);

      if (req > 0 && assigned <= 0) blocked.push("no_workers");
      if (nearest === null) blocked.push("no_warehouse");
      else {
        const store = warehousesRef.current.get(nearest) ?? emptyEconomyState();
        if (totalStored(store) >= WAREHOUSE_CAPACITY) blocked.push("warehouse_full");
      }

      const secondsToNext =
        blocked.length === 0 && efficiency > 0
          ? Math.ceil(Math.max(0, (CLAY_QUARRY_TIME_MS - clamped) / (1000 * efficiency)))
          : -1;

      return {
        kind: "clay_quarry",
        x,
        y,
        workersRequired: req,
        workersAssigned: assigned,
        workersNearby: nearby,
        progress01: clamped / CLAY_QUARRY_TIME_MS,
        efficiency,
        blocked,
        secondsToNext,
      };
    }

    // pottery
    const progressMs = potteryProgressRef.current.get(i) ?? 0;
    const clamped = Math.max(0, Math.min(POTTERY_TIME_MS, progressMs));

    const blocked: ProductionBlockReason[] = [];
    const nearest = findNearestWarehouseIndex(x, y);

    if (req > 0 && assigned <= 0) blocked.push("no_workers");
    if (nearest === null) blocked.push("no_warehouse");
    else {
      const store = warehousesRef.current.get(nearest) ?? emptyEconomyState();
      if ((store.clay ?? 0) < 4) blocked.push("no_inputs");
      if (totalStored(store) >= WAREHOUSE_CAPACITY) blocked.push("warehouse_full");
    }

    const secondsToNext =
      blocked.length === 0 && efficiency > 0 ? Math.ceil(Math.max(0, (POTTERY_TIME_MS - clamped) / (1000 * efficiency))) : -1;

    return {
      kind: "pottery",
      x,
      y,
      workersRequired: req,
      workersAssigned: assigned,
      workersNearby: nearby,
      progress01: clamped / POTTERY_TIME_MS,
      efficiency,
      blocked,
      secondsToNext,
    };
  }

  function isBlockedByTerrain(x: number, y: number): boolean {
    const i = y * gridRef.current.cols + x;
    const tv = terrainRef.current[i] ?? TERRAIN.Plain;
    return isTerrainBlockedForBuilding(tv);
  }

  function hasAdjacentForest(x: number, y: number): boolean {
    const cols = gridRef.current.cols;
    const rows = gridRef.current.rows;

    const neigh = [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ];

    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      const tv = terrainRef.current[i] ?? TERRAIN.Plain;
      if (tv === TERRAIN.Forest) return true;
    }
    return false;
  }

  // Input + placement rules (economy included)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);

    const cleanup = attachInput(
      canvas,
      () => camRef.current,
      (next) => (camRef.current = next),
      (tile: { x: number; y: number } | null) => {
        hoverRef.current = tile;
        onHoverRef.current?.(tile);

        const now = performance.now();
        const houseInfo = tile ? getHouseInfoAt(tile.x, tile.y, now) : null;
        onHouseHoverInfoRef.current?.(houseInfo);

        const buildingInfo = !houseInfo && tile ? getBuildingInfoAt(tile.x, tile.y) : null;
        onBuildingHoverInfoRef.current?.(buildingInfo);
      },
      (tile: { x: number; y: number }) => {
        const t = toolRef.current;
        const current = cellTypeAt(gridRef.current, tile.x, tile.y);

        // Tap existing house -> open inspector (unless bulldoze)
        if (current === "house" && t !== "bulldoze") {
          const info = getHouseInfoAt(tile.x, tile.y, performance.now());
          onHouseSelectRef.current?.(info);
          onBuildingSelectRef.current?.(null);
          return;
        }

        // Tap other buildings -> open inspector (unless bulldoze)
        if ((current === "warehouse" || current === "market" || current === "lumbermill" || current === "clay_quarry" || current === "pottery") && t !== "bulldoze") {
          const info = getBuildingInfoAt(tile.x, tile.y);
          onBuildingSelectRef.current?.(info);
          onHouseSelectRef.current?.(null);
          return;
        }

        if (t === "bulldoze") {
          if (current === "empty") return;

          const cost = buildCostsRef.current.bulldoze ?? 0;
          if (!trySpendRef.current(cost)) return;

          const i = tile.y * gridRef.current.cols + tile.x;

          setCell(gridRef.current, tile.x, tile.y, "empty");
          houseLevelsRef.current[i] = 0;
          houseSatisfiedSinceRef.current[i] = 0;

          if (current === "well") {
            waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);
          }

          if (current === "warehouse") warehousesRef.current.delete(i);
          if (current === "market") marketsRef.current.delete(i);
          if (current === "lumbermill") lumbermillProgressRef.current.delete(i);
          if (current === "clay_quarry") clayQuarryProgressRef.current.delete(i);
          if (current === "pottery") potteryProgressRef.current.delete(i);

          return;
        }

        if (t === "pan") return;
        if (current !== "empty") return; // no overwrite

        // Terrain restriction: block building on water/mountains/fish spots
        if (isBlockedByTerrain(tile.x, tile.y)) return;

        if (t === "house") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
            notifyKeyRef.current?.("requiresRoadAdj");
            return;
          }

          const cost = buildCostsRef.current.house ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "house");

          const i = tile.y * gridRef.current.cols + tile.x;
          houseLevelsRef.current[i] = 1;
          houseSatisfiedSinceRef.current[i] = 0;

          return;
        }

        if (t === "market") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
            notifyKeyRef.current?.("requiresRoadAdj");
            return;
          }

          const cost = buildCostsRef.current.market ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "market");
          const i = tile.y * gridRef.current.cols + tile.x;
          marketsRef.current.set(i, emptyMarketSlots());
          return;
        }

        if (t === "warehouse") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
            notifyKeyRef.current?.("requiresRoadAdj");
            return;
          }

          const cost = buildCostsRef.current.warehouse ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "warehouse");
          const i = tile.y * gridRef.current.cols + tile.x;
          warehousesRef.current.set(i, emptyEconomyState());
          return;
        }

        if (t === "lumbermill") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
            notifyKeyRef.current?.("requiresRoadAdj");
            return;
          }

          if (!hasAdjacentForest(tile.x, tile.y)) {
            notifyKeyRef.current?.("requiresForestAdj");
            return;
          }

          const cost = buildCostsRef.current.lumbermill ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "lumbermill");
          const i = tile.y * gridRef.current.cols + tile.x;
          lumbermillProgressRef.current.set(i, 0);
          return;
        }


if (t === "clay_quarry") {
  if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
    notifyKeyRef.current?.("requiresRoadAdj");
    return;
  }

  const cost = buildCostsRef.current.clay_quarry ?? 0;
  if (!trySpendRef.current(cost)) return;

  setCell(gridRef.current, tile.x, tile.y, "clay_quarry");
  const i = tile.y * gridRef.current.cols + tile.x;
  clayQuarryProgressRef.current.set(i, 0);
  return;
}

if (t === "pottery") {
  if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) {
    notifyKeyRef.current?.("requiresRoadAdj");
    return;
  }

  const cost = buildCostsRef.current.pottery ?? 0;
  if (!trySpendRef.current(cost)) return;

  setCell(gridRef.current, tile.x, tile.y, "pottery");
  const i = tile.y * gridRef.current.cols + tile.x;
  potteryProgressRef.current.set(i, 0);
  return;
}

        if (t === "road") {
          const cost = buildCostsRef.current.road ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "road");
          return;
        }

        if (t === "well") {
          const cost = buildCostsRef.current.well ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "well");
          waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);
          return;
        }
      },
      world.tile
    );

    return cleanup;
  }, [world.tile]);

  // Simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = w;
    canvas.height = h;

    let raf = 0;
    let lastStatsAt = 0;
    let lastMinimapAt = 0;
    let lastEconomyPushAt = 0;

    const loop = () => {
      const now = performance.now();

      // Economy fixed-step: 1s ticks for deterministic-ish behavior.
      if (lastEcoFrameAtRef.current === null) lastEcoFrameAtRef.current = now;
      const ecoDt = now - (lastEcoFrameAtRef.current ?? now);
      lastEcoFrameAtRef.current = now;
      ecoCarryMsRef.current += ecoDt;

      while (ecoCarryMsRef.current >= 1000) {
        ecoCarryMsRef.current -= 1000;

        // Keep building state maps consistent even if something changes in grid
        syncBuildingStateFromGrid();

        // Recompute workforce (shared pool) - affects production speed
        recomputeWorkforce(now);

        const cells = gridRef.current.cells;
        const cols = gridRef.current.cols;

        // Production: Lumbermill -> nearest Warehouse (1 wood per 60s), stopped without warehouse/forest or if warehouse is full
        for (let idx = 0; idx < cells.length; idx++) {
          if (cells[idx] !== 6) continue; // lumbermill

          const x = idx % cols;
          const y = (idx / cols) | 0;

          const hasForestAdj = hasAdjacentForest(x, y);
          const nearest = findNearestWarehouseIndex(x, y);
          const store = nearest !== null ? warehousesRef.current.get(nearest) ?? emptyEconomyState() : null;

          const v = gridRef.current.cells[idx] ?? 0;
          const req = requiredWorkersForCell(v);
          const assigned = workersAssignedRef.current.get(idx) ?? 0;
          const efficiency = req > 0 ? Math.min(1, assigned / req) : 1;

          const prev = lumbermillProgressRef.current.get(idx) ?? 0;

          const res = stepProduction({
            dtMs: 1000,
            progressMs: prev,
            efficiency,
            recipe: LUMBERMILL_RECIPE,
            placementOk: hasForestAdj,
            warehouse: store,
            capacity: WAREHOUSE_CAPACITY,
          });

          if (nearest !== null && res.nextWarehouse) {
            warehousesRef.current.set(nearest, res.nextWarehouse);
          }

          lumbermillProgressRef.current.set(idx, res.nextProgressMs);
        }

        // Production: Clay Quarry -> nearest Warehouse (1 clay per 120s)
        for (let idx = 0; idx < cells.length; idx++) {
          if (cells[idx] !== 7) continue; // clay quarry

          const x = idx % cols;
          const y = (idx / cols) | 0;

          const nearest = findNearestWarehouseIndex(x, y);
          const store = nearest !== null ? warehousesRef.current.get(nearest) ?? emptyEconomyState() : null;

          const v = gridRef.current.cells[idx] ?? 0;
          const req = requiredWorkersForCell(v);
          const assigned = workersAssignedRef.current.get(idx) ?? 0;
          const efficiency = req > 0 ? Math.min(1, assigned / req) : 1;

          const prev = clayQuarryProgressRef.current.get(idx) ?? 0;

          const res = stepProduction({
            dtMs: 1000,
            progressMs: prev,
            efficiency,
            recipe: CLAY_QUARRY_RECIPE,
            placementOk: true,
            warehouse: store,
            capacity: WAREHOUSE_CAPACITY,
          });

          if (nearest !== null && res.nextWarehouse) {
            warehousesRef.current.set(nearest, res.nextWarehouse);
          }

          clayQuarryProgressRef.current.set(idx, res.nextProgressMs);
        }

        // Production: Pottery -> nearest Warehouse (4 clay -> 1 pottery per 270s)
        for (let idx = 0; idx < cells.length; idx++) {
          if (cells[idx] !== 8) continue; // pottery

          const x = idx % cols;
          const y = (idx / cols) | 0;

          const nearest = findNearestWarehouseIndex(x, y);
          const store = nearest !== null ? warehousesRef.current.get(nearest) ?? emptyEconomyState() : null;

          const v = gridRef.current.cells[idx] ?? 0;
          const req = requiredWorkersForCell(v);
          const assigned = workersAssignedRef.current.get(idx) ?? 0;
          const efficiency = req > 0 ? Math.min(1, assigned / req) : 1;

          const prev = potteryProgressRef.current.get(idx) ?? 0;

          const res = stepProduction({
            dtMs: 1000,
            progressMs: prev,
            efficiency,
            recipe: POTTERY_RECIPE,
            placementOk: true,
            warehouse: store,
            capacity: WAREHOUSE_CAPACITY,
          });

          if (nearest !== null && res.nextWarehouse) {
            warehousesRef.current.set(nearest, res.nextWarehouse);
          }

          potteryProgressRef.current.set(idx, res.nextProgressMs);
        }

        // Update HUD economy as sum of all warehouses
        const sum = emptyEconomyState();
        for (const store of warehousesRef.current.values()) {
          sum.wood += store.wood ?? 0;
          sum.clay += store.clay ?? 0;
          sum.grain += store.grain ?? 0;
          sum.meat += store.meat ?? 0;
          sum.fish += store.fish ?? 0;
          sum.pottery += store.pottery ?? 0;
        }
        economyRef.current = sum;
      }

      walkersRef.current = ensureWaterCarriersForHouses(gridRef.current, waterPotentialRef.current, walkersRef.current, now);
      walkersRef.current = ensureMarketLadiesForMarkets(gridRef.current, walkersRef.current, now);

      walkersRef.current = stepWalkers(gridRef.current, walkersRef.current, now, {
        waterExpiry: waterExpiryRef.current,
        foodExpiry: foodExpiryRef.current,
      });

      stepHouseEvolution(
        gridRef.current,
        waterPotentialRef.current,
        waterExpiryRef.current,
        foodExpiryRef.current,
        houseLevelsRef.current,
        houseSatisfiedSinceRef.current,
        now
      );

      if (onStatsRef.current && now - lastStatsAt >= 500) {
        lastStatsAt = now;
        const s = computeCityStats(
          gridRef.current,
          waterPotentialRef.current,
          waterExpiryRef.current,
          foodExpiryRef.current,
          houseLevelsRef.current,
          now
        );
        onStatsRef.current(s);
      }

      if (onEconomyRef.current && now - lastEconomyPushAt >= 500) {
        lastEconomyPushAt = now;
        onEconomyRef.current({ ...economyRef.current });
      }

      if (onMinimapRef.current && now - lastMinimapAt >= 250) {
        lastMinimapAt = now;
        onMinimapRef.current({
          cols: gridRef.current.cols,
          rows: gridRef.current.rows,
          cells: gridRef.current.cells.slice(),
          tileSize: world.tile,
          cam: { ...camRef.current },
          viewW: w,
          viewH: h,
          terrain: terrainRef.current,
        });
      }

      render(
        ctx,
        w,
        h,
        camRef.current,
        world,
        terrainRef.current,
        gridRef.current,
        hoverRef.current,
        waterPotentialRef.current,
        waterExpiryRef.current,
        foodExpiryRef.current,
        houseLevelsRef.current,
        now,
        walkersRef.current,
        spritesRef.current
      );

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, h, world]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100vw", height: "100vh", touchAction: "none" }} />;
}