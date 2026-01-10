import type { SpriteId } from "./types";

export type SpriteDef = {
  files: string[]; // 1 file = static, N files = animation frames
  frameMs?: number;
  pivotX: number;
  pivotY: number;
};

/**
 * Sprite registry.
 *
 * Put .png files into: client/src/assets/sprites/
 *
 * We keep sprites OPTIONAL:
 * - if a sprite file is missing, it will be skipped and renderer will use fallback drawings.
 */
export const SPRITE_DEFS: Record<SpriteId, SpriteDef> = {
  // Road sprite is optional; current renderer uses procedural roads for a continuous look.
  road: { files: ["road.png"], pivotX: 16, pivotY: 16 },

  // Buildings are taller than a tile and are anchored to tile bottom-center.
  house_l1: { files: ["house_l1.png"], pivotX: 16, pivotY: 47 },
  house_l2: { files: ["house_l2.png"], pivotX: 16, pivotY: 47 },
  house_l3: { files: ["house_l3.png"], pivotX: 16, pivotY: 47 },

  well: { files: ["well.png"], pivotX: 16, pivotY: 47 },
  market: { files: ["market.png"], pivotX: 16, pivotY: 47 },

  // Walkers: 2-frame simple walk cycle (files exist in repo).
  walker_water: { files: ["walker_water_0.png", "walker_water_1.png"], frameMs: 160, pivotX: 16, pivotY: 28 },
  walker_food: { files: ["walker_food_0.png", "walker_food_1.png"], frameMs: 160, pivotX: 16, pivotY: 28 },
};
