import type { SpriteId } from "./types";

/**
 * Sprite registry.
 *
 * IMPORTANT:
 * - Put actual .png files into: client/src/assets/sprites/
 * - File names must match the mapping below.
 *
 * Vite will fingerprint (hash) these assets in build output, but we access them via
 * generated URLs (import.meta.glob + ?url), so caching works well and paths stay correct.
 */
export const SPRITE_FILES: Record<SpriteId, string> = {
  road: "road.png",

  house_l1: "house_l1.png",
  house_l2: "house_l2.png",
  house_l3: "house_l3.png",

  well: "well.png",
  market: "market.png",

  walker_water: "walker_water.png",
  walker_food: "walker_food.png",
};
