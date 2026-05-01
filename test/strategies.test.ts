import { describe, it, expect } from "vitest";
import { runStrategy } from "../src/strategies";
import { Hash } from "../src/hash";
import { CANVAS } from "../src/types";

const PALETTE = ["#FF3252", "#222222", "#E9306B"];

async function setup() {
  const hash = await Hash.from("strategy-test");
  return { hash, canvas: CANVAS };
}

describe("strategies", () => {
  it("grid: emits regularly-spaced marks across canvas", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("grid", { hash, canvas, mark: "pixel", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(50);
    for (const m of out) {
      expect(m.x % 15).toBe(0);
      expect(m.y % 15).toBe(0);
    }
  });

  it("grid: density 0 emits nothing", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("grid", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0, cellSize: 15 });
    expect(out.length).toBe(0);
  });

  it("strata: emits horizontal bands at different y", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("strata", { hash, canvas, mark: "bar", palette: PALETTE, density: 0.7, cellSize: 15 });
    const ys = new Set(out.map((m) => m.y));
    expect(ys.size).toBeGreaterThan(3);
  });

  it("columns: emits vertical lanes at different x", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("columns", { hash, canvas, mark: "stripe", palette: PALETTE, density: 0.7, cellSize: 15 });
    const xs = new Set(out.map((m) => m.x));
    expect(xs.size).toBeGreaterThan(3);
  });

  it("scatter: emits sparse irregular marks", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("scatter", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(500);
  });

  it("quilt: repeats motif on regular grid", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("quilt", { hash, canvas, mark: "plus", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(20);
  });

  it("checker: alternates rows by stride", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("checker", { hash, canvas, mark: "pixel", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(20);
  });

  it("clusters: emits tight groups", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("clusters", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.5, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
  });

  it("field: emits a single large block", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("field", { hash, canvas, mark: "block", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBe(1);
    expect(out[0]!.mark).toBe("block");
  });

  it("chaotic: emits marks on a fine sub-grid", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("chaotic", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    const offsets = new Set(out.map((m) => m.x % 15));
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("gravity: emits marks settled against the bottom edge", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("gravity", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    const lower = out.filter((m) => m.y >= canvas.height / 2).length;
    expect(lower / out.length).toBeGreaterThan(0.7);
  });

  it("strategies are deterministic for the same hash and inputs", async () => {
    const a = await Hash.from("repeat");
    const b = await Hash.from("repeat");
    const oa = runStrategy("scatter", { hash: a, canvas: CANVAS, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    const ob = runStrategy("scatter", { hash: b, canvas: CANVAS, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(oa).toEqual(ob);
  });
});
