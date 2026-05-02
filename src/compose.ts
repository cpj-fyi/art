import type { Hash } from "./hash";
import { moodFor } from "./palettes";
import type { Canvas, Layer, MarkKey, Panel, PostMetadata, StrategyKey } from "./types";
import { CANVAS } from "./types";

const BASE_STRATEGIES: StrategyKey[] = ["field", "grid", "strata"];
const FIGURE_STRATEGIES: StrategyKey[] = ["columns", "quilt", "checker", "clusters", "strata"];
const ACCENT_STRATEGIES: StrategyKey[] = ["scatter", "chaotic", "gravity"];

const ALL_MARKS: MarkKey[] = ["pixel", "bar", "stripe", "plus", "ring", "diagonal", "block", "drip"];

const STRATEGY_MARK_BIAS: Partial<Record<StrategyKey, MarkKey[]>> = {
  field:      ["block"],
  strata:     ["bar", "pixel"],
  columns:    ["stripe", "pixel"],
  quilt:      ["plus", "ring", "pixel"],
  gravity:    ["pixel", "drip"],
  chaotic:    ["pixel", "diagonal"],
  diagonals:  ["bar"],  // decorative — diagonals already hardcodes bar internally, but marks the bias for clarity
};

export function composeLayers(hash: Hash, meta: PostMetadata, palette: readonly string[]): Layer[] {
  const mood = moodFor(meta.primaryTag);
  const layerCount = pickLayerCount(hash, meta, mood);

  const base = pickLayer(hash, "base", BASE_STRATEGIES, meta, palette);
  const figure = pickLayer(hash, "figure", FIGURE_STRATEGIES, meta, palette);

  if (layerCount === 2) return [base, figure];

  const accent = pickLayer(hash, "accent", ACCENT_STRATEGIES, meta, palette);
  return [base, figure, accent];
}

function pickLayerCount(hash: Hash, meta: PostMetadata, mood: ReturnType<typeof moodFor>): 2 | 3 {
  const ageDays = (Date.now() - meta.publishedAtMs) / (1000 * 60 * 60 * 24);
  const bias =
    ageDays > 180 ? 0.3 :
    ageDays > 30  ? 0.5 :
                    0.7;
  const radarPenalty = mood === "radar" ? -0.2 : 0;
  return hash.float() < bias + radarPenalty ? 3 : 2;
}

function pickLayer(
  hash: Hash,
  slot: "base" | "figure" | "accent",
  pool: StrategyKey[],
  meta: PostMetadata,
  palette: readonly string[],
): Layer {
  const strategy = hash.pick(pool);
  const markPool = STRATEGY_MARK_BIAS[strategy] ?? ALL_MARKS;
  const mark = hash.pick(markPool);
  const density = densityFor(slot, hash, meta);
  const cellSize = cellSizeFor(slot, hash);
  const layerColors = pickDistinctN(hash, palette, 3);
  return { strategy, mark, palette: layerColors, density, cellSize };
}

function densityFor(slot: "base" | "figure" | "accent", hash: Hash, meta: PostMetadata): number {
  const radarFactor = meta.primaryTag === "radar" ? 0.6 : 1;
  if (slot === "base") {
    const t = clamp01((meta.titleLength - 20) / 60);
    return clamp01((0.15 + t * 0.7) * radarFactor);
  }
  if (slot === "figure") {
    return clamp01((0.15 + hash.float() * 0.25) * radarFactor);
  }
  return clamp01((0.05 + hash.float() * 0.15) * radarFactor);
}

function cellSizeFor(slot: "base" | "figure" | "accent", hash: Hash): number {
  if (slot === "accent") return [10, 12, 15][hash.next(2) % 3]!;
  return [12, 15, 18, 24][hash.next(2) % 4]!;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

export function pickDistinctN(hash: Hash, pool: readonly string[], n: number): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  // Bound attempts so we don't hash-exhaust on a tiny palette.
  const maxAttempts = pool.length * 4;
  let attempts = 0;
  while (result.length < n && attempts < maxAttempts) {
    const c = hash.pick(pool);
    if (!seen.has(c)) {
      seen.add(c);
      result.push(c);
    }
    attempts++;
  }
  // Fallback: if pool was tiny and we couldn't reach n, return what we got (must be ≥1).
  return result.length > 0 ? result : [pool[0] ?? "#000000"];
}

// ---------------------------------------------------------------------------
// Panel composition (Book + Essays moods)
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; width: number; height: number };

const PANEL_MARGIN = 24;
const PANEL_GAP = 16;
const PANEL_MIN_W = 200;
const PANEL_MIN_H = 150;
const PANEL_STRATEGIES: StrategyKey[] = [
  // rhythmic — dominant
  "grid", "grid", "grid", "grid",
  "quilt", "quilt", "quilt", "quilt",
  "checker", "checker", "checker", "checker",
  "diagonals", "diagonals", "diagonals",
  "strata", "strata", "strata",
  "columns", "columns", "columns",
  "field", "field",
  // characterful sparse — occasional
  "gravity",
  "chaotic",
];

const RHYTHMIC_STRATEGIES: ReadonlySet<StrategyKey> = new Set(["grid", "quilt", "checker", "strata", "columns", "diagonals"]);

