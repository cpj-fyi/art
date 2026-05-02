import type { MarkInstance } from "./types";

export function renderMark(m: MarkInstance): string {
  const inner = renderMarkInner(m);
  if (!m.rotation) return inner;
  const [cx, cy] = markCenter(m);
  return `<g transform="rotate(${m.rotation} ${cx} ${cy})">${inner}</g>`;
}

function markCenter(m: MarkInstance): [number, number] {
  const c = m.cellSize;
  switch (m.mark) {
    case "bar":      return [m.x + c * (m.length ?? 4) / 2, m.y + c / 2];
    case "stripe":   return [m.x + c / 2, m.y + c * (m.length ?? 4) / 2];
    case "drip":     return [m.x + c / 2, m.y + c * (m.length ?? 4) / 2];
    case "block":    return [m.x + c * (m.length ?? 2) / 2, m.y + c * (m.height ?? 2) / 2];
    // pixel, plus, ring, diagonal: their bounding box centers are at (x + c/2, y + c/2)
    // (plus and ring extend symmetrically; diagonal is a 4-cell box with center at (x + 2c, y + 2c))
    case "diagonal": return [m.x + c * 2, m.y + c * 2];
    default:         return [m.x + c / 2, m.y + c / 2];
  }
}

function renderMarkInner(m: MarkInstance): string {
  switch (m.mark) {
    case "pixel":
      return rect(m.x, m.y, m.cellSize, m.cellSize, m.color);
    case "bar": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize * length, m.cellSize, m.color);
    }
    case "stripe": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize, m.cellSize * length, m.color);
    }
    case "plus": {
      const c = m.cellSize;
      return [
        rect(m.x, m.y - c, c, c, m.color),
        rect(m.x - c, m.y, c, c, m.color),
        rect(m.x, m.y, c, c, m.color),
        rect(m.x + c, m.y, c, c, m.color),
        rect(m.x, m.y + c, c, c, m.color),
      ].join("");
    }
    case "ring": {
      const c = m.cellSize;
      const parts: string[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          parts.push(rect(m.x + dx * c, m.y + dy * c, c, c, m.color));
        }
      }
      return parts.join("");
    }
    case "diagonal": {
      const c = m.cellSize;
      return [0, 1, 2, 3]
        .map((i) => rect(m.x + i * c, m.y + (3 - i) * c, c, c, m.color))
        .join("");
    }
    case "block": {
      const length = m.length ?? 2;
      const height = m.height ?? 2;
      return rect(m.x, m.y, m.cellSize * length, m.cellSize * height, m.color);
    }
    case "drip": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize, m.cellSize * length, m.color);
    }
  }
}

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}
