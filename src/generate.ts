import { Hash } from "./hash";
import { composeLayers } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { selectPalette } from "./palettes";
import type { PostMetadata } from "./types";
import { CANVAS } from "./types";

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const { bg, colors } = selectPalette(meta.primaryTag, hash);
  const layers = composeLayers(hash, meta, colors);
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
  return renderSvg({ bg, marks });
}
