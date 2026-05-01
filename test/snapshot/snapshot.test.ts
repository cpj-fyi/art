import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildFixtures, FIXED_NOW } from "./fixtures";
import { generateSvg } from "../../src/generate";

describe("svg snapshots", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterAll(() => vi.useRealTimers());

  const fixtures = buildFixtures(FIXED_NOW);
  for (const meta of fixtures) {
    it(`is stable for ${meta.slug}`, async () => {
      const svg = await generateSvg(meta);
      expect(svg).toMatchSnapshot();
    });
  }
});