function largestRectIndex(rects: Rect[]): number {
  let bestIdx = 0;
  let bestArea = rects[0]!.width * rects[0]!.height;
  for (let i = 1; i < rects.length; i++) {
    const a = rects[i]!.width * rects[i]!.height;
    if (a > bestArea) { bestArea = a; bestIdx = i; }
  }
  return bestIdx;
}

function trySplit(hash: Hash, r: Rect): [Rect, Rect] | null {
  const tryH = r.width >= r.height;
  const ratio = 0.35 + hash.float() * 0.30;
  const horizontal = (h: boolean): [Rect, Rect] | null => {
    if (h) {
      const splitX = Math.floor(r.width * ratio);
      const a: Rect = { x: r.x, y: r.y, width: splitX - PANEL_GAP / 2, height: r.height };
      const b: Rect = { x: r.x + splitX + PANEL_GAP / 2, y: r.y, width: r.width - splitX - PANEL_GAP / 2, height: r.height };
      if (a.width < PANEL_MIN_W || b.width < PANEL_MIN_W) return null;
      return [a, b];
    }
    const splitY = Math.floor(r.height * ratio);
    const a: Rect = { x: r.x, y: r.y, width: r.width, height: splitY - PANEL_GAP / 2 };
    const b: Rect = { x: r.x, y: r.y + splitY + PANEL_GAP / 2, width: r.width, height: r.height - splitY - PANEL_GAP / 2 };
    if (a.height < PANEL_MIN_H || b.height < PANEL_MIN_H) return null;
    return [a, b];
  };
  return horizontal(tryH) ?? horizontal(!tryH);
}

function panelRects(hash: Hash, canvas: Canvas, count: number): Rect[] {
  const rects: Rect[] = [{
    x: PANEL_MARGIN,
    y: PANEL_MARGIN,
    width: canvas.width - 2 * PANEL_MARGIN,
    height: canvas.height - 2 * PANEL_MARGIN,
  }];
  while (rects.length < count) {
    const idx = largestRectIndex(rects);
    const r = rects[idx]!;
    const split = trySplit(hash, r);
    if (!split) break; // no rect can be split; stop short
    rects.splice(idx, 1, ...split);
  }
  return rects;
}

export function composePanels(hash: Hash, meta: PostMetadata, palette: readonly string[]): Panel[] {
  const titleClamp = Math.max(0, Math.min(2, Math.floor((meta.titleLength - 20) / 30)));
  const panelCount = 2 + titleClamp; // 2..4
  const rects = panelRects(hash, CANVAS, panelCount);
  const radarFactor = meta.primaryTag === "radar" ? 0.75 : 1;

  return rects.map((r) => {
    const strategy = hash.pick(PANEL_STRATEGIES);
    const markPool = STRATEGY_MARK_BIAS[strategy] ?? ALL_MARKS;
    const mark = hash.pick(markPool);
    const layerColors = pickDistinctN(hash, palette, 3);
    const baseDensity =
      strategy === "field"                  ? 1 :
      RHYTHMIC_STRATEGIES.has(strategy)     ? 0.45 + hash.float() * 0.30 :  // 0.45–0.75
      strategy === "gravity"                ? 0.30 + hash.float() * 0.30 :  // 0.30–0.60
      strategy === "chaotic"                ? 0.05 + hash.float() * 0.10 :  // 0.05–0.15
                                              0.08 + hash.float() * 0.18;
    const density = strategy === "field" ? 1 : baseDensity * radarFactor;
    const cellSize = [18, 24, 30, 36][hash.next(2) % 4]!;
    // ~30% of panels render translucent
    const opacity = hash.float() < 0.30 ? 0.5 + hash.float() * 0.25 : 1;

    // ~40% of panels get a secondary pass with a different strategy + contrasting mark
    let secondary: Panel["secondary"] | undefined;
    if (hash.float() < 0.40) {
      // Pick a secondary strategy from the rhythmic set (dominant marks)
      // but a DIFFERENT one than the primary, and with a contrasting mark.
      const secStrategyPool = PANEL_STRATEGIES.filter((s) => s !== strategy);
      const secStrategy = hash.pick(secStrategyPool);
      const secMarkPool = STRATEGY_MARK_BIAS[secStrategy] ?? ALL_MARKS;
      const secMarkCandidates = secMarkPool.filter((mk) => mk !== mark);
      const secMark = hash.pick(secMarkCandidates.length > 0 ? secMarkCandidates : secMarkPool);
      const secColors = pickDistinctN(hash, palette, 2);
      // Secondary always sparser than primary so it reads as accent on top
      const secDensity = (
        secStrategy === "field"                  ? 0.35 :  // field as secondary = a translucent-feeling fill
        RHYTHMIC_STRATEGIES.has(secStrategy)     ? 0.20 + hash.float() * 0.20 :
        secStrategy === "gravity"                ? 0.20 + hash.float() * 0.20 :
        secStrategy === "chaotic"                ? 0.05 + hash.float() * 0.08 :
                                                   0.10 + hash.float() * 0.10
      ) * radarFactor;
      // Larger cell size for secondary so it doesn't fight the primary
      const secCellSize = Math.max(cellSize, [24, 30, 36][hash.next(2) % 3]!);
      secondary = {
        strategy: secStrategy,
        mark: secMark,
        palette: secColors,
        density: secDensity,
        cellSize: secCellSize,
      };
    }

    return {
      x: r.x, y: r.y, width: r.width, height: r.height,
      strategy, mark, palette: layerColors, density, cellSize, opacity,
      secondary,
    };
  });
}
