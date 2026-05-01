import { Hash } from "./hash";
import { composePanels } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { selectPalette } from "./palettes";
import type { MarkInstance, PostMetadata } from "./types";

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const { bg, colors } = selectPalette(meta.primaryTag, hash);
  const panels = composePanels(hash, meta, colors);

  const marks: MarkInstance[] = panels.flatMap((p) => {
    const panelMarks = runStrategy(p.strategy, {
      hash,
      canvas: { width: p.width, height: p.height },
      mark: p.mark,
      palette: p.palette,
      density: p.density,
      cellSize: p.cellSize,
    });
    // Translate panel-local marks to absolute canvas coords AND clip to panel bounds.
    // Note: this simple origin-filter drops marks whose top-left is outside the panel;
    // marks with origin inside but extending beyond may still poke out slightly (v1 acceptable).
    return panelMarks
      .map((m) => ({ ...m, x: m.x + p.x, y: m.y + p.y }))
      .filter((m) => m.x >= p.x && m.y >= p.y &&
                     m.x < p.x + p.width && m.y < p.y + p.height);
  });

  return renderSvg({ bg, marks });
}
