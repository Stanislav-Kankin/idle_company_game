import { useEffect, useMemo, useRef, useState } from "react";
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
  MARKET_RADIUS,
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

  // houses state
  const houseLevelsRef = useRef<Uint8Array>(new Uint8Array(world.cols * world.rows)); // 0=none, 1..3
  const houseSatisfiedSinceRef = useRef<Float64Array>(new Float64Array(world.cols * world.rows)); // ms (performance.now)

  const walkersRef = useRef<Walker[]>([]);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  const toolRef = useRef<Tool>(props.tool);
  const onHoverRef = useRef<typeof props.onHover>(props.onHover);
  const onHouseHoverInfoRef = useRef<typeof props.onHouseHoverInfo>(props.onHouseHoverInfo);
  const onHouseSelectRef = useRef<typeof props.onHouseSelect>(props.onHouseSelect);
  const onStatsRef = useRef<typeof props.onStats>(props.onStats);

  const [version, setVersion] = useState(0);

  useEffect(() => void (toolRef.current = props.tool), [props.tool]);
  useEffect(() => void (onHoverRef.current = props.onHover), [props.onHover]);
  useEffect(() => void (onHouseHoverInfoRef.current = props.onHouseHoverInfo), [props.onHouseHoverInfo]);
  useEffect(() => void (onHouseSelectRef.current = props.onHouseSelect), [props.onHouseSelect]);
  useEffect(() => void (onStatsRef.current = props.onStats), [props.onStats]);

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

  useEffect(() => {
    camRef.current = {
      x: (world.cols * world.tile) / 2 - w / 2,
      y: (world.rows * world.tile) / 2 - h / 2,
      zoom: 1,
    };

    // fixed radiuses
    waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);

    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cleanup = attachInput(
      canvas,
      () => camRef.current,
      (next) => (camRef.current = next),
      (tile) => {
        hoverRef.current = tile;
        onHoverRef.current?.(tile);

        const now = performance.now();
        const info = tile ? getHouseInfoAt(tile.x, tile.y, now) : null;
        onHouseHoverInfoRef.current?.(info);
      },
      (tile) => {
        const t = toolRef.current;
        const current = cellTypeAt(gridRef.current, tile.x, tile.y);

        // If user taps/clicks on an existing house (and not bulldozing) -> open inspector (mobile-friendly)
        if (current === "house" && t !== "bulldoze") {
          const info = getHouseInfoAt(tile.x, tile.y, performance.now());
          onHouseSelectRef.current?.(info);
          return;
        }

        if (t === "bulldoze") {
          if (current === "empty") return;

          setCell(gridRef.current, tile.x, tile.y, "empty");

          const i = tile.y * gridRef.current.cols + tile.x;
          houseLevelsRef.current[i] = 0;
          houseSatisfiedSinceRef.current[i] = 0;

          if (current === "well") {
            waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);
          }

          setVersion((v) => v + 1);
          return;
        }

        if (t === "pan") return;
        if (current !== "empty") return; // no overwrite

        if (t === "house") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;
          setCell(gridRef.current, tile.x, tile.y, "house");

          const i = tile.y * gridRef.current.cols + tile.x;
          houseLevelsRef.current[i] = 1;
          houseSatisfiedSinceRef.current[i] = 0;

          setVersion((v) => v + 1);
          return;
        }

        if (t === "market") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;
          setCell(gridRef.current, tile.x, tile.y, "market");
          setVersion((v) => v + 1);
          return;
        }

        if (t === "road") {
          setCell(gridRef.current, tile.x, tile.y, "road");
          setVersion((v) => v + 1);
          return;
        }

        if (t === "well") {
          setCell(gridRef.current, tile.x, tile.y, "well");
          waterPotentialRef.current = computeWellWaterPotential(gridRef.current, WELL_RADIUS);
          setVersion((v) => v + 1);
          return;
        }
      },
      world.tile
    );

    return cleanup;
  }, [world.tile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let lastStatsAt = 0;

    const loop = () => {
      const now = performance.now();

      walkersRef.current = ensureWaterCarriersForHouses(gridRef.current, waterPotentialRef.current, walkersRef.current, now);
      walkersRef.current = ensureMarketLadiesForMarkets(gridRef.current, walkersRef.current, now);

      walkersRef.current = stepWalkers(
        gridRef.current,
        walkersRef.current,
        now,
        { waterExpiry: waterExpiryRef.current, foodExpiry: foodExpiryRef.current },
        { moveEveryMs: 450, waterDurationMs: 12_000, foodDurationMs: 12_000 }
      );

      // evolution: needs water+food service delivered (not just potential)
      stepHouseEvolution(
        gridRef.current,
        waterPotentialRef.current,
        waterExpiryRef.current,
        foodExpiryRef.current,
        houseLevelsRef.current,
        houseSatisfiedSinceRef.current,
        now,
        { upgradeDelayMs: 10_000 }
      );

      // stats: compute every ~500ms (cheap & stable)
      if (onStatsRef.current && now - lastStatsAt >= 500) {
        lastStatsAt = now;
        const stats = computeCityStats(
          gridRef.current,
          waterPotentialRef.current,
          waterExpiryRef.current,
          foodExpiryRef.current,
          houseLevelsRef.current,
          now
        );
        onStatsRef.current(stats);
      }

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
  }, [w, h, world, version]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100vw", height: "100vh", touchAction: "none" }} />;
}
