import type { Hash } from "./hash";
import type { Canvas, MarkInstance, MarkKey, StrategyKey } from "./types";

export type StrategyArgs = {
  hash: Hash;
  canvas: Canvas;
  mark: MarkKey;
  palette: readonly string[];
  density: number;
  cellSize: number;
};

export function runStrategy(key: StrategyKey, args: StrategyArgs): MarkInstance[] {
  switch (key) {
    case "grid":     return grid(args);
    case "strata":   return strata(args);
    case "columns":  return columns(args);
    case "scatter":  return scatter(args);
    case "quilt":    return quilt(args);
    case "checker":  return checker(args);
    case "clusters": return clusters(args);
    case "field":    return field(args);
    case "chaotic":  return chaotic(args);
    case "gravity":  return gravity(args);
  }
}

function grid({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  if (density <= 0) return [];
  const stride = 1 + (hash.next(2) % 3);
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r += stride) {
    for (let c = 0; c < cols; c += stride) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function strata({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const bands = 3 + (hash.next(3) % 5);
  const bandHeight = Math.floor(canvas.height / bands / cellSize) * cellSize;
  const out: MarkInstance[] = [];
  for (let b = 0; b < bands; b++) {
    const y = b * bandHeight;
    const color = hash.pick(palette);
    const cols = Math.floor(canvas.width / cellSize);
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y, color, cellSize, length: 1 });
      }
    }
  }
  return out;
}

function columns({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const lanes = 4 + (hash.next(3) % 6);
  const laneWidth = Math.floor(canvas.width / lanes / cellSize) * cellSize;
  const out: MarkInstance[] = [];
  for (let l = 0; l < lanes; l++) {
    const x = l * laneWidth;
    const color = hash.pick(palette);
    const rows = Math.floor(canvas.height / cellSize);
    for (let r = 0; r < rows; r++) {
      if (hash.float() < density) {
        out.push({ mark, x, y: r * cellSize, color, cellSize, length: 1 });
      }
    }
  }
  return out;
}

function scatter({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function quilt({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const stride = 4 + (hash.next(2) % 3);
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = stride; r < rows; r += stride) {
    for (let c = stride; c < cols; c += stride) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function checker({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2;
    for (let c = offset; c < cols; c += 2) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function clusters({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const numClusters = 2 + (hash.next(3) % 5);
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let i = 0; i < numClusters; i++) {
    const cx = hash.next(7) % cols;
    const cy = hash.next(7) % rows;
    const radius = 2 + (hash.next(2) % 3);
    const color = hash.pick(palette);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (hash.float() < density) {
          out.push({ mark, x: x * cellSize, y: y * cellSize, color, cellSize });
        }
      }
    }
  }
  return out;
}

function field({ hash, canvas, mark, palette, cellSize }: StrategyArgs): MarkInstance[] {
  const w = Math.floor(canvas.width / cellSize);
  const h = Math.floor(canvas.height / cellSize);
  return [{
    mark: "block",
    x: 0,
    y: 0,
    color: hash.pick(palette),
    cellSize,
    length: w,
    height: h,
  }];
}

function chaotic({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  // Use a sub-step that doesn't divide cellSize evenly, so x%cellSize varies.
  const subStep = Math.max(3, Math.floor(cellSize / 3));
  const cols = Math.floor(canvas.width / subStep);
  const rows = Math.floor(canvas.height / subStep);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({
          mark,
          x: c * subStep,
          y: r * subStep,
          color: hash.pick(palette),
          cellSize: subStep,
        });
      }
    }
  }
  return out;
}

function gravity({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const out: MarkInstance[] = [];
  for (let c = 0; c < cols; c++) {
    const pileCells = Math.floor(hash.float() * density * 12);
    for (let p = 0; p < pileCells; p++) {
      const y = canvas.height - cellSize * (p + 1);
      out.push({ mark, x: c * cellSize, y, color: hash.pick(palette), cellSize });
    }
  }
  return out;
}
