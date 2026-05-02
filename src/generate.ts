import { Hash } from "./hash";
import { composePanels } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { selectPalette } from "./palettes";
import type { MarkInstance, Panel, PostMetadata } from "./types";

function translateAndClip(m: MarkInstance, p: Panel): MarkInstance | null {
  const tx = m.x + p.x;
  const ty = m.y + p.y;
  if (tx < p.x || ty < p.y || tx >= p.x + p.width || ty >= p.y + p.height) return null;
  return { ...m, x: tx, y: ty };
}

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const { bg, colors } = selectPalette(meta.primaryTag, hash);
  const panels = composePanels(hash, meta, colors);

  const marks: MarkInstance[] = panels.flatMap((p) => {
    const primaryMarks = runStrategy(p.strategy, {
      hash,
      canvas: { width: p.width, height: p.height },
      mark: p.mark,
      palette: p.palette,
      density: p.density,
      cellSize: p.cellSize,
    }).map((m) => translateAndClip(m, p)).filter(Boolean) as MarkInstance[];

    let secondaryMarks: MarkInstance[] = [];
    if (p.secondary) {
      secondaryMarks = runStrategy(p.secondary.strategy, {
        hash,
        canvas: { width: p.width, height: p.height },
        mark: p.secondary.mark,
        palette: p.secondary.palette,
        density: p.secondary.density,
        cellSize: p.secondary.cellSize,
      }).map((m) => translateAndClip(m, p)).filter(Boolean) as MarkInstance[];
    }

    return [...primaryMarks, ...secondaryMarks];
  });

  return renderSvg({ bg, marks });
}
