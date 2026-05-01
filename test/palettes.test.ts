import { describe, it, expect } from "vitest";
import { paletteFor, weightedPaletteFor, selectPalette, MOODS } from "../src/palettes";
import { Hash } from "../src/hash";

describe("palettes", () => {
  it("book mood for hidden-patterns tag", () => {
    expect(paletteFor("hidden-patterns").bg).toBe("#F8F8F8");
  });

  it("book mood for any of the 7 section tags", () => {
    for (const tag of ["start-end", "foundations", "structuring", "direction", "practice", "learning", "space"]) {
      expect(paletteFor(tag).bg).toBe("#F8F8F8");
    }
  });

  it("radar mood: dark bg", () => {
    expect(paletteFor("radar").bg).toBe("#1A1A1A");
  });

  it("essays mood: bg is #F8F8F8 (HP)", () => {
    expect(paletteFor("essays").bg).toBe("#F8F8F8");
  });

  it("default to book for unknown tag", () => {
    expect(paletteFor(null).bg).toBe("#F8F8F8");
    expect(paletteFor("five-things").bg).toBe("#F8F8F8");
  });

  it("Book palette includes the section arc", () => {
    const p = paletteFor("foundations");
    expect(p.colors).toContain("#FF3252");
    expect(p.colors).toContain("#8438F2");
  });

  it("weightedPaletteFor: non-Book moods are uniform (no repetition)", () => {
    const radar = weightedPaletteFor("radar");
    const essays = weightedPaletteFor("essays");
    expect(new Set(radar).size).toBe(radar.length);
    expect(new Set(essays).size).toBe(essays.length);
  });

  it("weightedPaletteFor: Book with a section tag biases section + neighbors", async () => {
    const weighted = weightedPaletteFor("foundations");
    const close = ["#FF3252", "#222222", "#E9306B"];
    const closeCount = weighted.filter((c) => close.includes(c)).length;
    expect(closeCount / weighted.length).toBeGreaterThan(0.7);
  });

  it("weightedPaletteFor: Book without a section tag is uniform", () => {
    const weighted = weightedPaletteFor("hidden-patterns");
    expect(new Set(weighted).size).toBe(weighted.length);
  });

  it("hash.pick over weighted Book palette favors section ~80%", async () => {
    const weighted = weightedPaletteFor("foundations");
    const h = await Hash.from("bias-sample");
    const close = ["#FF3252", "#222222", "#E9306B"];
    const samples = Array.from({ length: 400 }, () => h.pick(weighted));
    const closeCount = samples.filter((c) => close.includes(c)).length;
    expect(closeCount / samples.length).toBeGreaterThan(0.65);
  });

  it("MOODS exposes all three", () => {
    expect(MOODS.book.bg).toBe("#F8F8F8");
    expect(MOODS.radar.bg).toBe("#1A1A1A");
    expect(MOODS.essays.bg).toBe("#F8F8F8");
  });

  it("essays mood: bg is #F8F8F8 (HP)", async () => {
    const h = await Hash.from("essays-bg-test");
    const { bg } = selectPalette("essays", h);
    expect(bg).toBe("#F8F8F8");
  });
});
