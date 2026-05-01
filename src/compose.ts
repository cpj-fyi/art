import type { Hash } from "./hash";
import { weightedPaletteFor, moodFor } from "./palettes";
import type { Layer, MarkKey, PostMetadata, StrategyKey } from "./types";

const BASE_STRATEGIES: StrategyKey[] = ["field", "grid", "strata"];
const FIGURE_STRATEGIES: StrategyKey[] = ["columns", "quilt", "checker", "clusters", "strata"];
const ACCENT_STRATEGIES: StrategyKey[] = ["scatter", "chaotic", "gravity"];

const ALL_MARKS: MarkKey[] = ["pixel", "bar", "stripe", "plus", "ring", "diagonal", "block", "drip"];

const STRATEGY_MARK_BIAS: Partial<Record<StrategyKey, MarkKey[]>> = {
  field:    ["block"],
  strata:   ["bar", "pixel"],
  columns:  ["stripe", "pixel"],
  quilt:    ["plus", "ring", "pixel"],
  gravity:  ["pixel", "drip"],
  chaotic:  ["pixel", "diagonal"],
};

export function composeLayers(hash: Hash, meta: PostMetadata): Layer[] {
  const mood = moodFor(meta.primaryTag);
  const weighted = weightedPaletteFor(meta.primaryTag);

  const layerCount = pickLayerCount(hash, meta, mood);

  const base = pickLayer(hash, "base", BASE_STRATEGIES, meta, weighted);
  const figure = pickLayer(hash, "figure", FIGURE_STRATEGIES, meta, weighted);

  if (layerCount === 2) return [base, figure];

  const accent = pickLayer(hash, "accent", ACCENT_STRATEGIES, meta, weighted);
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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function pickDistinctN(hash: Hash, pool: readonly string[], n: number): readonly string[] {
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
