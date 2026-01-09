import { useEffect, useMemo, useRef } from "react";
import { useCanvasSize } from "./useCanvasSize";
import { render, type WorldConfig } from "./render";
import { attachInput } from "./input";
import type { Camera } from "./camera";
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

export function GameCanvas(props: {
  tool: Tool;
  onHover?: (tile: { x: number; y: number } | null) => void;

  // inspector / stats callbacks
  onHouseHoverInfo?: (info: HouseInfo | null) => void;
  onHouseSelect?: (info: HouseInfo | null) => void;
  onStats?: (stats: CityStats) => void;

  // economy (UI-owned for now)
  buildCosts: Record<Tool, number>;
  trySpend: (amount: number) => boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useCanvasSize();

  const world: WorldConfig = useMemo(() => ({ tile: 32, cols: 80, rows: 60 }), []);

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

  const buildCostsRef = useRef<Record<Tool, number>>(props.buildCosts);
  const trySpendRef = useRef<(amount: number) => boolean>(props.trySpend);

  useEffect(() => void (toolRef.current = props.tool), [props.tool]);
  useEffect(() => void (onHoverRef.current = props.onHover), [props.onHover]);
  useEffect(() => void (onHouseHoverInfoRef.current = props.onHouseHoverInfo), [props.onHouseHoverInfo]);
  useEffect(() => void (onHouseSelectRef.current = props.onHouseSelect), [props.onHouseSelect]);
  useEffect(() => void (onStatsRef.current = props.onStats), [props.onStats]);
  useEffect(() => void (buildCostsRef.current = props.buildCosts), [props.buildCosts]);
  useEffect(() => void (trySpendRef.current = props.trySpend), [props.trySpend]);

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

  // Input + placement rules (economy included)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // initial potential (even if no wells yet)
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

        // tap existing house -> open inspector (unless bulldoze)
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

    // render.ts works in CSS pixels, keep canvas same size
    canvas.width = w;
    canvas.height = h;

    let raf = 0;
    let lastStatsAt = 0;

    const loop = () => {
      const now = performance.now();

      // ensure & cleanup walkers (NOTE: these functions return the filtered array)
      walkersRef.current = ensureWaterCarriersForHouses(
        gridRef.current,
        waterPotentialRef.current,
        walkersRef.current,
        now
      );
      walkersRef.current = ensureMarketLadiesForMarkets(gridRef.current, walkersRef.current, now);

      // step walkers (food/water service)
      walkersRef.current = stepWalkers(
        gridRef.current,
        walkersRef.current,
        now,
        { waterExpiry: waterExpiryRef.current, foodExpiry: foodExpiryRef.current }
      );

      // house leveling
      stepHouseEvolution(
        gridRef.current,
        waterPotentialRef.current,
        waterExpiryRef.current,
        foodExpiryRef.current,
        houseLevelsRef.current,
        houseSatisfiedSinceRef.current,
        now
      );

      // stats ~2 times/sec
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

      // render (IMPORTANT: order matches render.ts signature)
      render(
        ctx,
        w,
        h,
        camRef.current,
        world,
        gridRef.current,
        hoverRef.current,
        waterPotentialRef.current,
        waterExpiryRef.current,
        foodExpiryRef.current,
        houseLevelsRef.current,
        now,
        walkersRef.current
      );

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w, h, world]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100vw", height: "100vh", touchAction: "none" }} />;
}
