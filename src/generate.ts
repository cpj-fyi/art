import { Hash } from "./hash";
import { composePanels, pickDistinctN } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { selectPalette } from "./palettes";
import type { MarkGroup, MarkKey, PostMetadata, StrategyKey } from "./types";
import { CANVAS } from "./types";

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const { bg, colors } = selectPalette(meta.primaryTag, hash);
  const panels = composePanels(hash, meta, colors);

  const groups: MarkGroup[] = panels.map((p) => {
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
    const marks = panelMarks
      .map((m) => ({ ...m, x: m.x + p.x, y: m.y + p.y }))
      .filter((m) => m.x >= p.x && m.y >= p.y &&
                     m.x < p.x + p.width && m.y < p.y + p.height);
    return { opacity: p.opacity, marks };
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
