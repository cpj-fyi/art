import type { PostMetadata } from "./types";

export type GhostEnv = {
  GHOST_API_URL: string;
  GHOST_CONTENT_KEY: string;
};

type GhostResponse = {
  posts?: Array<{
    slug: string;
    title: string;
    primary_tag?: { slug: string } | null;
    published_at: string;
  }>;
};

export async function fetchPostMetadata(slug: string, env: GhostEnv): Promise<PostMetadata | null> {
  const params = new URLSearchParams({
    key: env.GHOST_CONTENT_KEY,
    fields: "slug,title,published_at",
    include: "tags",
  });
  const url = `${env.GHOST_API_URL}/slug/${encodeURIComponent(slug)}/?${params.toString()}`;
  const resp = await fetch(url);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Ghost API ${resp.status}: ${resp.statusText}`);
  const data = (await resp.json()) as GhostResponse;
  const post = data.posts?.[0];
  if (!post) return null;
  return {
    slug: post.slug,
    primaryTag: post.primary_tag?.slug ?? null,
    titleLength: post.title.length,
    publishedAtMs: Date.parse(post.published_at),
  };
}
