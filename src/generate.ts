import { Hash } from "./hash";
import { composePanels, pickDistinctN } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { selectPalette } from "./palettes";
import type { MarkGroup, MarkInstance, MarkKey, Panel, PostMetadata, StrategyKey } from "./types";
import { CANVAS } from "./types";

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

  const groups: MarkGroup[] = panels.flatMap((p) => {
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

    return [{ opacity: p.opacity, marks: [...primaryMarks, ...secondaryMarks] }];
  });

  // ~30% of posts get a unifying overlay across the panels
  if (hash.float() < 0.30) {
    const overlayStrategy = hash.pick<StrategyKey>(["scatter", "strata", "columns"]);
    const overlayMark = hash.pick<MarkKey>(["pixel", "bar"]);
    const overlayColors = pickDistinctN(hash, colors, 2);
    const overlayDensity = 0.05 + hash.float() * 0.10; // 0.05–0.15
    const overlayCellSize = [18, 24, 30][hash.next(2) % 3]!;
    const overlayOpacity = 0.30 + hash.float() * 0.20; // 0.30–0.50
    const overlayMarks = runStrategy(overlayStrategy, {
      hash,
      canvas: CANVAS,
      mark: overlayMark,
      palette: overlayColors,
      density: overlayDensity,
      cellSize: overlayCellSize,
    });
    groups.push({ opacity: overlayOpacity, marks: overlayMarks });
  }

  return renderSvg({ bg, groups });
}
