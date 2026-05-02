import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPostMetadata } from "../src/ghost";

const ENV = {
  GHOST_API_URL: "https://cpj.fyi/ghost/api/content/posts",
  GHOST_CONTENT_KEY: "abcd1234",
};

describe("fetchPostMetadata", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns metadata when the post exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{
        slug: "hello-world",
        title: "Hello, world",
        primary_tag: { slug: "essays" },
        published_at: "2025-01-15T12:00:00Z",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const meta = await fetchPostMetadata("hello-world", ENV);
    expect(meta).not.toBeNull();
    expect(meta!.slug).toBe("hello-world");
    expect(meta!.primaryTag).toBe("essays");
    expect(meta!.titleLength).toBe("Hello, world".length);
    expect(meta!.publishedAtMs).toBe(Date.parse("2025-01-15T12:00:00Z"));
  });

  it("returns null when post not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));
    const meta = await fetchPostMetadata("missing", ENV);
    expect(meta).toBeNull();
  });

  it("returns null on Ghost 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const meta = await fetchPostMetadata("missing", ENV);
    expect(meta).toBeNull();
  });

  it("throws on network errors so caller can fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ENETUNREACH"));
    await expect(fetchPostMetadata("anything", ENV)).rejects.toThrow();
  });

  it("handles missing primary_tag gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "tagless", title: "X", primary_tag: null, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));
    const meta = await fetchPostMetadata("tagless", ENV);
    expect(meta!.primaryTag).toBeNull();
  });

  it("requests the slug endpoint with the content key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "x", title: "X", primary_tag: null, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));
    await fetchPostMetadata("x", ENV);
    const url = (fetchSpy.mock.calls[0]![0] as string);
    expect(url).toContain("/slug/x");
    expect(url).toContain("key=abcd1234");
    expect(url).toContain("include=tags");
  });
});
