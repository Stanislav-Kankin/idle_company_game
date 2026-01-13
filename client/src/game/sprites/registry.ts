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

  // 16-tile autotiling road set (mask bits: N=1, E=2, S=4, W=8).
  road_0: { files: ["road_0.png"], pivotX: 16, pivotY: 16 },
  road_1: { files: ["road_1.png"], pivotX: 16, pivotY: 16 },
  road_2: { files: ["road_2.png"], pivotX: 16, pivotY: 16 },
  road_3: { files: ["road_3.png"], pivotX: 16, pivotY: 16 },
  road_4: { files: ["road_4.png"], pivotX: 16, pivotY: 16 },
  road_5: { files: ["road_5.png"], pivotX: 16, pivotY: 16 },
  road_6: { files: ["road_6.png"], pivotX: 16, pivotY: 16 },
  road_7: { files: ["road_7.png"], pivotX: 16, pivotY: 16 },
  road_8: { files: ["road_8.png"], pivotX: 16, pivotY: 16 },
  road_9: { files: ["road_9.png"], pivotX: 16, pivotY: 16 },
  road_10: { files: ["road_10.png"], pivotX: 16, pivotY: 16 },
  road_11: { files: ["road_11.png"], pivotX: 16, pivotY: 16 },
  road_12: { files: ["road_12.png"], pivotX: 16, pivotY: 16 },
  road_13: { files: ["road_13.png"], pivotX: 16, pivotY: 16 },
  road_14: { files: ["road_14.png"], pivotX: 16, pivotY: 16 },
  road_15: { files: ["road_15.png"], pivotX: 16, pivotY: 16 },

  // Buildings are taller than a tile and are anchored to tile bottom-center.
  house_l1: { files: ["house_l1.png"], pivotX: 16, pivotY: 47 },
  house_l2: { files: ["house_l2.png"], pivotX: 16, pivotY: 47 },
  house_l3: { files: ["house_l3.png"], pivotX: 16, pivotY: 47 },

  well: { files: ["well.png"], pivotX: 16, pivotY: 47 },
  market: { files: ["market.png"], pivotX: 16, pivotY: 47 },

  warehouse: { files: ["warehouse.png"], pivotX: 16, pivotY: 47 },
  lumbermill: { files: ["lumbermill.png"], pivotX: 16, pivotY: 47 },

  // Walkers: 2-frame simple walk cycle (files exist in repo).
  walker_water: { files: ["walker_water_0.png", "walker_water_1.png"], frameMs: 160, pivotX: 16, pivotY: 28 },
  walker_food: { files: ["walker_food_0.png", "walker_food_1.png"], frameMs: 160, pivotX: 16, pivotY: 28 },
};
