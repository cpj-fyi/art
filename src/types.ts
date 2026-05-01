export type MarkKey =
  | "pixel"
  | "bar"
  | "stripe"
  | "plus"
  | "ring"
  | "diagonal"
  | "block"
  | "drip";

export type StrategyKey =
  | "grid"
  | "strata"
  | "columns"
  | "scatter"
  | "quilt"
  | "checker"
  | "clusters"
  | "field"
  | "chaotic"
  | "gravity";

export type Mood = "book" | "radar" | "essays";

export type Palette = {
  bg: string;
  colors: readonly string[];
  // Optional bias key (used by Book to anchor on a section)
  biasKey?: string;
};

export type MarkInstance = {
  mark: MarkKey;
  x: number;          // px, top-left
  y: number;          // px, top-left
  color: string;
  cellSize: number;   // px
  // Optional mark-specific dims:
  length?: number;    // for bar / stripe / drip / block (in cells)
  height?: number;    // for stripe / block (in cells)
};

export type Layer = {
  strategy: StrategyKey;
  mark: MarkKey;
  palette: readonly string[];
  density: number;    // 0..1
  cellSize: number;   // px
};

export type Panel = {
  x: number;
  y: number;
  width: number;
  height: number;
  strategy: StrategyKey;
  mark: MarkKey;
  palette: readonly string[];
  density: number;
  cellSize: number;
};

export type PostMetadata = {
  slug: string;
  primaryTag: string | null;
  titleLength: number;
  publishedAtMs: number;
};

export type Canvas = {
  width: number;   // px
  height: number;  // px
};

export const CANVAS: Canvas = { width: 1200, height: 630 };
