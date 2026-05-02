import { generate } from "./generate";
import { fetchPostMetadata } from "./ghost";
import type { PostMetadata } from "./types";
import { RENDERER_VERSION } from "./version";

export type Env = {
  ART_CACHE: KVNamespace;
  GHOST_API_URL: string;
  GHOST_CONTENT_KEY: string;
};

const COMMON_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
  "access-control-allow-origin": "*",
};

const SVG_HEADERS = {
  ...COMMON_HEADERS,
  "content-type": "image/svg+xml; charset=utf-8",
};

const JSON_HEADERS = {
  ...COMMON_HEADERS,
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const svgMatch = url.pathname.match(/^\/([^/]+)\.svg$/);
    const jsonMatch = url.pathname.match(/^\/([^/]+)\.json$/);
    if (!svgMatch && !jsonMatch) return new Response("Not found", { status: 404 });

    const isJson = !!jsonMatch;
    const slug = decodeURIComponent((svgMatch ?? jsonMatch)![1]!);

    const svgKey = `v${RENDERER_VERSION}:svg:${slug}`;
    const jsonKey = `v${RENDERER_VERSION}:json:${slug}`;
    const cacheKey = isJson ? jsonKey : svgKey;

    const cached = await env.ART_CACHE.get(cacheKey);
    if (cached) {
      return new Response(cached, { status: 200, headers: isJson ? JSON_HEADERS : SVG_HEADERS });
    }

    let meta: PostMetadata | null;
    try {
      meta = await fetchPostMetadata(slug, env);
    } catch {
      meta = { slug, primaryTag: null, titleLength: slug.length, publishedAtMs: Date.now() };
    }
    if (!meta) return new Response("Not found", { status: 404 });

    const { svg, metadata } = await generate(meta);
    const jsonBody = JSON.stringify(metadata);

    ctx.waitUntil(Promise.all([
      env.ART_CACHE.put(svgKey, svg),
      env.ART_CACHE.put(jsonKey, jsonBody),
    ]));

    return new Response(isJson ? jsonBody : svg, {
      status: 200,
      headers: isJson ? JSON_HEADERS : SVG_HEADERS,
    });
  },
};
