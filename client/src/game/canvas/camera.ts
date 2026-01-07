export type Camera = {
  x: number; // world top-left in pixels
  y: number;
  zoom: number;
};

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
