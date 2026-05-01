import { renderMark } from "./marks";
import type { MarkInstance } from "./types";
import { CANVAS } from "./types";

export type RenderArgs = {
  bg: string;
  marks: MarkInstance[];
};

export function renderSvg({ bg, marks }: RenderArgs): string {
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="${CANVAS.width}" height="${CANVAS.height}">`;
  const bgRect = `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${bg}"/>`;
  const body = marks.map(renderMark).join("");
  return `${head}${bgRect}${body}</svg>`;
}
