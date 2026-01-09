import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasSize } from "./useCanvasSize";
import { render, type WorldConfig } from "./render";
import { attachInput } from "./input";
import type { Camera } from "./camera";
import { cellTypeAt, hasAdjacentRoad, type Grid, type Tool, setCell } from "../types";
import {
  computeWellWaterPotential,
  ensureMarketLadiesForMarkets,
  ensureWaterCarriersForHouses,
  stepWalkers,
  type Walker,
} from "../sim/sim";

export function GameCanvas(props: { tool: Tool; onHover?: (tile: { x: number; y: number } | null) => void }) {
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

  const walkersRef = useRef<Walker[]>([]);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  const toolRef = useRef<Tool>(props.tool);
  const onHoverRef = useRef<typeof props.onHover>(props.onHover);

  const [version, setVersion] = useState(0);

  useEffect(() => void (toolRef.current = props.tool), [props.tool]);
  useEffect(() => void (onHoverRef.current = props.onHover), [props.onHover]);

  useEffect(() => {
    camRef.current = {
      x: (world.cols * world.tile) / 2 - w / 2,
      y: (world.rows * world.tile) / 2 - h / 2,
      zoom: 1,
    };

    waterPotentialRef.current = computeWellWaterPotential(gridRef.current, 3);
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
      },
      (tile) => {
        const t = toolRef.current;
        const current = cellTypeAt(gridRef.current, tile.x, tile.y);

        if (t === "bulldoze") {
          if (current === "empty") return;

          setCell(gridRef.current, tile.x, tile.y, "empty");
          if (current === "well") waterPotentialRef.current = computeWellWaterPotential(gridRef.current, 3);

          setVersion((v) => v + 1);
          return;
        }

        if (t === "pan") return;
        if (current !== "empty") return; // no overwrite

        if (t === "house") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;
          setCell(gridRef.current, tile.x, tile.y, "house");
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
          waterPotentialRef.current = computeWellWaterPotential(gridRef.current, 3);
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

    const loop = () => {
      const now = performance.now();

      walkersRef.current = ensureWaterCarriersForHouses(
        gridRef.current,
        waterPotentialRef.current,
        walkersRef.current,
        now
      );

      walkersRef.current = ensureMarketLadiesForMarkets(gridRef.current, walkersRef.current, now);

      walkersRef.current = stepWalkers(
        gridRef.current,
        walkersRef.current,
        now,
        { waterExpiry: waterExpiryRef.current, foodExpiry: foodExpiryRef.current },
        { moveEveryMs: 450, waterDurationMs: 12_000, foodDurationMs: 12_000 }
      );

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
