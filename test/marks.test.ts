import { describe, it, expect } from "vitest";
import { renderMark } from "../src/marks";
import type { MarkInstance } from "../src/types";

const at = (overrides: Partial<MarkInstance> = {}): MarkInstance => ({
  mark: "pixel",
  x: 30,
  y: 60,
  color: "#FF3252",
  cellSize: 15,
  ...overrides,
});

describe("renderMark", () => {
  it("pixel: single rect cellSize x cellSize", () => {
    const svg = renderMark(at({ mark: "pixel" }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="15" fill="#FF3252"/>`);
  });

  it("bar: horizontal rect, default length 4 cells", () => {
    const svg = renderMark(at({ mark: "bar" }));
    expect(svg).toBe(`<rect x="30" y="60" width="60" height="15" fill="#FF3252"/>`);
  });

  it("bar: respects custom length", () => {
    const svg = renderMark(at({ mark: "bar", length: 6 }));
    expect(svg).toBe(`<rect x="30" y="60" width="90" height="15" fill="#FF3252"/>`);
  });

  it("stripe: vertical rect, default 4 cells tall", () => {
    const svg = renderMark(at({ mark: "stripe" }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="60" fill="#FF3252"/>`);
  });

  it("plus: 5 rects forming a cross", () => {
    const svg = renderMark(at({ mark: "plus" }));
    expect(svg).toContain('fill="#FF3252"');
    expect((svg.match(/<rect /g) || []).length).toBe(5);
  });

  it("ring: 8 rects forming hollow 3x3 square", () => {
    const svg = renderMark(at({ mark: "ring" }));
    expect((svg.match(/<rect /g) || []).length).toBe(8);
  });

  it("diagonal: 4-cell staircase", () => {
    const svg = renderMark(at({ mark: "diagonal" }));
    expect((svg.match(/<rect /g) || []).length).toBe(4);
  });

  it("block: N x M filled rectangle", () => {
    const svg = renderMark(at({ mark: "block", length: 3, height: 2 }));
    expect(svg).toBe(`<rect x="30" y="60" width="45" height="30" fill="#FF3252"/>`);
  });

  it("drip: vertical line of given length cells", () => {
    const svg = renderMark(at({ mark: "drip", length: 5 }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="75" fill="#FF3252"/>`);
  });
});
