import { describe, it, expect } from "vitest";
import { composeLayers } from "../src/compose";
import { Hash } from "../src/hash";

describe("composeLayers", () => {
  it("returns 2 or 3 layers", async () => {
    for (const slug of ["a", "b", "c", "d", "e"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      expect(layers.length).toBeGreaterThanOrEqual(2);
      expect(layers.length).toBeLessThanOrEqual(3);
    }
  });

  it("base layer is field, grid, or strata", async () => {
    for (const slug of ["a", "b", "c", "d", "e"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: null, titleLength: 30, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      expect(["field", "grid", "strata"]).toContain(layers[0]!.strategy);
    }
  });

  it("accent layer (when present) is scatter, chaotic, or gravity", async () => {
    let sawAccent = false;
    for (const slug of ["aa","bb","cc","dd","ee","ff","gg","hh","ii","jj"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: null, titleLength: 30, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      if (layers.length === 3) {
        sawAccent = true;
        expect(["scatter", "chaotic", "gravity"]).toContain(layers[2]!.strategy);
      }
    }
    expect(sawAccent).toBe(true);
  });

  it("longer title increases base-layer density", async () => {
    const hashA = await Hash.from("title-test");
    const hashB = await Hash.from("title-test");
    const short = composeLayers(hashA, { slug: "x", primaryTag: null, titleLength: 10, publishedAtMs: 0 });
    const long  = composeLayers(hashB, { slug: "x", primaryTag: null, titleLength: 100, publishedAtMs: 0 });
    expect(long[0]!.density).toBeGreaterThan(short[0]!.density);
  });

  it("older posts bias to fewer layers", async () => {
    const now = Date.now();
    const old = now - 365 * 24 * 60 * 60 * 1000;
    let layerCounts = { fresh: 0, aged: 0 };
    for (let i = 0; i < 20; i++) {
      const slug = `post-${i}`;
      const hf = await Hash.from(slug);
      const ho = await Hash.from(slug);
      layerCounts.fresh += composeLayers(hf, { slug, primaryTag: null, titleLength: 40, publishedAtMs: now }).length;
      layerCounts.aged  += composeLayers(ho, { slug, primaryTag: null, titleLength: 40, publishedAtMs: old }).length;
    }
    expect(layerCounts.aged).toBeLessThanOrEqual(layerCounts.fresh);
  });

  it("radar mood produces sparser base density", async () => {
    const slug = "radar-density";
    const hr = await Hash.from(slug);
    const hb = await Hash.from(slug);
    const radarLayers = composeLayers(hr, { slug, primaryTag: "radar", titleLength: 40, publishedAtMs: 0 });
    const bookLayers  = composeLayers(hb, { slug, primaryTag: "foundations", titleLength: 40, publishedAtMs: 0 });
    expect(radarLayers[0]!.density).toBeLessThanOrEqual(bookLayers[0]!.density);
  });

  it("Book layers receive a section-weighted palette", async () => {
    const hash = await Hash.from("book-weight");
    const layers = composeLayers(hash, { slug: "x", primaryTag: "foundations", titleLength: 40, publishedAtMs: Date.now() });
    for (const layer of layers) {
      const sectionCount = layer.palette.filter((c) => c === "#FF3252").length;
      expect(sectionCount).toBeGreaterThan(1);
    }
  });

  it("Non-book layers receive a uniform palette (no repetition)", async () => {
    const hash = await Hash.from("essays-uniform");
    const layers = composeLayers(hash, { slug: "x", primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() });
    for (const layer of layers) {
      expect(new Set(layer.palette).size).toBe(layer.palette.length);
    }
  });
});
