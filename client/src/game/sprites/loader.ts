import { SPRITE_FILES } from "./registry";
import type { Sprite, SpriteId, SpriteSet } from "./types";

/**
 * Load sprites from `client/src/assets/sprites/` via Vite.
 *
 * We use import.meta.glob with `?url` so that:
 * - dev server serves correct URLs
 * - build output uses hashed asset filenames for long-term caching
 *
 * Sprites are optional:
 * - if a sprite file is missing, it will be skipped and renderer will use fallback drawings.
 */
const ALL_SPRITE_URLS = import.meta.glob("../../assets/sprites/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function findUrlByFilename(filename: string): string | null {
  const suffix = "/" + filename;
  for (const [path, url] of Object.entries(ALL_SPRITE_URLS)) {
    if (path.endsWith(suffix)) return url;
  }
  return null;
}

function loadImage(url: string): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load sprite: " + url));
    img.src = url;
  });
}

export async function loadSprites(): Promise<SpriteSet> {
  const out: SpriteSet = {};

  const entries = Object.entries(SPRITE_FILES) as Array<[SpriteId, string]>;
  const jobs = entries.map(async ([id, filename]) => {
    const url = findUrlByFilename(filename);
    if (!url) return;

    try {
      const loaded = await loadImage(url);
      const sprite: Sprite = loaded;
      out[id] = sprite;
    } catch {
      // skip (fallback render)
    }
  });

  await Promise.all(jobs);
  return out;
}
