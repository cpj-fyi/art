import type { PostMetadata } from "./types";

export type GhostEnv = {
  GHOST_API_URL: string;
  GHOST_CONTENT_KEY: string;
};

type GhostPost = {
  slug: string;
  title: string;
  primary_tag?: { slug: string } | null;
  tags?: Array<{ slug: string }>;
  published_at: string;
};
type GhostResponse = { posts?: GhostPost[]; pages?: GhostPost[] };

async function fetchOne(base: string, slug: string, params: URLSearchParams): Promise<GhostPost | null> {
  const url = `${base}/slug/${encodeURIComponent(slug)}/?${params.toString()}`;
  const resp = await fetch(url);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Ghost API ${resp.status}: ${resp.statusText}`);
  const data = (await resp.json()) as GhostResponse;
  return data.posts?.[0] ?? data.pages?.[0] ?? null;
}

export async function fetchPostMetadata(slug: string, env: GhostEnv): Promise<PostMetadata | null> {
  // NOTE: we deliberately do NOT pass `fields` here — the Content API drops
  // the `tags` include when fields is set to a restricted list, even if you
  // include "tags". Asking for everything keeps the response small enough
  // (~5 KB per post) and reliably includes the tags relation we need.
  const params = new URLSearchParams({
    key: env.GHOST_CONTENT_KEY,
    include: "tags",
  });
  // Try /posts/slug first, then /pages/slug — book chapters are Ghost pages,
  // not posts, and use the same root-level URL space as posts on cpj.fyi.
  const pagesBase = env.GHOST_API_URL.replace(/\/posts\/?$/, "/pages");
  const post =
    (await fetchOne(env.GHOST_API_URL, slug, params)) ??
    (pagesBase !== env.GHOST_API_URL ? await fetchOne(pagesBase, slug, params) : null);
  if (!post) return null;

  // Ghost's Content API doesn't return `primary_tag` when `fields` is set
  // without explicitly listing it. Fall back to deriving it from the tags
  // array (first non-internal tag — internal tags start with '#').
  const fromPrimary = post.primary_tag?.slug;
  const fromTags = post.tags?.find((t) => !t.slug.startsWith("#"))?.slug;
  const primaryTag = fromPrimary ?? fromTags ?? null;

  return {
    slug: post.slug,
    primaryTag,
    titleLength: post.title.length,
    publishedAtMs: Date.parse(post.published_at),
  };
}
