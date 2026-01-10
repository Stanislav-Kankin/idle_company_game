export type SpriteId =
  | "road"
  | "house_l1"
  | "house_l2"
  | "house_l3"
  | "well"
  | "market"
  | "walker_water"
  | "walker_food";

export type Sprite = {
  img: CanvasImageSource;
  w: number;
  h: number;
};

export type SpriteSet = Partial<Record<SpriteId, Sprite>>;
