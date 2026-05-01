import { describe, it, expect } from "vitest";
import { Hash } from "../src/hash";

describe("Hash", () => {
  it("is deterministic — same input produces same byte sequence", async () => {
    const a = await Hash.from("hello");
    const b = await Hash.from("hello");
    expect(a.next(32)).toBe(b.next(32));
    expect(a.next(8)).toBe(b.next(8));
  });

  it("different inputs produce different output", async () => {
    const a = await Hash.from("foo");
    const b = await Hash.from("bar");
    expect(a.next(32)).not.toBe(b.next(32));
  });

  it("next(n) returns an integer in [0, 2^n)", async () => {
    const h = await Hash.from("test");
    for (let i = 0; i < 100; i++) {
      const n = 1 + (i % 16);
      const v = h.next(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** n);
    }
  });

  it("extends past 256 bits via re-hashing", async () => {
    const h = await Hash.from("extend");
    const values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(h.next(8));
    expect(values.length).toBe(100);
    const h2 = await Hash.from("extend");
    for (let i = 0; i < 100; i++) expect(h2.next(8)).toBe(values[i]);
  });

  it("provides float() helper returning [0, 1)", async () => {
    const h = await Hash.from("float");
    for (let i = 0; i < 50; i++) {
      const f = h.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("provides pick(arr) returning a deterministic element", async () => {
    const h = await Hash.from("pick");
    const arr = ["a", "b", "c", "d"];
    const x = h.pick(arr);
    expect(arr).toContain(x);
  });
});
