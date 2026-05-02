#!/usr/bin/env tsx
/**
 * Clear feature_image on every Ghost post, with a CSV backup so it's reversible.
 *
 * Usage:
 *   GHOST_ADMIN_API_URL=https://cpj.fyi \
 *   GHOST_ADMIN_API_KEY=<id>:<secret> \
 *   npx tsx scripts/clear-feature-images.ts [--dry-run] [--include-pages]
 *
 * Get the admin key from: Ghost Admin → Settings → Integrations → (existing or new
 * Custom Integration) → Admin API Key. NOT the Content API Key.
 *
 * The CSV backup is written to feature-images-backup-<timestamp>.csv in the
 * current directory. Restore by patching each row back via the same SDK.
 */

// @ts-expect-error — no published types for the Ghost admin SDK
import GhostAdminAPI from "@tryghost/admin-api";
import { writeFileSync } from "node:fs";

const url = process.env.GHOST_ADMIN_API_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
const dryRun = process.argv.includes("--dry-run");
const includePages = process.argv.includes("--include-pages");

if (!url || !key) {
  console.error("Missing env vars. Set GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY.");
  console.error("  GHOST_ADMIN_API_URL=https://cpj.fyi");
  console.error("  GHOST_ADMIN_API_KEY=<id>:<secret>  (Admin API Key, not Content)");
  process.exit(1);
}

type GhostItem = {
  id: string;
  slug: string;
  title: string;
  feature_image: string | null;
  updated_at: string;
};

const api = new GhostAdminAPI({ url, key, version: "v5.0" });

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchAll(kind: "posts" | "pages"): Promise<GhostItem[]> {
  const out: GhostItem[] = [];
  let page = 1;
  while (true) {
    const batch = await api[kind].browse({
      limit: 100,
      page,
      fields: "id,slug,title,feature_image,updated_at",
    });
    out.push(...batch);
    const meta = batch.meta?.pagination;
    if (!meta || page >= meta.pages) break;
    page++;
  }
  return out;
}

async function main() {
  console.log(`Connecting to ${url} ...`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE — will clear feature_image"}`);
  console.log(`Scope: posts${includePages ? " + pages" : " only (use --include-pages to include)"}`);
  console.log();

  console.log("Fetching posts...");
  const posts = await fetchAll("posts");
  console.log(`  ${posts.length} posts total`);

  let pages: GhostItem[] = [];
  if (includePages) {
    console.log("Fetching pages...");
    pages = await fetchAll("pages");
    console.log(`  ${pages.length} pages total`);
  }

  const items = [
    ...posts.map((p) => ({ ...p, _kind: "post" as const })),
    ...pages.map((p) => ({ ...p, _kind: "page" as const })),
  ];
  const withImages = items.filter((i) => i.feature_image);
  console.log();
  console.log(`${withImages.length} of ${items.length} have a feature_image set.`);

  if (withImages.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  // Always write the backup CSV, even on dry run, so the user can review.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = `feature-images-backup-${ts}.csv`;
  const header = "kind,id,slug,title,feature_image";
  const rows = withImages.map((i) =>
    [i._kind, i.id, i.slug, csvEscape(i.title), csvEscape(i.feature_image!)].join(",")
  );
  writeFileSync(csvPath, [header, ...rows].join("\n") + "\n");
  console.log(`Backup written: ${csvPath}`);
  console.log();

  if (dryRun) {
    console.log("--- preview of what would be cleared ---");
    for (const i of withImages.slice(0, 30)) {
      console.log(`  [${i._kind}] ${i.slug}  ←  ${i.feature_image}`);
    }
    if (withImages.length > 30) {
      console.log(`  ...and ${withImages.length - 30} more (see CSV for full list).`);
    }
    console.log();
    console.log("Re-run without --dry-run to apply.");
    return;
  }

  console.log("Clearing...");
  let cleared = 0;
  let failed = 0;
  const failures: { slug: string; error: string }[] = [];

  for (const i of withImages) {
    try {
      await api[i._kind === "post" ? "posts" : "pages"].edit({
        id: i.id,
        updated_at: i.updated_at,
        feature_image: null,
      });
      cleared++;
      process.stdout.write(`\r  ${cleared}/${withImages.length} cleared (${failed} failed) `);
    } catch (e) {
      failed++;
      failures.push({ slug: i.slug, error: (e as Error).message });
    }
  }
  console.log();
  console.log();
  console.log(`Cleared ${cleared} of ${withImages.length}. ${failed} failed.`);
  if (failures.length > 0) {
    console.log();
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f.slug}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
