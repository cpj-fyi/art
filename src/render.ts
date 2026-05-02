import { renderMark } from "./marks";
import type { MarkGroup } from "./types";
import { CANVAS } from "./types";

export type RenderArgs = {
  bg: string;
  groups: MarkGroup[];
};

export function renderSvg({ bg, groups }: RenderArgs): string {
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="${CANVAS.width}" height="${CANVAS.height}">`;
  const bgRect = `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${bg}"/>`;
  const body = groups.map((g) => {
    const inner = g.marks.map(renderMark).join("");
    return g.opacity < 1 ? `<g opacity="${g.opacity}">${inner}</g>` : inner;
  }).join("");
  return `${head}${bgRect}${body}</svg>`;
}
