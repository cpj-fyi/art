import { describe, it, expect } from "vitest";
import { generateSvg, generate } from "../src/generate";

describe("generateSvg", () => {
  it("returns a complete SVG for a Book post", async () => {
    const svg = await generateSvg({ slug: "test-foundations", primaryTag: "foundations", titleLength: 42, publishedAtMs: Date.now() });
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('fill="#F6EFDD"');
  });

  it("returns a complete SVG for a Radar post", async () => {
    const svg = await generateSvg({ slug: "test-radar", primaryTag: "radar", titleLength: 30, publishedAtMs: Date.now() });
    expect(svg).toContain('fill="#1A1A1A"');
  });

  it("returns a complete SVG for an Essays post (bg is #F6EFDD)", async () => {
    const svg = await generateSvg({ slug: "test-essays", primaryTag: "essays", titleLength: 60, publishedAtMs: Date.now() });
    expect(svg).toContain('fill="#F6EFDD"');
  });

  it("is deterministic for the same metadata", async () => {
    const meta = { slug: "deterministic", primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 };
    const a = await generateSvg(meta);
    const b = await generateSvg(meta);
    expect(a).toBe(b);
  });

  it("differs for different slugs even with same other inputs", async () => {
    const a = await generateSvg({ slug: "alpha", primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 });
    const b = await generateSvg({ slug: "beta",  primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 });
    expect(a).not.toBe(b);
  });

  it("generate returns both svg and metadata", async () => {
    const result = await generate({ slug: "metadata-test", primaryTag: "foundations", titleLength: 40, publishedAtMs: Date.now() });
    expect(result.svg).toMatch(/^<svg\b/);
    expect(result.metadata.slug).toBe("metadata-test");
    expect(result.metadata.seed).toMatch(/^[0-9a-f]{8}$/);
    expect(result.metadata.mood).toBe("book");
    expect(result.metadata.panels.length).toBeGreaterThan(0);
    expect(result.metadata.rendererVersion).toBeGreaterThan(0);
  });
});
