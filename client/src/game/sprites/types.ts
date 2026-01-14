export type SpriteId =
  | "road"
  | "road_0"
  | "road_1"
  | "road_2"
  | "road_3"
  | "road_4"
  | "road_5"
  | "road_6"
  | "road_7"
  | "road_8"
  | "road_9"
  | "road_10"
  | "road_11"
  | "road_12"
  | "road_13"
  | "road_14"
  | "road_15"
  | "terrain_water"
  | "terrain_fish"
  | "terrain_forest"
  | "terrain_mountain"
  | "house_l1"
  | "house_l2"
  | "house_l3"
  | "well"
  | "market"
  | "warehouse"
  | "lumbermill"
  | "clay_quarry"
  | "pottery"
  | "furniture_factory"
  | "farm_chicken"
  | "farm_pig"
  | "farm_fish"
  | "farm_cow"
  | "walker_water"
  | "walker_food";

export type SpriteFrame = {
  img: CanvasImageSource;
  w: number;
  h: number;
};

export type SpriteEntry = {
  frames: SpriteFrame[];
  /** Frame duration in ms for animated sprites. If omitted, sprite is static. */
  frameMs?: number;

  /**
   * Pivot point (in pixels) within the image.
   * The renderer maps (pivotX, pivotY) to the chosen world anchor.
   */
  pivotX: number;
  pivotY: number;
};

export type SpriteSet = Partial<Record<SpriteId, SpriteEntry>>;
