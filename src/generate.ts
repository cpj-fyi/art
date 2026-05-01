import { Hash } from "./hash";
import { composeLayers } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { paletteFor } from "./palettes";
import type { PostMetadata } from "./types";
import { CANVAS } from "./types";

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const palette = paletteFor(meta.primaryTag);
  const layers = composeLayers(hash, meta);
  const marks = layers.flatMap((l) =>
    runStrategy(l.strategy, {
      hash,
      canvas: CANVAS,
      mark: l.mark,
      palette: l.palette,
      density: l.density,
      cellSize: l.cellSize,
    })
  );
  return renderSvg({ bg: palette.bg, marks });
}
