import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";

const env = {
  ART_CACHE: { get: vi.fn(), put: vi.fn() } as any,
  GHOST_API_URL: "https://cpj.fyi/ghost/api/content/posts",
  GHOST_CONTENT_KEY: "k",
};

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe("worker", () => {
  it("returns 200 SVG for a valid slug", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
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
    env.ART_CACHE.get.mockResolvedValueOnce("<svg>cached</svg>");
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("<svg>cached</svg>");
  });

  it("returns 404 when Ghost has no such post", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));
    const req = new Request("https://art.cpj.fyi/missing.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it("falls back to slug-only when Ghost errors", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const req = new Request("https://art.cpj.fyi/fallback.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain('fill="#F8F8F8"');
  });

  it("rejects non-svg paths with 404", async () => {
    const req = new Request("https://art.cpj.fyi/foo.png");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it("sets immutable cache headers on success", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce("<svg>x</svg>");
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.headers.get("cache-control")).toContain("immutable");
    expect(resp.headers.get("cache-control")).toContain("max-age=31536000");
  });
});
