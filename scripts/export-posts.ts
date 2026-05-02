#!/usr/bin/env tsx
/**
 * Export every Ghost post to JSON for offline analysis (e.g., tag suggestions).
 *
 * Usage:
 *   GHOST_ADMIN_API_URL=https://cpj-fyi.ghost.io \
 *   GHOST_ADMIN_API_KEY=<id>:<secret> \
 *   npx tsx scripts/export-posts.ts [--limit=N] [--no-body]
 *
 * Output: posts-export-<timestamp>.json in the current directory.
 *
 * Each entry has:
 *   { id, slug, title, published_at, primary_tag, tags: [...slugs], plaintext }
 *
 * Pass --no-body to omit plaintext (smaller file; tags-only audit).
 * Pass --limit=N to cap to first N posts (testing).
 */

// @ts-expect-error — no published types for the Ghost admin SDK
import GhostAdminAPI from "@tryghost/admin-api";
import { writeFileSync } from "node:fs";

const url = process.env.GHOST_ADMIN_API_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
const noBody = process.argv.includes("--no-body");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1] ?? "0", 10) : 0;

if (!url || !key) {
  console.error("Missing env vars. Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY.");
  process.exit(1);
}

const api = new GhostAdminAPI({ url, key, version: "v5.0" });

type Exported = {
  id: string;
  slug: string;
  title: string;
  published_at: string;
  primary_tag: string | null;
  tags: string[];
  plaintext?: string;
};

async function main() {
  console.log(`Connecting to ${url} ...`);
  console.log(`Body included: ${!noBody}`);
  if (limit > 0) console.log(`Limit: first ${limit} posts`);

  const out: Exported[] = [];
  let page = 1;
  while (true) {
    const fields = noBody
      ? "id,slug,title,published_at,primary_tag"
      : "id,slug,title,published_at,primary_tag,plaintext";
    const batch: any = await api.posts.browse({
      limit: 100,
      page,
      fields,
      include: "tags",
    });
    for (const p of batch) {
      out.push({
        id: p.id,
        slug: p.slug,
        title: p.title,
        published_at: p.published_at,
        primary_tag: p.primary_tag?.slug ?? null,
        tags: (p.tags ?? []).map((t: any) => t.slug),
        ...(noBody ? {} : { plaintext: p.plaintext ?? "" }),
      });
      if (limit > 0 && out.length >= limit) break;
    }
    if (limit > 0 && out.length >= limit) break;
    const meta = batch.meta?.pagination;
    if (!meta || page >= meta.pages) break;
    page++;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `posts-export-${ts}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  const sizeKb = Math.round(JSON.stringify(out).length / 1024);
  console.log(`Exported ${out.length} posts → ${path} (${sizeKb} KB)`);

  // Summary stats
  const tagCounts = new Map<string, number>();
  for (const p of out) for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log("\nTop 20 tags by post count:");
  for (const [tag, count] of topTags) console.log(`  ${count.toString().padStart(4)} · ${tag}`);
  const lightlyTagged = out.filter((p) => p.tags.filter((t) => !["essays","radar","five-things","hidden-patterns"].includes(t)).length === 0).length;
  console.log(`\n${lightlyTagged} posts have no topical tags (only content-type tag or untagged).`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
