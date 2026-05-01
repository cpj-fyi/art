# Article-Hash Feature Image Generator — Design

**Status:** spec / pre-implementation
**Date:** 2026-05-01
**Owner:** clay@cpj.fyi
**Project:** `monafor`

## Problem

cpj.fyi posts need feature images. Sourcing or designing one per post is a tax that scales with publishing cadence. Generative pixel art produced from the post's own metadata gives every post a unique, on-brand image automatically — no manual step.

## Goals

- Every post gets a unique, deterministic feature image
- Image is fully derivable from the post's slug + tag + a few signals; same inputs → same image, forever
- **Use cases:** social share previews (OG / Twitter cards) + post-card thumbnails on tag/index pages. The image is *not* shown at the top of the post body itself.
- Default size 1200 × 630 (OG card standard); same SVG viewBox is used wherever the image surfaces
- Image is on-brand: anchored to the colophon palette, shifts mood by post type
- Generation is cheap (sub-100ms cold), cached aggressively (effectively forever)
- Adding to the vocabulary (new mark, new strategy, new mood) is a small contained change

## Non-goals

- In-post hero rendering. Posts have their own typographic header treatment; the generated image is for surfaces *outside* the post body.
- Browser-side animation, interactivity, or motion
- Per-post manual overrides (any post that needs custom art uses Ghost's normal feature-image upload — the generator only serves posts without a feature image set)
- Reflecting post *content* (body text, named entities, embeddings, etc.). The art is decorative entropy steered by metadata, not semantic illustration.
- Rasterization. Output is SVG only; consumers that need raster (e.g., social cards) handle conversion themselves.

## Architecture

### Runtime: Cloudflare Worker

A new Worker, separate from the existing `cpj-worker` (which is Slack-webhook-only). Lives in the `monafor` directory.

```
Browser/Ghost  ──GET──▶  art.cpj.fyi/<slug>.svg  ──▶  Worker
                                                       │
                                                       ├─ KV cache hit → return cached SVG
                                                       │
                                                       └─ miss:
                                                            1. fetch post metadata via Ghost Content API
                                                            2. compute hash + signals
                                                            3. compose layers
                                                            4. render SVG
                                                            5. write KV
                                                            6. return SVG
```

### URL pattern

- `https://art.cpj.fyi/<slug>.svg` — primary
- `https://art.cpj.fyi/<slug>.svg?v=<n>` — optional cache buster for re-rendering after a vocabulary change

The slug is the only path segment. Everything else (tag, length, date) is fetched from Ghost.

### Caching

- **KV** stores `slug → svg-string`. TTL: none — entries persist until explicitly invalidated. Same inputs always produce the same output, so cache is correct forever.
- **HTTP** response: `Cache-Control: public, max-age=31536000, immutable`. The CDN edge caches the SVG; clients cache it; the URL itself is the cache key.
- **Invalidation:** `?v=<n>` query string busts. Bumping a global `RENDERER_VERSION` constant in the Worker invalidates all cached output by including the version in the KV key.

## The composition engine

### Top-level recipe

Each image is a stack of **2–3 layers**, each independently picking from the vocabulary:

```
image = stack(layers)
layer = (mark, strategy, palette-subset, density, cell-size, alignment)
```

### Vocabulary

**Marks** — atomic shapes drawn at a single grid cell or scaled multiple:

| key | description |
|---|---|
| `pixel` | solid square cell |
| `bar` | horizontal rectangle, wide × 1 |
| `stripe` | vertical rectangle, 1 × tall |
| `plus` | 5-cell cross |
| `ring` | hollow square (lifebuoy) |
| `diagonal` | staircase line |
| `block` | N × M filled rectangle |
| `drip` | vertical line of varied length |

**Arrangement strategies** — how marks are placed:

| key | description |
|---|---|
| `grid` | every cell on stride N, fully regular |
| `strata` | horizontal bands, each band a different color/density |
| `columns` | vertical lanes, each a different color/density |
| `scatter` | sparse random placement on cells |
| `quilt` | repeated compound motif on regular grid |
| `checker` | alternating offset rows |
| `clusters` | tight groups, sparse otherwise |
| `field` | large filled region (typically a base layer) |
| `chaotic` | free placement on a fine sub-grid, no alignment |
| `gravity` | marks settle and stack at the bottom |

### Layer stacking rules

- **Layer 1 (base)** — typically `field`, `grid`, or `strata`. Sets the overall structure.
- **Layer 2 (figure)** — typically `quilt`, `columns`, `clusters`, or `bar/stripe` arrangements. The dominant mark.
- **Layer 3 (accent, optional)** — typically `scatter`, `chaotic`, or `gravity`. Sparse, high-contrast color.

The hash decides whether 2 or 3 layers are used and which strategies fall in each slot. Strategy compatibility is enforced (e.g., `field` can't be the figure layer; `chaotic` can't be the base layer).

### Canvas

- **Output viewBox:** `0 0 1200 630`
- **Default cell size:** 15 px (giving an 80 × 42 working grid)
- **Cell size variation:** the hash can scale cells per layer between 10 px and 30 px, so layers can interlock at different resolutions

## Hash and signals

### Inputs

The Worker pulls these per request:

| input | source | role |
|---|---|---|
| `slug` | URL path | primary entropy via SHA-256 |
| `primary_tag` | Ghost Content API | palette mood selection |
| `title.length` | Ghost | density bias |
| `published_at` age in days | Ghost | secondary axis (TBD: layer count or chroma) |

If the Ghost fetch fails, the Worker falls back to slug-only generation (mood defaults to Book).

### Hash function

```
seed = SHA-256(slug)        // 32 bytes
bytes = bit reader over `seed`
```

A `bytes.next(n)` call consumes `n` bits from `seed` and returns an integer. Used throughout the renderer to make discrete picks (mark choice, strategy choice, color index, etc.). When `seed` is exhausted, hash continues with `SHA-256(seed)` (extension).

### Signal → axis mapping

| signal | drives | mapping |
|---|---|---|
| `primary_tag` | palette mood | `hidden-patterns` or any section tag → Book; `radar` → Radar; `essays` → Essays; else Book |
| `title.length` | layer-1 density | scaled from 0.15 (≤20 chars) to 0.85 (≥80 chars) |
| `published_at` age | layer count | <30 days → bias toward 3 layers; >180 days → bias toward 2 layers (quieter as posts age) |
| `seed` bytes | everything else | mark, strategy, cell size, color picks, alignment, rotation seed for chaotic/gravity |

These are starting mappings — see "Open questions" below.

## Palette system

Three moods, selected by tag:

### Book

- **Background:** `#F8F8F8`
- **Palette:** the seven-color section arc + structural neutrals
  - `#222222` start-and-end · `#FF3252` foundations · `#E9306B` structuring · `#D83586` direction · `#BD31BF` practice · `#9F36CE` learning · `#8438F2` space · `#999999` muted
- **Behavior — strongly section-biased.** The post's section tag dominates. The section color + its two immediate neighbors on the arc account for ~80% of all colored marks; distant sections appear rarely (~5–10%) as occasional accents; black/grey carries the rest. A Foundations post is unmistakably coral; a Space post is unmistakably violet. Adjacent sections give *just enough* variation to feel related rather than monotonous.

### Radar

- **Background:** `#1A1A1A` (the only mood that flips dark)
- **Palette:** `#00FF88` radar green · `#00CCFF` cyan · `#FF00C8` magenta · `#FFE600` lemon · `#FFFFFF` white · `#666666` muted
- **Behavior:** sparser by default than the other two — neon doesn't crowd. Layer count biased toward 2.

### Essays (Monocle, brighter)

- **Background:** `#F6EFDD` (warm magazine cream)
- **Palette quartet:** `#2C5489` navy · `#DC5440` brick · `#2D6B4F` bottle green · `#E5B055` mustard
- **Accents:** `#D89099` dusty pink · `#B8D2DE` powder blue · `#C4A87C` camel
- **Structure:** `#2A2A2A` charcoal
- **Behavior:** strategies skewed toward `strata` and `columns` (more "magazine layout" than scatter). Each piece picks ~5 of the 8 colors.

### Per-piece color selection

For each layer:

1. Pick palette subset based on mood + section bias (Book) or quartet preference (Essays)
2. Pick a dominant color (used for ~60% of marks in that layer)
3. Pick 1–2 accent colors (used for the remaining marks)

A single image typically uses 4–6 distinct hues across all layers.

## Components

```
monafor/
├── src/
│   ├── index.ts            # Worker entry: routing, KV, Ghost fetch, response
│   ├── ghost.ts            # Ghost Content API client
│   ├── hash.ts             # SHA-256 + bit reader
│   ├── compose.ts          # layer stack orchestration
│   ├── marks.ts            # mark library (pixel, bar, stripe, plus, ring, diagonal, block, drip)
│   ├── strategies.ts       # arrangement library (grid, strata, columns, scatter, quilt, checker, clusters, field, chaotic, gravity)
│   ├── palettes.ts         # mood definitions, color picking
│   ├── render.ts           # SVG string assembly
│   └── version.ts          # RENDERER_VERSION constant
├── test/
│   ├── snapshot/           # rendered SVGs per slug for regression
│   ├── hash.test.ts
│   ├── compose.test.ts
│   └── render.test.ts
├── wrangler.toml
└── package.json
```

Each module has a single responsibility and a small surface:

- `hash.ts` — SHA-256 → bit reader. No knowledge of art.
- `marks.ts` — pure functions: `(grid_x, grid_y, color, cell_size) → svg-string`. No knowledge of placement.
- `strategies.ts` — pure functions: `(canvas, mark, palette, density, hash) → list-of-mark-calls`. No knowledge of color theory.
- `palettes.ts` — pure data + selection helpers. No knowledge of strategies.
- `compose.ts` — orchestrates: pick layer count, pick strategies, call mark + strategy fns, return composed list.
- `render.ts` — assembles final `<svg>` string. No business logic.

## Error handling

| condition | behavior |
|---|---|
| Slug returns 404 from Ghost | Worker returns 404 (no fallback art — bad slug is a real error) |
| Ghost API timeout/error | fall back to slug-only generation, mood = Book |
| Render exception | return a static fallback SVG (a single `#FF3252` rectangle on `#F8F8F8`); log to Workers Analytics |
| KV write fails | continue; return generated SVG anyway, just don't cache |

## Testing

- **Unit:** mark + strategy fns are pure; testable with simple input/output assertions
- **Snapshot:** a fixture set of ~20 representative slugs (covering all three moods, varied lengths, varied ages) renders to checked-in SVGs. A regression run compares output. Renderer version bump regenerates all snapshots intentionally.
- **Visual review:** an `npm run gallery` script renders the snapshot set into a single HTML file for eyeballing — used during vocabulary tuning.

## Performance budget

- Cold execution (no KV hit): < 100ms
- Ghost API fetch: < 50ms (Ghost Content API + edge proximity)
- KV cache hit (warm): < 10ms

SVG output target: < 50KB, typically 5–25KB.

## Open questions

These are explicit decisions to defer until the spec is approved or until first implementation surfaces a constraint:

1. **`published_at` axis** — currently mapped to layer count. Could instead modulate chroma (older = desaturated). Tentative; revisit during visual tuning.
2. **Strategy compatibility table** — which (base, figure, accent) triples are allowed? Sketched above; finalize when implementing `compose.ts`.
3. **`?v=<n>` cache-bust UX** — is this just a manual escape hatch, or does Ghost's webhook fire it automatically when a post is updated?

## Out-of-scope follow-ups (won't address now)

- Multiple aspect-ratio outputs (square for Instagram, vertical for stories) — adding `?aspect=1:1` is straightforward but not in v1
- Animated SVG variants (`<animate>` for radar)
- Generating PNG/AVIF rasterized variants for clients that need them
- Vocabulary additions beyond the launch set (organic curves, Voronoi-derived shapes, text glyphs)
- Drift-free re-renders when the vocabulary itself evolves — handled crudely via `RENDERER_VERSION`
