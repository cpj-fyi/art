import { generate } from "./generate";
import { svgToPng } from "./png";
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
const SVG_HEADERS = { ...COMMON_HEADERS, "content-type": "image/svg+xml; charset=utf-8" };
const JSON_HEADERS = { ...COMMON_HEADERS, "content-type": "application/json; charset=utf-8" };
const PNG_HEADERS = { ...COMMON_HEADERS, "content-type": "image/png" };

async function fetchMeta(slug: string, env: Env): Promise<PostMetadata | null> {
  try {
    return await fetchPostMetadata(slug, env);
  } catch {
    // Ghost down — fall back to slug-only
    return { slug, primaryTag: null, titleLength: slug.length, publishedAtMs: Date.now() };
  }
}

async function getOrGenerate(
  slug: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<{ svg: string; jsonBody: string } | null> {
  const svgKey = `v${RENDERER_VERSION}:svg:${slug}`;
  const jsonKey = `v${RENDERER_VERSION}:json:${slug}`;
  const cachedSvg = await env.ART_CACHE.get(svgKey);
  const cachedJson = await env.ART_CACHE.get(jsonKey);
  if (cachedSvg && cachedJson) {
    return { svg: cachedSvg, jsonBody: cachedJson };
  }
  const meta = await fetchMeta(slug, env);
  if (!meta) return null;
  const { svg, metadata } = await generate(meta);
  const jsonBody = JSON.stringify(metadata);
  ctx.waitUntil(Promise.all([
    env.ART_CACHE.put(svgKey, svg),
    env.ART_CACHE.put(jsonKey, jsonBody),
  ]));
  return { svg, jsonBody };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const svgMatch = url.pathname.match(/^\/([^/]+)\.svg$/);
    const jsonMatch = url.pathname.match(/^\/([^/]+)\.json$/);
    const pngMatch = url.pathname.match(/^\/([^/]+)\.png$/);
    if (!svgMatch && !jsonMatch && !pngMatch) return new Response("Not found", { status: 404 });

    const isJson = !!jsonMatch;
    const isPng = !!pngMatch;
    const slug = decodeURIComponent((svgMatch ?? jsonMatch ?? pngMatch)![1]!);

    if (isPng) {
      const pngKey = `v${RENDERER_VERSION}:png:${slug}`;
      const cachedPng = await env.ART_CACHE.get(pngKey, "arrayBuffer");
      if (cachedPng) {
        return new Response(cachedPng, { status: 200, headers: PNG_HEADERS });
      }
      const result = await getOrGenerate(slug, env, ctx);
      if (!result) return new Response("Not found", { status: 404 });
      const pngBytes = await svgToPng(result.svg);
      ctx.waitUntil(env.ART_CACHE.put(pngKey, pngBytes));
      return new Response(pngBytes, { status: 200, headers: PNG_HEADERS });
    }

    // SVG or JSON
    const result = await getOrGenerate(slug, env, ctx);
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(isJson ? result.jsonBody : result.svg, {
      status: 200,
      headers: isJson ? JSON_HEADERS : SVG_HEADERS,
    });
  },
};
