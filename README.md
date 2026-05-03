# art

A Cloudflare Worker that mints a deterministic pixel-art SVG feature image for every post on [cpj.fyi](https://www.cpj.fyi), generated from a hash of the article slug + a few signals (tag, title length) pulled from the Ghost Content API.

Same slug → same image, forever. No model calls, no manual design step, ~50ms cold render, KV-cached after the first request.

## Examples

Live SVGs from the deployed Worker. GitHub renders these inline.

<table>
<tr>
<td><img alt="The End of Role Clarity" src="https://monafor.clay-893.workers.dev/the-end-of-role-clarity.svg" width="100%"></td>
<td><img alt="Survey on Hidden Patterns" src="https://monafor.clay-893.workers.dev/survey-on-hidden-patterns.svg" width="100%"></td>
</tr>
<tr>
<td><em>essay</em> · <code>the-end-of-role-clarity</code></td>
<td><em>radar</em> · <code>survey-on-hidden-patterns</code></td>
</tr>
<tr>
<td><img alt="Five OD Things N° 13" src="https://monafor.clay-893.workers.dev/five-od-things-13.svg" width="100%"></td>
<td><img alt="Nestlé Is Eating Itself" src="https://monafor.clay-893.workers.dev/nestle-is-eating-itself-on-purpose.svg" width="100%"></td>
</tr>
<tr>
<td><em>five-things</em> · <code>five-od-things-13</code></td>
<td><em>radar</em> · <code>nestle-is-eating-itself-on-purpose</code></td>
</tr>
<tr>
<td><img alt="Pace Layers for Organization" src="https://monafor.clay-893.workers.dev/pace-layers-for-organization.svg" width="100%"></td>
<td><img alt="Hidden Patterns Gift Guide" src="https://monafor.clay-893.workers.dev/the-hidden-patterns-gift-guide.svg" width="100%"></td>
</tr>
<tr>
<td><em>essay</em> · <code>pace-layers-for-organization</code></td>
<td><em>book / hidden-patterns</em> · <code>the-hidden-patterns-gift-guide</code></td>
</tr>
</table>

Each image carries an 8-character hex seed derived from `SHA-256(slug)`. You can fetch the full metadata for any image at `/<slug>.json`:

```
$ curl -s https://monafor.clay-893.workers.dev/the-end-of-role-clarity.json | jq '{slug, seed, mood, panels: (.panels | length)}'
{
  "slug": "the-end-of-role-clarity",
  "seed": "8c5a2f1d",
  "mood": "essays",
  "panels": 4
}
```

## How it works

```
GET /<slug>.svg
       │
       ├─ KV cache hit? → return cached SVG
       │
       └─ miss:
            1. fetch post metadata (Ghost Content API)
            2. SHA-256 the slug → 8-chain bit reader
            3. selectPalette(tag)                    → bg + color list
            4. composePanels(hash, meta, palette)    → 2–4 sub-rectangles, each with one strategy
            5. for each panel, runStrategy(...)      → MarkInstance[] of <rect> placements
            6. renderSvg(bg, marks)                  → <svg> string
            7. write to KV, return SVG
```

### The composition unit: panels

Each image is **2–4 panels** — non-overlapping rectangles laid out via binary space partitioning, with a 24px outer margin and 16px gaps between them. Each panel runs one strategy from a small library:

- **rhythmic** (~85% of selections): `grid`, `quilt`, `checker`, `strata`, `columns`, `field`
- **characterful sparse** (~15%): `gravity`, `chaotic`, `scatter`, `clusters`

A typical panel runs a primary mark + an optional secondary pass (~40% of panels) with a different mark and palette subset, producing the "interaction" you see between elements within a panel.

### Marks

Eight atomic shapes — `pixel`, `bar`, `stripe`, `plus`, `ring`, `diagonal`, `block`, `drip` — drawn at one or more grid cells. Some support rotation (`bar` is used by the `diagonals` strategy at 30°/45°/60°).

### Palettes

Three moods routed by the post's tag:

| Mood       | Triggered by                                                        | Background  | Palette                                                    |
|------------|---------------------------------------------------------------------|-------------|------------------------------------------------------------|
| **Book**   | `hidden-patterns` or any of the 7 section tags                      | `#F6EFDD`   | section-color arc + neutrals; section-weighted picking pool|
| **Essays** | `essays`                                                            | `#F6EFDD`   | uniform pick from the same 8-color arc                     |
| **Radar**  | `radar`                                                             | `#F6EFDD`   | same as Essays (unified visual identity, 2026-05)          |
| _default_  | any other tag (or untagged)                                         | `#F6EFDD`   | Book                                                       |

Book + a section tag uses a weighted picking pool (section ×8, two arc-neighbors ×5 each, distant arc ×1, muted ×1) so the section color reads dominant — Foundations posts feel coral; Space posts feel violet.

### Determinism

Every choice — strategy, mark, color, density, cell size, which cells get marks — comes from `hash` calls that consume bits in a fixed order. Same slug → same bit stream → same choice sequence → byte-identical SVG output. The `RENDERER_VERSION` constant in `src/version.ts` is included in the KV cache key, so bumping it invalidates all cached output without dropping the namespace.

## Endpoints

| Path              | Returns                                       |
|-------------------|-----------------------------------------------|
| `/<slug>.svg`     | The generative SVG. `image/svg+xml`. Immutable cache. |
| `/<slug>.json`    | `{ slug, seed, primaryTag, mood, bg, rendererVersion, panels: [{strategy, mark, colors, hasSecondary, x, y, width, height}] }` |
| anything else     | 404 |

CORS is open (`Access-Control-Allow-Origin: *`) on both endpoints.

## Project layout

```
src/
  index.ts        # Worker entry: routing, KV cache, Ghost fetch + fallback
  ghost.ts        # Ghost Content API client
  hash.ts         # SHA-256 + 8-chain bit reader
  palettes.ts     # mood data + section-biased weighted pool
  marks.ts        # 8 pure mark renderers (MarkInstance → SVG fragment)
  strategies.ts   # 10 arrangement strategies (canvas → MarkInstance[])
  compose.ts      # composePanels — BSP layout + slot rules
  render.ts       # SVG envelope assembly
  generate.ts     # generate() ties hash → compose → strategies → render
  types.ts        # shared type vocabulary
  version.ts      # RENDERER_VERSION (bump to invalidate cache)
test/
  *.test.ts       # vitest tests for each module + integration
  snapshot/       # 18-fixture SVG regression
scripts/
  gallery.ts                # render fixtures → HTML for visual review
  export-posts.ts           # Ghost Admin API → posts JSON (for tagging passes)
  apply-tags.ts             # apply tag-suggestions CSV back via Admin API
  clear-feature-images.ts   # bulk-clear Ghost feature_image (with backup CSV)
docs/superpowers/
  specs/*       # design spec
  plans/*       # implementation plan
```

## Development

```sh
npm install
npm test            # 100+ unit + snapshot tests
npm run gallery     # writes gallery.html with the 18 fixture SVGs and opens it
npm run dev         # wrangler dev (local Worker)
```

Tests run in vitest's node pool — the `@cloudflare/vitest-pool-workers` `workerd` binary doesn't start when the project path contains spaces (e.g., iCloud "Mobile Documents"). The Worker itself is unaffected.

## Deploy

```sh
# one-time
npx wrangler login
npx wrangler kv namespace create ART_CACHE     # paste the id into wrangler.toml
npx wrangler secret put GHOST_CONTENT_KEY      # Ghost → Settings → Integrations

# every change
npx wrangler deploy
```

The Worker reads `GHOST_API_URL` (in `[vars]`) and `GHOST_CONTENT_KEY` (secret). KV namespace binding is `ART_CACHE`. To force a cache invalidation across all slugs, bump `RENDERER_VERSION` in `src/version.ts` and redeploy.

## Tooling for the Ghost side

These scripts speak the Ghost **Admin** API (write-capable) and live in `scripts/`. They're separate from the Worker but share the `@tryghost/admin-api` dependency.

```sh
# Export every post (with body) as JSON for offline analysis
GHOST_ADMIN_API_URL=https://cpj-fyi.ghost.io \
GHOST_ADMIN_API_KEY=<id>:<secret> \
npx tsx scripts/export-posts.ts

# Bulk-apply a tag-changes CSV (slug,suggested_tags) back via Admin API
npx tsx scripts/apply-tags.ts tag-suggestions.csv --dry-run
npx tsx scripts/apply-tags.ts tag-suggestions.csv

# Clear feature_image on every post (writes a backup CSV first)
npx tsx scripts/clear-feature-images.ts --dry-run
npx tsx scripts/clear-feature-images.ts
```

Each script writes a timestamped backup CSV before any destructive operation.

## Theme integration

The companion theme [`cpj-fyi/cpj-theme`](https://github.com/cpj-fyi/cpj-theme) consumes the SVGs:

- Fallback `<meta property="og:image">` for posts without a Ghost feature image
- Post-card thumbnails on tag pages and feeds
- A 50 px peek strip with a click-to-expand reveal at the top of post pages, with parameter-driven microcopy fetched from the `/<slug>.json` endpoint (e.g. `0xddc7b2a4 · 4 panels · grid · diagonals · field · scatter`)

The theme stores the Worker base URL in a custom setting `art_url`, so when the DNS migrates and a custom domain (e.g. `art.cpj.fyi`) is wired up, only one setting changes.

## License

MIT.
