import type { Camera } from "./camera";
import { clamp } from "./camera";

type DragState = {
  active: boolean;
  startX: number;
  startY: number;
  camX: number;
  camY: number;
  moved: boolean;
};

export function attachInput(
  canvas: HTMLCanvasElement,
  getCam: () => Camera,
  setCam: (c: Camera) => void,
  onHoverTile: (tile: { x: number; y: number } | null) => void,
  onTapTile: (tile: { x: number; y: number }) => void,
  tileSize: number
) {
  const drag: DragState = { active: false, startX: 0, startY: 0, camX: 0, camY: 0, moved: false };

  const toTile = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cam = getCam();
    const wx = cam.x + sx / cam.zoom;
    const wy = cam.y + sy / cam.zoom;
    return { x: Math.floor(wx / tileSize), y: Math.floor(wy / tileSize) };
  };

  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    drag.active = true;
    drag.moved = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    const cam = getCam();
    drag.camX = cam.x;
    drag.camY = cam.y;
  };

  const onPointerMove = (e: PointerEvent) => {
    onHoverTile(toTile(e.clientX, e.clientY));

    if (!drag.active) return;

    const cam = getCam();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;

    setCam({ ...cam, x: drag.camX - dx / cam.zoom, y: drag.camY - dy / cam.zoom });
  };

  const onPointerUp = (e: PointerEvent) => {
    const tile = toTile(e.clientX, e.clientY);
    const wasTap = drag.active && !drag.moved;
    drag.active = false;

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}

    if (wasTap) onTapTile(tile);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const cam = getCam();
    const zoom = clamp(cam.zoom - e.deltaY * 0.001, 0.6, 2.2);
    setCam({ ...cam, zoom });
  };

  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
  };
}
