import { describe, it, expect, vi } from "vitest";

// Mock the png module so vitest's node pool never attempts to load the WASM binary.
vi.mock("../src/png", () => ({
  svgToPng: vi.fn(async (svg: string) => new Uint8Array([0x89, 0x50, 0x4e, 0x47])), // minimal PNG header stub
}));

import worker from "../src/index";

const env = {
  ART_CACHE: { get: vi.fn(), put: vi.fn() } as any,
  GHOST_API_URL: "https://cpj.fyi/ghost/api/content/posts",
  GHOST_CONTENT_KEY: "k",
};

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe("worker", () => {
  it("returns 200 SVG for a valid slug", async () => {
    // getOrGenerate checks svgKey then jsonKey — both miss
    env.ART_CACHE.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "hello", title: "Hello", primary_tag: { slug: "essays" }, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));

    const req = new Request("https://art.cpj.fyi/hello.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("image/svg+xml");
    const body = await resp.text();
    expect(body).toMatch(/^<svg\b/);
  });

  it("serves from KV cache on hit", async () => {
    // getOrGenerate checks svgKey (hit) then jsonKey (hit) — both must be set
    env.ART_CACHE.get
      .mockResolvedValueOnce("<svg>cached</svg>")
      .mockResolvedValueOnce('{"slug":"cached"}');
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("<svg>cached</svg>");
  });

  it("returns 404 when Ghost has no such post", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pages: [] }), { status: 200 }));
    const req = new Request("https://art.cpj.fyi/missing.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it("falls back to slug-only when Ghost errors", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const req = new Request("https://art.cpj.fyi/fallback.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain('fill="#F6EFDD"');
  });

  it("rejects unknown extensions with 404", async () => {
    const req = new Request("https://art.cpj.fyi/foo.gif");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it.skip("returns PNG for .png endpoint (skipped: requires wasm init in vitest node pool)", async () => {
    // Verified live via curl after deploy:
    // curl -sS -o /tmp/test.png -w "%{http_code} %{content_type} %{size_download}\n" \
    //   https://monafor.clay-893.workers.dev/the-end-of-role-clarity.png
    // file /tmp/test.png  # PNG image data, 1200 x ..., 8-bit/color RGBA
  });

  it("sets immutable cache headers on success", async () => {
    env.ART_CACHE.get
      .mockResolvedValueOnce("<svg>x</svg>")
      .mockResolvedValueOnce('{"slug":"x"}');
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.headers.get("cache-control")).toContain("immutable");
    expect(resp.headers.get("cache-control")).toContain("max-age=31536000");
  });

  it("returns JSON metadata for .json endpoint", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "j1", title: "J", primary_tag: { slug: "essays" }, published_at: "2025-01-01T00:00:00Z" }],
    }), { status: 200 }));

    const req = new Request("https://art.cpj.fyi/j1.json");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("application/json");
    const data = JSON.parse(await resp.text());
    expect(data.slug).toBe("j1");
    expect(data.mood).toBe("essays");
    expect(Array.isArray(data.panels)).toBe(true);
    expect(data.panels.length).toBeGreaterThanOrEqual(2);
  });

  it("returns CORS header on both endpoints", async () => {
    env.ART_CACHE.get
      .mockResolvedValueOnce("<svg>x</svg>")
      .mockResolvedValueOnce('{"slug":"x"}');
    const resp1 = await worker.fetch(new Request("https://art.cpj.fyi/x.svg"), env, ctx);
    expect(resp1.headers.get("access-control-allow-origin")).toBe("*");

    env.ART_CACHE.get
      .mockResolvedValueOnce('{"slug":"y","mood":"book","bg":"#F6EFDD","panels":[]}')
      .mockResolvedValueOnce('{"slug":"y","mood":"book","bg":"#F6EFDD","panels":[]}');
    const resp2 = await worker.fetch(new Request("https://art.cpj.fyi/y.json"), env, ctx);
    expect(resp2.headers.get("access-control-allow-origin")).toBe("*");
  });
});
