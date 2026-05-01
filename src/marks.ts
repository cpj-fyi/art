import type { MarkInstance } from "./types";

export function renderMark(m: MarkInstance): string {
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
