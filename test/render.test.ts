import { describe, it, expect } from "vitest";
import { renderSvg } from "../src/render";
import { Hash } from "../src/hash";
import { composeLayers } from "../src/compose";
import { runStrategy } from "../src/strategies";
import { weightedPaletteFor } from "../src/palettes";
import { CANVAS } from "../src/types";

describe("renderSvg", () => {
  it("wraps in valid <svg> with viewBox 0 0 1200 630", async () => {
    const hash = await Hash.from("render");
    const layers = composeLayers(hash, { slug: "render", primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() }, ["#221552", "#E5601F", "#FFFFFF"]);
    const marks = layers.flatMap((l) => runStrategy(l.strategy, { hash, canvas: CANVAS, mark: l.mark, palette: l.palette, density: l.density, cellSize: l.cellSize }));
    const svg = renderSvg({ bg: "#F6EFDD", groups: [{ opacity: 1, marks }] });
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("includes background as a full-canvas rect", async () => {
    const svg = renderSvg({ bg: "#F8F8F8", groups: [] });
    expect(svg).toContain('<rect width="1200" height="630" fill="#F8F8F8"/>');
  });

  it("includes mark elements inline", async () => {
    const svg = renderSvg({
      bg: "#fff",
      groups: [{ opacity: 1, marks: [{ mark: "pixel", x: 10, y: 20, color: "#FF3252", cellSize: 15 }] }],
    });
    expect(svg).toContain(`<rect x="10" y="20" width="15" height="15" fill="#FF3252"/>`);
  });

  it("output is well-formed for a typical post", async () => {
    const hash = await Hash.from("well-formed");
    const meta = { slug: "well-formed", primaryTag: "foundations", titleLength: 50, publishedAtMs: Date.now() };
    const layers = composeLayers(hash, meta, weightedPaletteFor(meta.primaryTag));
    const marks = layers.flatMap((l) => runStrategy(l.strategy, { hash, canvas: CANVAS, mark: l.mark, palette: l.palette, density: l.density, cellSize: l.cellSize }));
    const svg = renderSvg({ bg: "#F8F8F8", groups: [{ opacity: 1, marks }] });
    const opens = (svg.match(/<svg\b/g) || []).length;
    const closes = (svg.match(/<\/svg>/g) || []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
  });

  it("wraps group in <g opacity> when opacity < 1", () => {
    const marks = [{ mark: "pixel" as const, x: 10, y: 20, color: "#FF3252", cellSize: 15 }];
    const svg = renderSvg({ bg: "#fff", groups: [{ opacity: 0.5, marks }] });
    expect(svg).toContain(`<g opacity="0.5">`);
    expect(svg).toContain(`<rect x="10" y="20" width="15" height="15" fill="#FF3252"/>`);
  });
});
