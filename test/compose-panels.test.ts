import { describe, it, expect } from "vitest";
import { composePanels } from "../src/compose";
import { Hash } from "../src/hash";
import { CANVAS } from "../src/types";

const PALETTE = ["#222", "#FF3252", "#999", "#E9306B", "#8438F2"];

describe("composePanels", () => {
  it("returns 2 to 4 panels", async () => {
    for (const slug of ["a", "b", "c", "d", "e", "f"]) {
      const hash = await Hash.from(slug);
      const panels = composePanels(hash, { slug, primaryTag: null, titleLength: 40, publishedAtMs: Date.now() }, PALETTE);
      expect(panels.length).toBeGreaterThanOrEqual(2);
      expect(panels.length).toBeLessThanOrEqual(4);
    }
  });

  it("longer title produces more panels (averaged)", async () => {
    let shortTotal = 0;
    let longTotal = 0;
    for (let i = 0; i < 10; i++) {
      const sh = await Hash.from(`p${i}`);
      const lh = await Hash.from(`p${i}`);
      shortTotal += composePanels(sh, { slug: `p${i}`, primaryTag: null, titleLength: 15, publishedAtMs: 0 }, PALETTE).length;
      longTotal  += composePanels(lh, { slug: `p${i}`, primaryTag: null, titleLength: 95, publishedAtMs: 0 }, PALETTE).length;
    }
    expect(longTotal).toBeGreaterThanOrEqual(shortTotal);
  });

  it("panels do not overlap", async () => {
    const hash = await Hash.from("overlap-check");
    const panels = composePanels(hash, { slug: "x", primaryTag: null, titleLength: 50, publishedAtMs: 0 }, PALETTE);
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i]!;
        const b = panels[j]!;
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(overlapX * overlapY).toBe(0);
      }
    }
  });

  it("panels stay within canvas bounds", async () => {
    const hash = await Hash.from("bounds");
    const panels = composePanels(hash, { slug: "x", primaryTag: null, titleLength: 50, publishedAtMs: 0 }, PALETTE);
    for (const p of panels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(CANVAS.width);
      expect(p.y + p.height).toBeLessThanOrEqual(CANVAS.height);
    }
  });

  it("each panel has a non-empty palette", async () => {
    const hash = await Hash.from("palette-check");
    const panels = composePanels(hash, { slug: "x", primaryTag: "foundations", titleLength: 50, publishedAtMs: 0 }, PALETTE);
    for (const p of panels) {
      expect(p.palette.length).toBeGreaterThan(0);
    }
  });

  it("panels are deterministic for the same hash + palette", async () => {
    const a = await Hash.from("repeat");
    const b = await Hash.from("repeat");
    const meta = { slug: "x", primaryTag: null, titleLength: 50, publishedAtMs: 0 };
    expect(composePanels(a, meta, PALETTE)).toEqual(composePanels(b, meta, PALETTE));
  });

  it("can use gravity and chaotic strategies (sparse bucket)", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200 && seen.size < 2; i++) {
      const hash = await Hash.from(`sample-${i}`);
      const panels = composePanels(hash, { slug: `s${i}`, primaryTag: null, titleLength: 50, publishedAtMs: 0 }, ["#FF3252", "#222", "#999", "#E9306B"]);
      for (const p of panels) {
        if (p.strategy === "gravity" || p.strategy === "chaotic") {
          seen.add(p.strategy);
        }
      }
    }
    expect(seen.has("gravity")).toBe(true);
    expect(seen.has("chaotic")).toBe(true);
  });

  it("some panels have opacity < 1", async () => {
    let opaque = 0;
    let translucent = 0;
    for (let i = 0; i < 50; i++) {
      const hash = await Hash.from(`opacity-${i}`);
      const panels = composePanels(hash, { slug: `s${i}`, primaryTag: null, titleLength: 50, publishedAtMs: 0 }, ["#FF3252", "#222", "#999"]);
      for (const p of panels) {
        if (p.opacity < 1) translucent++;
        else opaque++;
      }
    }
    // expect ~30% translucent — accept any non-zero
    expect(translucent).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(translucent);
  });
});
