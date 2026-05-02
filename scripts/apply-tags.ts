#!/usr/bin/env tsx
/**
 * Apply tag changes from a CSV. Each row sets the FULL tag list for a post
 * (after preserving content-type / section tags as the primary tag).
 *
 * Usage:
 *   GHOST_ADMIN_API_URL=https://cpj-fyi.ghost.io \
 *   GHOST_ADMIN_API_KEY=<id>:<secret> \
 *   npx tsx scripts/apply-tags.ts <csv-path> [--dry-run]
 *
 * CSV format:
 *   slug,suggested_tags
 *   role-clarity,"org-design|teams|ai"
 *   another-post,"strategy|leadership"
 *
 * `suggested_tags` is pipe-separated (comma is reserved for CSV). Use lowercase
 * slugs. The script:
 *   - Preserves any existing content-type tag (essays/radar/five-things/
 *     hidden-patterns) and book-section tag as the primary tag, in current order
 *   - Replaces all OTHER (topical) tags with the suggested set
 *   - Auto-creates tags that don't exist yet (Ghost's behavior with slug-only refs)
 *   - Writes a backup CSV: tag-changes-backup-<timestamp>.csv with old + new for
 *     every post that changed
 *
 * --dry-run: parse, fetch, compute changes, write the backup CSV, but do not PATCH.
 */

// @ts-expect-error — no published types for the Ghost admin SDK
import GhostAdminAPI from "@tryghost/admin-api";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.GHOST_ADMIN_API_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!url || !key || !csvPath || csvPath.startsWith("--")) {
  console.error("Usage: apply-tags.ts <csv-path> [--dry-run]");
  console.error("  Required env: GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY");
  process.exit(1);
}

const api = new GhostAdminAPI({ url, key, version: "v5.0" });

// Tags that determine URL routing or section identity — preserved in current
// order at the front of the tag list (so primary_tag stays correct).
const PROTECTED = new Set([
  "essays", "radar", "five-things", "hidden-patterns",
  "start-end", "foundations", "structuring", "direction",
  "practice", "learning", "space",
]);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

type Row = { slug: string; suggested: string[] };

function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const slugIdx = headers.indexOf("slug");
  const tagsIdx = headers.indexOf("suggested_tags");
  if (slugIdx < 0 || tagsIdx < 0) {
    throw new Error("CSV must have 'slug' and 'suggested_tags' columns");
  }
  return lines.slice(1).filter((l) => l.trim().length > 0).map((line) => {
    const cols = parseCsvLine(line);
    return {
      slug: (cols[slugIdx] ?? "").trim(),
      suggested: (cols[tagsIdx] ?? "")
        .split("|")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    };
  });
}

async function fetchAllPosts(): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  while (true) {
    const batch: any = await api.posts.browse({
      limit: 100,
      page,
      fields: "id,slug,title,updated_at,primary_tag",
      include: "tags",
    });
    out.push(...batch);
    const m = batch.meta?.pagination;
    if (!m || page >= m.pages) break;
    page++;
  }
  return out;
}

async function main() {
  const csv = readFileSync(csvPath as string, "utf-8");
  const rows = parseCsv(csv);
  console.log(`Read ${rows.length} rows from ${csvPath}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log();

  console.log("Fetching all posts...");
  const allPosts = await fetchAllPosts();
  console.log(`  ${allPosts.length} posts total\n`);
  const bySlug = new Map<string, any>(allPosts.map((p) => [p.slug, p]));

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `tag-changes-backup-${ts}.csv`;
  const backupRows: string[] = ["slug,old_tags,new_tags"];

  let willChange = 0;
  let unchanged = 0;
  let notFound = 0;
  const planned: { row: Row; post: any; oldTags: string[]; newTags: string[] }[] = [];

  for (const row of rows) {
    const post = bySlug.get(row.slug);
    if (!post) { notFound++; continue; }

    const oldTags: string[] = (post.tags ?? []).map((t: any) => t.slug);
    const protectedKept = oldTags.filter((t) => PROTECTED.has(t));
    const newTopical = row.suggested.filter((t) => !PROTECTED.has(t));
    const newTags = [...protectedKept, ...newTopical];

    if (oldTags.join("|") === newTags.join("|")) { unchanged++; continue; }

    willChange++;
    planned.push({ row, post, oldTags, newTags });
    backupRows.push(
      `${csvEscape(row.slug)},${csvEscape(oldTags.join("|"))},${csvEscape(newTags.join("|"))}`
    );
  }

  writeFileSync(backupPath, backupRows.join("\n") + "\n");
  console.log(`Backup written: ${backupPath}`);
  console.log(`Plan: ${willChange} posts will change · ${unchanged} unchanged · ${notFound} not found`);
  console.log();

  if (dryRun) {
    console.log("--- preview (first 20 changes) ---");
    for (const p of planned.slice(0, 20)) {
      console.log(`  ${p.row.slug}`);
      console.log(`    - ${p.oldTags.join(", ") || "(none)"}`);
      console.log(`    + ${p.newTags.join(", ") || "(none)"}`);
    }
    if (planned.length > 20) console.log(`  ...and ${planned.length - 20} more (see backup CSV).`);
    console.log("\nRe-run without --dry-run to apply.");
    return;
  }

  console.log("Applying...");
  let ok = 0;
  let failed = 0;
  for (const p of planned) {
    try {
      await api.posts.edit({
        id: p.post.id,
        updated_at: p.post.updated_at,
        tags: p.newTags.map((slug) => ({ slug })),
      });
      ok++;
      process.stdout.write(`\r  ${ok}/${planned.length} applied (${failed} failed) `);
    } catch (e) {
      failed++;
      console.error(`\n  ${p.row.slug}: ${(e as Error).message}`);
    }
  }
  console.log();
  console.log(`\nDone. Applied ${ok}, failed ${failed}.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
