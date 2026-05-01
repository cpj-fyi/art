import { generateSvg } from "./generate";
import { fetchPostMetadata } from "./ghost";
import type { PostMetadata } from "./types";
import { RENDERER_VERSION } from "./version";

export type Env = {
  ART_CACHE: KVNamespace;
  GHOST_API_URL: string;
  GHOST_CONTENT_KEY: string;
};

const SVG_HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=31536000, immutable",
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/([^/]+)\.svg$/);
    if (!match) return new Response("Not found", { status: 404 });
    const slug = decodeURIComponent(match[1]!);

    const cacheKey = `v${RENDERER_VERSION}:${slug}`;

    const cached = await env.ART_CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, { status: 200, headers: SVG_HEADERS });
    }

    let meta: PostMetadata | null;
    try {
      meta = await fetchPostMetadata(slug, env);
    } catch {
      meta = { slug, primaryTag: null, titleLength: slug.length, publishedAtMs: Date.now() };
    }

    if (!meta) return new Response("Not found", { status: 404 });

    const svg = await generateSvg(meta);
    ctx.waitUntil(env.ART_CACHE.put(cacheKey, svg));
    return new Response(svg, { status: 200, headers: SVG_HEADERS });
  },
};
