import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasSize } from "./useCanvasSize";
import { render, type WorldConfig } from "./render";
import { attachInput } from "./input";
import type { Camera } from "./camera";
import { cellTypeAt, hasAdjacentRoad, type Grid, type Tool, setCell } from "../types";
import {
  computeWellWaterPotential,
  ensureWaterCarriersForHouses,
  stepWalkers,
  type Walker,
} from "../sim/sim";

export function GameCanvas(props: {
  tool: Tool;
  onHover?: (tile: { x: number; y: number } | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w, h } = useCanvasSize();

  const world: WorldConfig = useMemo(() => ({ tile: 32, cols: 80, rows: 60 }), []);

  const gridRef = useRef<Grid>({
    cols: world.cols,
    rows: world.rows,
    cells: new Uint8Array(world.cols * world.rows),
  });

  // Service highlight (walker-based, time-limited)
  const waterExpiryRef = useRef<Float64Array>(new Float64Array(world.cols * world.rows));

  // Base availability (well radius-based, deterministic)
  const waterPotentialRef = useRef<Uint8Array>(new Uint8Array(world.cols * world.rows));

  const walkersRef = useRef<Walker[]>([]);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  const toolRef = useRef<Tool>(props.tool);
  const onHoverRef = useRef<typeof props.onHover>(props.onHover);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    toolRef.current = props.tool;
  }, [props.tool]);

  useEffect(() => {
    onHoverRef.current = props.onHover;
  }, [props.onHover]);

  useEffect(() => {
    camRef.current = {
      x: (world.cols * world.tile) / 2 - w / 2,
      y: (world.rows * world.tile) / 2 - h / 2,
      zoom: 1,
    };

    // initial well -> water potential layer (radius=3, Manhattan)
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
      (next) => {
        camRef.current = next;
      },
      (tile) => {
        hoverRef.current = tile;
        onHoverRef.current?.(tile);
      },
      (tile: { x: number; y: number }) => {
        const t = toolRef.current;

        // Rules:
        //  - no overwrite (except bulldoze)
        //  - house requires adjacent road
        const current = cellTypeAt(gridRef.current, tile.x, tile.y);

        if (t === "bulldoze") {
          if (current === "empty") return;

          setCell(gridRef.current, tile.x, tile.y, "empty");

          // recompute only if we removed a well (water depends on wells)
          if (current === "well") {
            waterPotentialRef.current = computeWellWaterPotential(gridRef.current, 3);
          }

          setVersion((v) => v + 1);
          return;
        }

        if (t === "pan") return;

        // no overwrite
        if (current !== "empty") return;

        if (t === "house") {
          if (!hasAdjacentRoad(gridRef.current, tile.x, tile.y)) return;
          setCell(gridRef.current, tile.x, tile.y, "house");
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

      // Walkers are attached to ELIGIBLE houses (road + water potential)
      walkersRef.current = ensureWaterCarriersForHouses(
        gridRef.current,
        waterPotentialRef.current,
        walkersRef.current,
        now
      );

      walkersRef.current = stepWalkers(gridRef.current, walkersRef.current, now, waterExpiryRef.current, {
        moveEveryMs: 450,
        waterDurationMs: 12_000,
      });

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
