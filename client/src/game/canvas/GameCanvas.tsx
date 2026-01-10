import { useEffect, useMemo, useRef } from "react";
import { useCanvasSize } from "./useCanvasSize";
import { render, type WorldConfig } from "./render";
import { attachInput } from "./input";
import type { Camera } from "./camera";
import { clamp } from "./camera";
import { cellTypeAt, hasAdjacentRoad, type CityStats, type Grid, type HouseInfo, type Tool, setCell } from "../types";
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
import { generateTerrain, isTerrainBlockedForBuilding, TERRAIN } from "../map/terrain";
import { loadSprites } from "../sprites/loader";
import type { SpriteSet } from "../sprites/types";

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
  onStats?: (stats: CityStats) => void;

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
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const camInitializedRef = useRef(false);

  const toolRef = useRef<Tool>(props.tool);
  const onHoverRef = useRef<typeof props.onHover>(props.onHover);
  const onHouseHoverInfoRef = useRef<typeof props.onHouseHoverInfo>(props.onHouseHoverInfo);
  const onHouseSelectRef = useRef<typeof props.onHouseSelect>(props.onHouseSelect);
  const onStatsRef = useRef<typeof props.onStats>(props.onStats);
  const onMinimapRef = useRef<typeof props.onMinimap>(props.onMinimap);

  const buildCostsRef = useRef<Record<Tool, number>>(props.buildCosts);
  const trySpendRef = useRef<(amount: number) => boolean>(props.trySpend);

  useEffect(() => void (toolRef.current = props.tool), [props.tool]);
  useEffect(() => void (onHoverRef.current = props.onHover), [props.onHover]);
  useEffect(() => void (onHouseHoverInfoRef.current = props.onHouseHoverInfo), [props.onHouseHoverInfo]);
  useEffect(() => void (onHouseSelectRef.current = props.onHouseSelect), [props.onHouseSelect]);
  useEffect(() => void (onStatsRef.current = props.onStats), [props.onStats]);
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

  function isBlockedByTerrain(x: number, y: number): boolean {
    const i = y * gridRef.current.cols + x;
    const tv = terrainRef.current[i] ?? TERRAIN.Plain;
    return isTerrainBlockedForBuilding(tv);
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
        const info = tile ? getHouseInfoAt(tile.x, tile.y, now) : null;
        onHouseHoverInfoRef.current?.(info);
      },
      (tile: { x: number; y: number }) => {
        const t = toolRef.current;
        const current = cellTypeAt(gridRef.current, tile.x, tile.y);

        // Tap existing house -> open inspector (unless bulldoze)
        if (current === "house" && t !== "bulldoze") {
          const info = getHouseInfoAt(tile.x, tile.y, performance.now());
          onHouseSelectRef.current?.(info);
          return;
        }

        if (t === "bulldoze") {
          if (current === "empty") return;

          const cost = buildCostsRef.current.bulldoze ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "empty");

          const i = tile.y * gridRef.current.cols + tile.x;
          houseLevelsRef.current[i] = 0;
          houseSatisfiedSinceRef.current[i] = 0;

          if (current === "well") {
            waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);
          }

          return;
        }

        if (t === "pan") return;
        if (current !== "empty") return; // no overwrite

        // Terrain restriction: block building on water/mountains/fish spots
        if (isBlockedByTerrain(tile.x, tile.y)) return;

        if (t === "house") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;

          const cost = buildCostsRef.current.house ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "house");

          const i = tile.y * gridRef.current.cols + tile.x;
          houseLevelsRef.current[i] = 1;
          houseSatisfiedSinceRef.current[i] = 0;

          return;
        }

        if (t === "market") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;

          const cost = buildCostsRef.current.market ?? 0;
          if (!trySpendRef.current(cost)) return;

          setCell(gridRef.current, tile.x, tile.y, "market");
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

    const loop = () => {
      const now = performance.now();

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
