import { SPRITE_DEFS } from "./registry";
import type { SpriteEntry, SpriteFrame, SpriteId, SpriteSet } from "./types";

/**
 * Load sprites from `client/src/assets/sprites/` via Vite.
 *
 * We use import.meta.glob with `?url` so that:
 * - dev server serves correct URLs
 * - build output uses hashed asset filenames for long-term caching
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

function loadImage(url: string): Promise<SpriteFrame> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load sprite: " + url));
    img.src = url;
  });
}

async function loadFrames(files: string[]): Promise<SpriteFrame[]> {
  const frames: SpriteFrame[] = [];
  for (const filename of files) {
    const url = findUrlByFilename(filename);
    if (!url) continue;
    try {
      frames.push(await loadImage(url));
    } catch {
      // skip
    }
  }
  return frames;
}

export async function loadSprites(): Promise<SpriteSet> {
  const out: SpriteSet = {};

  const entries = Object.entries(SPRITE_DEFS) as Array<[SpriteId, (typeof SPRITE_DEFS)[SpriteId]]>;

  await Promise.all(
    entries.map(async ([id, def]) => {
      const frames = await loadFrames(def.files);
      if (frames.length === 0) return;

      const entry: SpriteEntry = {
        frames,
        frameMs: def.frameMs,
        pivotX: def.pivotX,
        pivotY: def.pivotY,
      };

      out[id] = entry;
    })
  );

  return out;
}
