export type SpriteId =
  | "road"
  | "house_l1"
  | "house_l2"
  | "house_l3"
  | "well"
  | "market"
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
