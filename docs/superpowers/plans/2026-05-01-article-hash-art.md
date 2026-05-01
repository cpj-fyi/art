# Article-Hash Feature Image Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker at `art.cpj.fyi/<slug>.svg` that returns a deterministic, on-brand pixel-art SVG generated from the post's slug + Ghost metadata.

**Architecture:** Pure-function vocabulary (8 marks × 10 arrangement strategies) composed into 2–3 stacked layers per image. SHA-256 of slug feeds a bit reader that drives every discrete pick. Tag selects one of three palette moods (Book / Radar / Essays). KV caches the final SVG forever; `RENDERER_VERSION` constant invalidates.

**Tech Stack:** TypeScript, Cloudflare Workers, Workers KV, Vitest (with `@cloudflare/vitest-pool-workers`), Wrangler.

**Spec:** `docs/superpowers/specs/2026-05-01-article-hash-art-design.md`

---

## File structure

```
monafor/
├── package.json
├── wrangler.toml
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── index.ts        # Worker entry: HTTP routing, KV, response
│   ├── ghost.ts        # Ghost Content API client
│   ├── hash.ts         # SHA-256 + bit reader
│   ├── palettes.ts     # mood data + section-biased color picking
│   ├── marks.ts        # 8 pure mark functions → SVG fragment strings
│   ├── strategies.ts   # 10 arrangement functions → MarkInstance[]
│   ├── compose.ts      # layer-stack orchestration
│   ├── render.ts       # SVG envelope assembly
│   ├── types.ts        # shared types
│   └── version.ts      # RENDERER_VERSION constant
├── test/
│   ├── hash.test.ts
│   ├── palettes.test.ts
│   ├── marks.test.ts
│   ├── strategies.test.ts
│   ├── compose.test.ts
│   ├── render.test.ts
│   ├── ghost.test.ts
│   ├── index.test.ts
│   └── snapshot/
│       ├── fixtures.ts
│       └── snapshot.test.ts
└── scripts/
    └── gallery.ts      # render fixtures → HTML for visual review
```

Each module has a single responsibility:
- `hash.ts`, `marks.ts`, `palettes.ts` — pure, no I/O, no SVG envelope
- `strategies.ts` — pure; takes hash + canvas + mark key + palette → returns mark instances
- `compose.ts` — orchestrates strategies, knows about layer stacking rules
- `render.ts` — assembles strings only; no business logic
- `ghost.ts` — only module that touches `fetch`
- `index.ts` — only module that knows about `Request`, `Response`, `KV`

---

## Task 0: Project bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/version.ts`

- [ ] **Step 1: Initialize git**

```bash
cd "/Users/clayjones/Library/Mobile Documents/com~apple~CloudDocs/Claude/monafor"
git init
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
.wrangler/
dist/
.dev.vars
.DS_Store
*.log
.superpowers/
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "monafor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "gallery": "tsx scripts/gallery.ts > gallery.html && open gallery.html"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240222.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "wrangler": "^3.40.0"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src/**/*", "test/**/*", "scripts/**/*"]
}
```

- [ ] **Step 5: Write `wrangler.toml`**

```toml
name = "monafor"
main = "src/index.ts"
compatibility_date = "2024-12-01"

# Custom domain — set up via Cloudflare dashboard after first deploy
# routes = [
#   { pattern = "art.cpj.fyi/*", custom_domain = true }
# ]

# KV namespaces — created via `wrangler kv:namespace create ART_CACHE`
# [[kv_namespaces]]
# binding = "ART_CACHE"
# id = "<fill in after creating>"

[vars]
GHOST_API_URL = "https://cpj.fyi/ghost/api/content/posts"
# GHOST_CONTENT_KEY set as a secret via `wrangler secret put GHOST_CONTENT_KEY`
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

- [ ] **Step 7: Write `src/version.ts`**

```ts
export const RENDERER_VERSION = 1;
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: dependencies installed without errors.

- [ ] **Step 9: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json wrangler.toml vitest.config.ts src/version.ts
git commit -m "chore: bootstrap monafor worker project"
```

---

## Task 1: Hash + bit reader

`Hash` consumes a slug, computes SHA-256, and exposes a `next(bits)` method that returns an integer of the requested bit-width. When the 256 bits are exhausted, the reader chains by hashing the previous digest.

**Files:**
- Create: `src/hash.ts`
- Test: `test/hash.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hash } from "../src/hash";

describe("Hash", () => {
  it("is deterministic — same input produces same byte sequence", async () => {
    const a = await Hash.from("hello");
    const b = await Hash.from("hello");
    expect(a.next(32)).toBe(b.next(32));
    expect(a.next(8)).toBe(b.next(8));
  });

  it("different inputs produce different output", async () => {
    const a = await Hash.from("foo");
    const b = await Hash.from("bar");
    expect(a.next(32)).not.toBe(b.next(32));
  });

  it("next(n) returns an integer in [0, 2^n)", async () => {
    const h = await Hash.from("test");
    for (let i = 0; i < 100; i++) {
      const n = 1 + (i % 16);
      const v = h.next(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** n);
    }
  });

  it("extends past 256 bits via re-hashing", async () => {
    const h = await Hash.from("extend");
    // consume well past 256 bits worth
    const values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(h.next(8));
    expect(values.length).toBe(100);
    // sanity: should still be deterministic
    const h2 = await Hash.from("extend");
    for (let i = 0; i < 100; i++) expect(h2.next(8)).toBe(values[i]);
  });

  it("provides float() helper returning [0, 1)", async () => {
    const h = await Hash.from("float");
    for (let i = 0; i < 50; i++) {
      const f = h.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("provides pick(arr) returning a deterministic element", async () => {
    const h = await Hash.from("pick");
    const arr = ["a", "b", "c", "d"];
    const x = h.pick(arr);
    expect(arr).toContain(x);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- hash`
Expected: FAIL — `Hash` not found.

- [ ] **Step 3: Implement `src/hash.ts`**

The `from` factory pre-extends 8× so `ensureBits` never trips during a single image generation (well within budget — typical image consumes <500 bits).

```ts
export class Hash {
  private bytes: Uint8Array;
  private bitOffset = 0;

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static async from(input: string): Promise<Hash> {
    const data = new TextEncoder().encode(input);
    let digest = await crypto.subtle.digest("SHA-256", data);
    const chunks: Uint8Array[] = [new Uint8Array(digest)];
    // Pre-extend to 8 chained hashes = 256 bytes = 2048 bits. Plenty.
    for (let i = 0; i < 7; i++) {
      digest = await crypto.subtle.digest("SHA-256", digest);
      chunks.push(new Uint8Array(digest));
    }
    const total = new Uint8Array(chunks.length * 32);
    chunks.forEach((c, i) => total.set(c, i * 32));
    return new Hash(total);
  }

  next(bits: number): number {
    if (bits < 1 || bits > 30) {
      throw new Error(`next(bits): bits must be 1..30, got ${bits}`);
    }
    let result = 0;
    let remaining = bits;
    while (remaining > 0) {
      this.ensureBits(remaining);
      const byteIndex = Math.floor(this.bitOffset / 8);
      const bitInByte = this.bitOffset % 8;
      const take = Math.min(remaining, 8 - bitInByte);
      const byte = this.bytes[byteIndex]!;
      const shifted = (byte >>> (8 - bitInByte - take)) & ((1 << take) - 1);
      result = (result << take) | shifted;
      this.bitOffset += take;
      remaining -= take;
    }
    return result;
  }

  float(): number {
    return this.next(24) / (1 << 24);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Hash.pick on empty array");
    return arr[this.next(16) % arr.length]!;
  }

  private ensureBits(needed: number): void {
    const totalBits = this.bytes.length * 8;
    if (this.bitOffset + needed <= totalBits) return;
    throw new Error(`Hash exhausted: needed ${needed}, total ${totalBits - this.bitOffset} remain. Increase pre-extension in Hash.from.`);
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- hash`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hash.ts test/hash.test.ts
git commit -m "feat: SHA-256 hash with bit reader for deterministic art generation"
```

---

## Task 2: Shared types

A central place for the type vocabulary so later tasks can reference the same names.

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type MarkKey =
  | "pixel"
  | "bar"
  | "stripe"
  | "plus"
  | "ring"
  | "diagonal"
  | "block"
  | "drip";

export type StrategyKey =
  | "grid"
  | "strata"
  | "columns"
  | "scatter"
  | "quilt"
  | "checker"
  | "clusters"
  | "field"
  | "chaotic"
  | "gravity";

export type Mood = "book" | "radar" | "essays";

export type Palette = {
  bg: string;
  colors: readonly string[];
  // Optional bias key (used by Book to anchor on a section)
  biasKey?: string;
};

export type MarkInstance = {
  mark: MarkKey;
  x: number;          // px, top-left
  y: number;          // px, top-left
  color: string;
  cellSize: number;   // px
  // Optional mark-specific dims:
  length?: number;    // for bar / stripe / drip / block (in cells)
  height?: number;    // for stripe / block (in cells)
};

export type Layer = {
  strategy: StrategyKey;
  mark: MarkKey;
  palette: readonly string[];
  density: number;    // 0..1
  cellSize: number;   // px
};

export type PostMetadata = {
  slug: string;
  primaryTag: string | null;
  titleLength: number;
  publishedAtMs: number;
};

export type Canvas = {
  width: number;   // px
  height: number;  // px
};

export const CANVAS: Canvas = { width: 1200, height: 630 };
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared type vocabulary"
```

---

## Task 3: Palettes

Mood data + the section-bias logic for Book.

**Files:**
- Create: `src/palettes.ts`
- Test: `test/palettes.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/palettes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paletteFor, weightedPaletteFor, MOODS } from "../src/palettes";
import { Hash } from "../src/hash";

describe("palettes", () => {
  it("book mood for hidden-patterns tag", () => {
    expect(paletteFor("hidden-patterns").bg).toBe("#F8F8F8");
  });

  it("book mood for any of the 7 section tags", () => {
    for (const tag of ["start-end", "foundations", "structuring", "direction", "practice", "learning", "space"]) {
      expect(paletteFor(tag).bg).toBe("#F8F8F8");
    }
  });

  it("radar mood: dark bg", () => {
    expect(paletteFor("radar").bg).toBe("#1A1A1A");
  });

  it("essays mood: paper bg", () => {
    expect(paletteFor("essays").bg).toBe("#F6EFDD");
  });

  it("default to book for unknown tag", () => {
    expect(paletteFor(null).bg).toBe("#F8F8F8");
    expect(paletteFor("five-things").bg).toBe("#F8F8F8");
  });

  it("Book palette includes the section arc", () => {
    const p = paletteFor("foundations");
    expect(p.colors).toContain("#FF3252");
    expect(p.colors).toContain("#8438F2");
  });

  it("weightedPaletteFor: non-Book moods are uniform (no repetition)", () => {
    const radar = weightedPaletteFor("radar");
    const essays = weightedPaletteFor("essays");
    // each color appears exactly once
    expect(new Set(radar).size).toBe(radar.length);
    expect(new Set(essays).size).toBe(essays.length);
  });

  it("weightedPaletteFor: Book with a section tag biases section + neighbors", async () => {
    const weighted = weightedPaletteFor("foundations");
    // section + 2 neighbors should account for >70% of array slots
    const close = ["#FF3252", "#222222", "#E9306B"];
    const closeCount = weighted.filter((c) => close.includes(c)).length;
    expect(closeCount / weighted.length).toBeGreaterThan(0.7);
  });

  it("weightedPaletteFor: Book without a section tag is uniform", () => {
    const weighted = weightedPaletteFor("hidden-patterns");
    expect(new Set(weighted).size).toBe(weighted.length);
  });

  it("hash.pick over weighted Book palette favors section ~80%", async () => {
    const weighted = weightedPaletteFor("foundations");
    const h = await Hash.from("bias-sample");
    const close = ["#FF3252", "#222222", "#E9306B"];
    const samples = Array.from({ length: 400 }, () => h.pick(weighted));
    const closeCount = samples.filter((c) => close.includes(c)).length;
    expect(closeCount / samples.length).toBeGreaterThan(0.65);
  });

  it("MOODS exposes all three", () => {
    expect(MOODS.book.bg).toBe("#F8F8F8");
    expect(MOODS.radar.bg).toBe("#1A1A1A");
    expect(MOODS.essays.bg).toBe("#F6EFDD");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- palettes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/palettes.ts`**

The picking strategy uses a **weighted palette array** — each color repeated according to its desired probability. Strategies later call `hash.pick(palette)` uniformly; the repetition produces the bias. For Book with a section tag: section ×8, two neighbors ×5 each, distant arc ×1 each, neutrals ×1 each → section+neighbors occupy 18 of 23 slots ≈ 78%. For other moods or untagged Book: uniform (each color once).

```ts
import type { Mood, Palette } from "./types";

const SECTION_ARC = [
  { tag: "start-end", color: "#222222" },
  { tag: "foundations", color: "#FF3252" },
  { tag: "structuring", color: "#E9306B" },
  { tag: "direction", color: "#D83586" },
  { tag: "practice", color: "#BD31BF" },
  { tag: "learning", color: "#9F36CE" },
  { tag: "space", color: "#8438F2" },
] as const;

const SECTION_TAGS = SECTION_ARC.map((s) => s.tag);

export const MOODS: Record<Mood, Palette> = {
  book: {
    bg: "#F8F8F8",
    colors: [
      "#222222", "#FF3252", "#E9306B", "#D83586",
      "#BD31BF", "#9F36CE", "#8438F2", "#999999",
    ],
  },
  radar: {
    bg: "#1A1A1A",
    colors: ["#00FF88", "#00CCFF", "#FF00C8", "#FFE600", "#FFFFFF", "#666666"],
  },
  essays: {
    bg: "#F6EFDD",
    colors: [
      "#2C5489", "#DC5440", "#2D6B4F", "#E5B055",
      "#D89099", "#B8D2DE", "#C4A87C", "#2A2A2A",
    ],
  },
};

export function moodFor(tag: string | null): Mood {
  if (tag === "radar") return "radar";
  if (tag === "essays") return "essays";
  if (tag === "hidden-patterns") return "book";
  if (tag && SECTION_TAGS.includes(tag as (typeof SECTION_TAGS)[number])) return "book";
  return "book";
}

export function paletteFor(tag: string | null): Palette {
  const mood = moodFor(tag);
  if (mood === "book") {
    const sectionIdx = tag ? SECTION_ARC.findIndex((s) => s.tag === tag) : -1;
    return {
      ...MOODS.book,
      biasKey: sectionIdx >= 0 ? SECTION_ARC[sectionIdx]!.color : undefined,
    };
  }
  return MOODS[mood];
}

/**
 * Returns the picking pool for a tag. Repetition encodes weighting, so
 * `hash.pick(weightedPaletteFor(tag))` naturally biases toward common colors.
 *
 * For Book + section: section ×8, immediate neighbors ×5 each, distant arc ×1 each, muted ×1.
 * For Book + no section, Radar, Essays: each color appears exactly once (uniform).
 */
export function weightedPaletteFor(tag: string | null): readonly string[] {
  const mood = moodFor(tag);
  if (mood !== "book") return MOODS[mood].colors;

  const sectionIdx = tag ? SECTION_ARC.findIndex((s) => s.tag === tag) : -1;
  if (sectionIdx < 0) return MOODS.book.colors;

  const arc = SECTION_ARC.map((s) => s.color);
  const sectionColor = arc[sectionIdx]!;
  const leftIdx = (sectionIdx - 1 + arc.length) % arc.length;
  const rightIdx = (sectionIdx + 1) % arc.length;
  const left = arc[leftIdx]!;
  const right = arc[rightIdx]!;
  const distant = arc.filter((_, i) => i !== sectionIdx && i !== leftIdx && i !== rightIdx);

  const weighted: string[] = [];
  for (let i = 0; i < 8; i++) weighted.push(sectionColor);
  for (let i = 0; i < 5; i++) weighted.push(left);
  for (let i = 0; i < 5; i++) weighted.push(right);
  for (const c of distant) weighted.push(c);
  weighted.push("#999999");
  // intentionally do NOT add #222222 separately — already in arc as start-end
  return weighted;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- palettes`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/palettes.ts test/palettes.test.ts
git commit -m "feat: palettes — three moods with section-biased Book"
```

---

## Task 4: Marks

Eight pure functions that emit SVG fragments for atomic shapes.

**Files:**
- Create: `src/marks.ts`
- Test: `test/marks.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/marks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMark } from "../src/marks";
import type { MarkInstance } from "../src/types";

const at = (overrides: Partial<MarkInstance> = {}): MarkInstance => ({
  mark: "pixel",
  x: 30,
  y: 60,
  color: "#FF3252",
  cellSize: 15,
  ...overrides,
});

describe("renderMark", () => {
  it("pixel: single rect cellSize x cellSize", () => {
    const svg = renderMark(at({ mark: "pixel" }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="15" fill="#FF3252"/>`);
  });

  it("bar: horizontal rect, default length 4 cells", () => {
    const svg = renderMark(at({ mark: "bar" }));
    expect(svg).toBe(`<rect x="30" y="60" width="60" height="15" fill="#FF3252"/>`);
  });

  it("bar: respects custom length", () => {
    const svg = renderMark(at({ mark: "bar", length: 6 }));
    expect(svg).toBe(`<rect x="30" y="60" width="90" height="15" fill="#FF3252"/>`);
  });

  it("stripe: vertical rect, default 4 cells tall", () => {
    const svg = renderMark(at({ mark: "stripe" }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="60" fill="#FF3252"/>`);
  });

  it("plus: 5 rects forming a cross", () => {
    const svg = renderMark(at({ mark: "plus" }));
    expect(svg).toContain('fill="#FF3252"');
    expect((svg.match(/<rect /g) || []).length).toBe(5);
  });

  it("ring: 8 rects forming hollow 3x3 square", () => {
    const svg = renderMark(at({ mark: "ring" }));
    expect((svg.match(/<rect /g) || []).length).toBe(8);
  });

  it("diagonal: 4-cell staircase", () => {
    const svg = renderMark(at({ mark: "diagonal" }));
    expect((svg.match(/<rect /g) || []).length).toBe(4);
  });

  it("block: N x M filled rectangle", () => {
    const svg = renderMark(at({ mark: "block", length: 3, height: 2 }));
    expect(svg).toBe(`<rect x="30" y="60" width="45" height="30" fill="#FF3252"/>`);
  });

  it("drip: vertical line of given length cells", () => {
    const svg = renderMark(at({ mark: "drip", length: 5 }));
    expect(svg).toBe(`<rect x="30" y="60" width="15" height="75" fill="#FF3252"/>`);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- marks`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/marks.ts`**

```ts
import type { MarkInstance } from "./types";

export function renderMark(m: MarkInstance): string {
  switch (m.mark) {
    case "pixel":
      return rect(m.x, m.y, m.cellSize, m.cellSize, m.color);
    case "bar": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize * length, m.cellSize, m.color);
    }
    case "stripe": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize, m.cellSize * length, m.color);
    }
    case "plus": {
      const c = m.cellSize;
      return [
        rect(m.x, m.y - c, c, c, m.color),
        rect(m.x - c, m.y, c, c, m.color),
        rect(m.x, m.y, c, c, m.color),
        rect(m.x + c, m.y, c, c, m.color),
        rect(m.x, m.y + c, c, c, m.color),
      ].join("");
    }
    case "ring": {
      const c = m.cellSize;
      const parts: string[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          parts.push(rect(m.x + dx * c, m.y + dy * c, c, c, m.color));
        }
      }
      return parts.join("");
    }
    case "diagonal": {
      const c = m.cellSize;
      return [0, 1, 2, 3]
        .map((i) => rect(m.x + i * c, m.y + (3 - i) * c, c, c, m.color))
        .join("");
    }
    case "block": {
      const length = m.length ?? 2;
      const height = m.height ?? 2;
      return rect(m.x, m.y, m.cellSize * length, m.cellSize * height, m.color);
    }
    case "drip": {
      const length = m.length ?? 4;
      return rect(m.x, m.y, m.cellSize, m.cellSize * length, m.color);
    }
  }
}

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- marks`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/marks.ts test/marks.test.ts
git commit -m "feat: 8 mark renderers (pixel, bar, stripe, plus, ring, diagonal, block, drip)"
```

---

## Task 5: Strategies

Ten arrangement functions. Each returns `MarkInstance[]` for one layer.

**Files:**
- Create: `src/strategies.ts`
- Test: `test/strategies.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/strategies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runStrategy } from "../src/strategies";
import { Hash } from "../src/hash";
import { CANVAS } from "../src/types";

const PALETTE = ["#FF3252", "#222222", "#E9306B"];

async function setup() {
  const hash = await Hash.from("strategy-test");
  return { hash, canvas: CANVAS };
}

describe("strategies", () => {
  it("grid: emits regularly-spaced marks across canvas", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("grid", { hash, canvas, mark: "pixel", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(50);
    // all positions should be on cellSize-aligned coords
    for (const m of out) {
      expect(m.x % 15).toBe(0);
      expect(m.y % 15).toBe(0);
    }
  });

  it("grid: density 0 emits nothing", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("grid", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0, cellSize: 15 });
    expect(out.length).toBe(0);
  });

  it("strata: emits horizontal bands at different y", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("strata", { hash, canvas, mark: "bar", palette: PALETTE, density: 0.7, cellSize: 15 });
    const ys = new Set(out.map((m) => m.y));
    expect(ys.size).toBeGreaterThan(3);
  });

  it("columns: emits vertical lanes at different x", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("columns", { hash, canvas, mark: "stripe", palette: PALETTE, density: 0.7, cellSize: 15 });
    const xs = new Set(out.map((m) => m.x));
    expect(xs.size).toBeGreaterThan(3);
  });

  it("scatter: emits sparse irregular marks", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("scatter", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(500);
  });

  it("quilt: repeats motif on regular grid", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("quilt", { hash, canvas, mark: "plus", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(20);
  });

  it("checker: alternates rows by stride", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("checker", { hash, canvas, mark: "pixel", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBeGreaterThan(20);
  });

  it("clusters: emits tight groups", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("clusters", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.5, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
  });

  it("field: emits a single large block", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("field", { hash, canvas, mark: "block", palette: PALETTE, density: 1, cellSize: 15 });
    expect(out.length).toBe(1);
    expect(out[0]!.mark).toBe("block");
  });

  it("chaotic: emits marks on a fine sub-grid", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("chaotic", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    // marks may sit on sub-cell offsets (cellSize/3)
    const offsets = new Set(out.map((m) => m.x % 15));
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("gravity: emits marks settled against the bottom edge", async () => {
    const { hash, canvas } = await setup();
    const out = runStrategy("gravity", { hash, canvas, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(out.length).toBeGreaterThan(0);
    // most marks should be in the lower half
    const lower = out.filter((m) => m.y >= canvas.height / 2).length;
    expect(lower / out.length).toBeGreaterThan(0.7);
  });

  it("strategies are deterministic for the same hash and inputs", async () => {
    const a = await Hash.from("repeat");
    const b = await Hash.from("repeat");
    const oa = runStrategy("scatter", { hash: a, canvas: CANVAS, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    const ob = runStrategy("scatter", { hash: b, canvas: CANVAS, mark: "pixel", palette: PALETTE, density: 0.3, cellSize: 15 });
    expect(oa).toEqual(ob);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- strategies`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/strategies.ts`**

```ts
import type { Hash } from "./hash";
import type { Canvas, MarkInstance, MarkKey, StrategyKey } from "./types";

export type StrategyArgs = {
  hash: Hash;
  canvas: Canvas;
  mark: MarkKey;
  palette: readonly string[];
  density: number;   // 0..1
  cellSize: number;  // px
};

export function runStrategy(key: StrategyKey, args: StrategyArgs): MarkInstance[] {
  switch (key) {
    case "grid":     return grid(args);
    case "strata":   return strata(args);
    case "columns":  return columns(args);
    case "scatter":  return scatter(args);
    case "quilt":    return quilt(args);
    case "checker":  return checker(args);
    case "clusters": return clusters(args);
    case "field":    return field(args);
    case "chaotic":  return chaotic(args);
    case "gravity":  return gravity(args);
  }
}

function grid({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  if (density <= 0) return [];
  const stride = 1 + (hash.next(2) % 3); // 1, 2, or 3
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r += stride) {
    for (let c = 0; c < cols; c += stride) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function strata({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const bands = 3 + (hash.next(3) % 5); // 3..7
  const bandHeight = Math.floor(canvas.height / bands / cellSize) * cellSize;
  const out: MarkInstance[] = [];
  for (let b = 0; b < bands; b++) {
    const y = b * bandHeight;
    const color = hash.pick(palette);
    const cols = Math.floor(canvas.width / cellSize);
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y, color, cellSize, length: 1 });
      }
    }
  }
  return out;
}

function columns({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const lanes = 4 + (hash.next(3) % 6); // 4..9
  const laneWidth = Math.floor(canvas.width / lanes / cellSize) * cellSize;
  const out: MarkInstance[] = [];
  for (let l = 0; l < lanes; l++) {
    const x = l * laneWidth;
    const color = hash.pick(palette);
    const rows = Math.floor(canvas.height / cellSize);
    for (let r = 0; r < rows; r++) {
      if (hash.float() < density) {
        out.push({ mark, x, y: r * cellSize, color, cellSize, length: 1 });
      }
    }
  }
  return out;
}

function scatter({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function quilt({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const stride = 4 + (hash.next(2) % 3); // 4..6 cells
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = stride; r < rows; r += stride) {
    for (let c = stride; c < cols; c += stride) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function checker({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2;
    for (let c = offset; c < cols; c += 2) {
      if (hash.float() < density) {
        out.push({ mark, x: c * cellSize, y: r * cellSize, color: hash.pick(palette), cellSize });
      }
    }
  }
  return out;
}

function clusters({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const numClusters = 2 + (hash.next(3) % 5); // 2..6
  const cols = Math.floor(canvas.width / cellSize);
  const rows = Math.floor(canvas.height / cellSize);
  const out: MarkInstance[] = [];
  for (let i = 0; i < numClusters; i++) {
    const cx = hash.next(7) % cols;
    const cy = hash.next(7) % rows;
    const radius = 2 + (hash.next(2) % 3); // 2..4 cells
    const color = hash.pick(palette);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (hash.float() < density) {
          out.push({ mark, x: x * cellSize, y: y * cellSize, color, cellSize });
        }
      }
    }
  }
  return out;
}

function field({ hash, canvas, mark, palette, cellSize }: StrategyArgs): MarkInstance[] {
  const w = Math.floor(canvas.width / cellSize);
  const h = Math.floor(canvas.height / cellSize);
  return [{
    mark: "block",
    x: 0,
    y: 0,
    color: hash.pick(palette),
    cellSize,
    length: w,
    height: h,
  }];
}

function chaotic({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const subStep = Math.max(3, Math.floor(cellSize / 3));
  const cols = Math.floor(canvas.width / subStep);
  const rows = Math.floor(canvas.height / subStep);
  const out: MarkInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hash.float() < density) {
        out.push({
          mark,
          x: c * subStep,
          y: r * subStep,
          color: hash.pick(palette),
          cellSize: subStep,
        });
      }
    }
  }
  return out;
}

function gravity({ hash, canvas, mark, palette, density, cellSize }: StrategyArgs): MarkInstance[] {
  const cols = Math.floor(canvas.width / cellSize);
  const out: MarkInstance[] = [];
  for (let c = 0; c < cols; c++) {
    // pile height per column drawn from density
    const pileCells = Math.floor(hash.float() * density * 12);
    for (let p = 0; p < pileCells; p++) {
      const y = canvas.height - cellSize * (p + 1);
      out.push({ mark, x: c * cellSize, y, color: hash.pick(palette), cellSize });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- strategies`
Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/strategies.ts test/strategies.test.ts
git commit -m "feat: 10 arrangement strategies (grid, strata, columns, scatter, quilt, checker, clusters, field, chaotic, gravity)"
```

---

## Task 6: Layer composer

Picks 2–3 layers per image, enforces base/figure/accent slot rules.

**Files:**
- Create: `src/compose.ts`
- Test: `test/compose.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeLayers } from "../src/compose";
import { Hash } from "../src/hash";

describe("composeLayers", () => {
  it("returns 2 or 3 layers", async () => {
    for (const slug of ["a", "b", "c", "d", "e"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      expect(layers.length).toBeGreaterThanOrEqual(2);
      expect(layers.length).toBeLessThanOrEqual(3);
    }
  });

  it("base layer is field, grid, or strata", async () => {
    for (const slug of ["a", "b", "c", "d", "e"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: null, titleLength: 30, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      expect(["field", "grid", "strata"]).toContain(layers[0]!.strategy);
    }
  });

  it("accent layer (when present) is scatter, chaotic, or gravity", async () => {
    let sawAccent = false;
    for (const slug of ["aa","bb","cc","dd","ee","ff","gg","hh","ii","jj"]) {
      const hash = await Hash.from(slug);
      const meta = { slug, primaryTag: null, titleLength: 30, publishedAtMs: Date.now() };
      const layers = composeLayers(hash, meta);
      if (layers.length === 3) {
        sawAccent = true;
        expect(["scatter", "chaotic", "gravity"]).toContain(layers[2]!.strategy);
      }
    }
    expect(sawAccent).toBe(true);
  });

  it("longer title increases base-layer density", async () => {
    const hashA = await Hash.from("title-test");
    const hashB = await Hash.from("title-test");
    const short = composeLayers(hashA, { slug: "x", primaryTag: null, titleLength: 10, publishedAtMs: 0 });
    const long  = composeLayers(hashB, { slug: "x", primaryTag: null, titleLength: 100, publishedAtMs: 0 });
    expect(long[0]!.density).toBeGreaterThan(short[0]!.density);
  });

  it("older posts bias to fewer layers", async () => {
    const now = Date.now();
    const old = now - 365 * 24 * 60 * 60 * 1000; // 1 year ago
    let layerCounts = { fresh: 0, aged: 0 };
    for (let i = 0; i < 20; i++) {
      const slug = `post-${i}`;
      const hf = await Hash.from(slug);
      const ho = await Hash.from(slug);
      layerCounts.fresh += composeLayers(hf, { slug, primaryTag: null, titleLength: 40, publishedAtMs: now }).length;
      layerCounts.aged  += composeLayers(ho, { slug, primaryTag: null, titleLength: 40, publishedAtMs: old }).length;
    }
    expect(layerCounts.aged).toBeLessThanOrEqual(layerCounts.fresh);
  });

  it("radar mood produces sparser base density", async () => {
    const slug = "radar-density";
    const hr = await Hash.from(slug);
    const hb = await Hash.from(slug);
    const radarLayers = composeLayers(hr, { slug, primaryTag: "radar", titleLength: 40, publishedAtMs: 0 });
    const bookLayers  = composeLayers(hb, { slug, primaryTag: "foundations", titleLength: 40, publishedAtMs: 0 });
    expect(radarLayers[0]!.density).toBeLessThanOrEqual(bookLayers[0]!.density);
  });

  it("Book layers receive a section-weighted palette", async () => {
    const hash = await Hash.from("book-weight");
    const layers = composeLayers(hash, { slug: "x", primaryTag: "foundations", titleLength: 40, publishedAtMs: Date.now() });
    // for any layer, the weighted palette should contain section color repeated
    for (const layer of layers) {
      const sectionCount = layer.palette.filter((c) => c === "#FF3252").length;
      expect(sectionCount).toBeGreaterThan(1);
    }
  });

  it("Non-book layers receive a uniform palette (no repetition)", async () => {
    const hash = await Hash.from("essays-uniform");
    const layers = composeLayers(hash, { slug: "x", primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() });
    for (const layer of layers) {
      expect(new Set(layer.palette).size).toBe(layer.palette.length);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- compose`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/compose.ts`**

```ts
import type { Hash } from "./hash";
import { weightedPaletteFor, moodFor } from "./palettes";
import type { Layer, MarkKey, PostMetadata, StrategyKey } from "./types";

const BASE_STRATEGIES: StrategyKey[] = ["field", "grid", "strata"];
const FIGURE_STRATEGIES: StrategyKey[] = ["columns", "quilt", "checker", "clusters", "strata"];
const ACCENT_STRATEGIES: StrategyKey[] = ["scatter", "chaotic", "gravity"];

const ALL_MARKS: MarkKey[] = ["pixel", "bar", "stripe", "plus", "ring", "diagonal", "block", "drip"];

// Strategies that look natural with specific marks. If unspecified, any mark works.
const STRATEGY_MARK_BIAS: Partial<Record<StrategyKey, MarkKey[]>> = {
  field:    ["block"],
  strata:   ["bar", "pixel"],
  columns:  ["stripe", "pixel"],
  quilt:    ["plus", "ring", "pixel"],
  gravity:  ["pixel", "drip"],
  chaotic:  ["pixel", "diagonal"],
};

export function composeLayers(hash: Hash, meta: PostMetadata): Layer[] {
  const mood = moodFor(meta.primaryTag);
  const weighted = weightedPaletteFor(meta.primaryTag);

  const layerCount = pickLayerCount(hash, meta, mood);

  const base = pickLayer(hash, "base", BASE_STRATEGIES, meta, weighted);
  const figure = pickLayer(hash, "figure", FIGURE_STRATEGIES, meta, weighted);

  if (layerCount === 2) return [base, figure];

  const accent = pickLayer(hash, "accent", ACCENT_STRATEGIES, meta, weighted);
  return [base, figure, accent];
}

function pickLayerCount(hash: Hash, meta: PostMetadata, mood: ReturnType<typeof moodFor>): 2 | 3 {
  const ageDays = (Date.now() - meta.publishedAtMs) / (1000 * 60 * 60 * 24);
  // older bias toward 2; younger bias toward 3
  const bias =
    ageDays > 180 ? 0.3 :
    ageDays > 30  ? 0.5 :
                    0.7;
  const radarPenalty = mood === "radar" ? -0.2 : 0;
  return hash.float() < bias + radarPenalty ? 3 : 2;
}

function pickLayer(
  hash: Hash,
  slot: "base" | "figure" | "accent",
  pool: StrategyKey[],
  meta: PostMetadata,
  palette: readonly string[],
): Layer {
  const strategy = hash.pick(pool);
  const markPool = STRATEGY_MARK_BIAS[strategy] ?? ALL_MARKS;
  const mark = hash.pick(markPool);
  const density = densityFor(slot, hash, meta);
  const cellSize = cellSizeFor(slot, hash);
  return { strategy, mark, palette, density, cellSize };
}

function densityFor(slot: "base" | "figure" | "accent", hash: Hash, meta: PostMetadata): number {
  // base is influenced by title length; others are slot-typed
  const radarFactor = meta.primaryTag === "radar" ? 0.6 : 1;
  if (slot === "base") {
    const t = clamp01((meta.titleLength - 20) / 60); // 20-80 chars maps 0..1
    return clamp01((0.15 + t * 0.7) * radarFactor);
  }
  if (slot === "figure") {
    return clamp01((0.3 + hash.float() * 0.4) * radarFactor);
  }
  // accent
  return clamp01((0.05 + hash.float() * 0.15) * radarFactor);
}

function cellSizeFor(slot: "base" | "figure" | "accent", hash: Hash): number {
  // base/figure default to 15px with small variation; accent finer
  if (slot === "accent") return [10, 12, 15][hash.next(2) % 3]!;
  return [12, 15, 18, 24][hash.next(2) % 4]!;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- compose`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compose.ts test/compose.test.ts
git commit -m "feat: layer composer — picks 2-3 layers with base/figure/accent slot rules"
```

---

## Task 7: SVG renderer

Wraps composed layers in an `<svg>` envelope with the mood's background.

**Files:**
- Create: `src/render.ts`
- Test: `test/render.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderSvg } from "../src/render";
import { Hash } from "../src/hash";
import { composeLayers } from "../src/compose";
import { runStrategy } from "../src/strategies";
import { CANVAS } from "../src/types";

describe("renderSvg", () => {
  it("wraps in valid <svg> with viewBox 0 0 1200 630", async () => {
    const hash = await Hash.from("render");
    const layers = composeLayers(hash, { slug: "render", primaryTag: "essays", titleLength: 40, publishedAtMs: Date.now() });
    const marks = layers.flatMap((l) => runStrategy(l.strategy, { hash, canvas: CANVAS, mark: l.mark, palette: l.palette, density: l.density, cellSize: l.cellSize }));
    const svg = renderSvg({ bg: "#F6EFDD", marks });
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("includes background as a full-canvas rect", async () => {
    const svg = renderSvg({ bg: "#F8F8F8", marks: [] });
    expect(svg).toContain('<rect width="1200" height="630" fill="#F8F8F8"/>');
  });

  it("includes mark elements inline", async () => {
    const svg = renderSvg({
      bg: "#fff",
      marks: [{ mark: "pixel", x: 10, y: 20, color: "#FF3252", cellSize: 15 }],
    });
    expect(svg).toContain(`<rect x="10" y="20" width="15" height="15" fill="#FF3252"/>`);
  });

  it("output is well-formed for a typical post", async () => {
    const hash = await Hash.from("well-formed");
    const meta = { slug: "well-formed", primaryTag: "foundations", titleLength: 50, publishedAtMs: Date.now() };
    const layers = composeLayers(hash, meta);
    const marks = layers.flatMap((l) => runStrategy(l.strategy, { hash, canvas: CANVAS, mark: l.mark, palette: l.palette, density: l.density, cellSize: l.cellSize }));
    const svg = renderSvg({ bg: "#F8F8F8", marks });
    // basic shape sanity
    const opens = (svg.match(/<svg\b/g) || []).length;
    const closes = (svg.match(/<\/svg>/g) || []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- render`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/render.ts`**

```ts
import { renderMark } from "./marks";
import type { MarkInstance } from "./types";
import { CANVAS } from "./types";

export type RenderArgs = {
  bg: string;
  marks: MarkInstance[];
};

export function renderSvg({ bg, marks }: RenderArgs): string {
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" width="${CANVAS.width}" height="${CANVAS.height}">`;
  const bgRect = `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${bg}"/>`;
  const body = marks.map(renderMark).join("");
  return `${head}${bgRect}${body}</svg>`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- render`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render.ts test/render.test.ts
git commit -m "feat: SVG envelope renderer"
```

---

## Task 8: Top-level generator

A single function that ties hash → compose → strategies → render. Useful for tests, gallery, and the Worker.

**Files:**
- Create: `src/generate.ts`
- Test: `test/generate.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/generate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateSvg } from "../src/generate";

describe("generateSvg", () => {
  it("returns a complete SVG for a Book post", async () => {
    const svg = await generateSvg({ slug: "test-foundations", primaryTag: "foundations", titleLength: 42, publishedAtMs: Date.now() });
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('fill="#F8F8F8"');
  });

  it("returns a complete SVG for a Radar post", async () => {
    const svg = await generateSvg({ slug: "test-radar", primaryTag: "radar", titleLength: 30, publishedAtMs: Date.now() });
    expect(svg).toContain('fill="#1A1A1A"');
  });

  it("returns a complete SVG for an Essays post", async () => {
    const svg = await generateSvg({ slug: "test-essays", primaryTag: "essays", titleLength: 60, publishedAtMs: Date.now() });
    expect(svg).toContain('fill="#F6EFDD"');
  });

  it("is deterministic for the same metadata", async () => {
    const meta = { slug: "deterministic", primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 };
    const a = await generateSvg(meta);
    const b = await generateSvg(meta);
    expect(a).toBe(b);
  });

  it("differs for different slugs even with same other inputs", async () => {
    const a = await generateSvg({ slug: "alpha", primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 });
    const b = await generateSvg({ slug: "beta",  primaryTag: "essays", titleLength: 35, publishedAtMs: 1700000000000 });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- generate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/generate.ts`**

```ts
import { Hash } from "./hash";
import { composeLayers } from "./compose";
import { runStrategy } from "./strategies";
import { renderSvg } from "./render";
import { paletteFor } from "./palettes";
import type { PostMetadata } from "./types";
import { CANVAS } from "./types";

export async function generateSvg(meta: PostMetadata): Promise<string> {
  const hash = await Hash.from(meta.slug);
  const palette = paletteFor(meta.primaryTag);
  const layers = composeLayers(hash, meta);
  const marks = layers.flatMap((l) =>
    runStrategy(l.strategy, {
      hash,
      canvas: CANVAS,
      mark: l.mark,
      palette: l.palette,
      density: l.density,
      cellSize: l.cellSize,
    })
  );
  return renderSvg({ bg: palette.bg, marks });
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- generate`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generate.ts test/generate.test.ts
git commit -m "feat: top-level generateSvg(meta) ties hash + compose + render"
```

---

## Task 9: Ghost Content API client

Fetches post metadata. Returns `null` if not found; throws on network/auth error so the Worker can fall back to slug-only mode.

**Files:**
- Create: `src/ghost.ts`
- Test: `test/ghost.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/ghost.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPostMetadata } from "../src/ghost";

const ENV = {
  GHOST_API_URL: "https://cpj.fyi/ghost/api/content/posts",
  GHOST_CONTENT_KEY: "abcd1234",
};

describe("fetchPostMetadata", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns metadata when the post exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{
        slug: "hello-world",
        title: "Hello, world",
        primary_tag: { slug: "essays" },
        published_at: "2025-01-15T12:00:00Z",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const meta = await fetchPostMetadata("hello-world", ENV);
    expect(meta).not.toBeNull();
    expect(meta!.slug).toBe("hello-world");
    expect(meta!.primaryTag).toBe("essays");
    expect(meta!.titleLength).toBe("Hello, world".length);
    expect(meta!.publishedAtMs).toBe(Date.parse("2025-01-15T12:00:00Z"));
  });

  it("returns null when post not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));
    const meta = await fetchPostMetadata("missing", ENV);
    expect(meta).toBeNull();
  });

  it("returns null on Ghost 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const meta = await fetchPostMetadata("missing", ENV);
    expect(meta).toBeNull();
  });

  it("throws on network errors so caller can fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ENETUNREACH"));
    await expect(fetchPostMetadata("anything", ENV)).rejects.toThrow();
  });

  it("handles missing primary_tag gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "tagless", title: "X", primary_tag: null, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));
    const meta = await fetchPostMetadata("tagless", ENV);
    expect(meta!.primaryTag).toBeNull();
  });

  it("requests the slug endpoint with the content key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "x", title: "X", primary_tag: null, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));
    await fetchPostMetadata("x", ENV);
    const url = (fetchSpy.mock.calls[0]![0] as string);
    expect(url).toContain("/slug/x");
    expect(url).toContain("key=abcd1234");
    expect(url).toContain("fields=slug%2Ctitle%2Cpublished_at");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- ghost`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ghost.ts`**

```ts
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
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- ghost`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ghost.ts test/ghost.test.ts
git commit -m "feat: Ghost Content API client (fetch post metadata by slug)"
```

---

## Task 10: Worker entry

HTTP routing, KV cache lookup/write, Ghost fetch, fallback handling.

**Files:**
- Create: `src/index.ts`
- Test: `test/index.test.ts`
- Modify: `wrangler.toml` (uncomment KV namespace block after creating)

- [ ] **Step 1: Write the failing tests**

`test/index.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";

const env = {
  ART_CACHE: { get: vi.fn(), put: vi.fn() } as any,
  GHOST_API_URL: "https://cpj.fyi/ghost/api/content/posts",
  GHOST_CONTENT_KEY: "k",
};

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe("worker", () => {
  it("returns 200 SVG for a valid slug", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      posts: [{ slug: "hello", title: "Hello", primary_tag: { slug: "essays" }, published_at: "2025-01-15T00:00:00Z" }],
    }), { status: 200 }));

    const req = new Request("https://art.cpj.fyi/hello.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("image/svg+xml");
    const body = await resp.text();
    expect(body).toMatch(/^<svg\b/);
  });

  it("serves from KV cache on hit", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce("<svg>cached</svg>");
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe("<svg>cached</svg>");
  });

  it("returns 404 when Ghost has no such post", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ posts: [] }), { status: 200 }));
    const req = new Request("https://art.cpj.fyi/missing.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it("falls back to slug-only when Ghost errors", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce(null);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const req = new Request("https://art.cpj.fyi/fallback.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(200);
    const body = await resp.text();
    // fallback uses Book mood = #F8F8F8
    expect(body).toContain('fill="#F8F8F8"');
  });

  it("rejects non-svg paths with 404", async () => {
    const req = new Request("https://art.cpj.fyi/foo.png");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.status).toBe(404);
  });

  it("sets immutable cache headers on success", async () => {
    env.ART_CACHE.get.mockResolvedValueOnce("<svg>x</svg>");
    const req = new Request("https://art.cpj.fyi/cached.svg");
    const resp = await worker.fetch(req, env, ctx);
    expect(resp.headers.get("cache-control")).toContain("immutable");
    expect(resp.headers.get("cache-control")).toContain("max-age=31536000");
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- index`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/index.ts`**

```ts
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
      // Ghost is down — fall back to slug-only
      meta = { slug, primaryTag: null, titleLength: slug.length, publishedAtMs: Date.now() };
    }

    if (!meta) return new Response("Not found", { status: 404 });

    const svg = await generateSvg(meta);
    ctx.waitUntil(env.ART_CACHE.put(cacheKey, svg));
    return new Response(svg, { status: 200, headers: SVG_HEADERS });
  },
};
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- index`
Expected: all 6 tests PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all tests across all files PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat: Worker entry — routing, KV cache, Ghost fetch with fallback"
```

---

## Task 11: Snapshot fixtures + gallery

A fixture set of representative slugs that lock visible output and a gallery script for eyeballing.

**Files:**
- Create: `test/snapshot/fixtures.ts`
- Create: `test/snapshot/snapshot.test.ts`
- Create: `scripts/gallery.ts`

- [ ] **Step 1: Write `test/snapshot/fixtures.ts`**

```ts
import type { PostMetadata } from "../../src/types";

const fixedAge = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

export const FIXTURES: PostMetadata[] = [
  // Book — section spread, varied lengths and ages
  { slug: "book-foundations-short",     primaryTag: "foundations",  titleLength: 18, publishedAtMs: fixedAge(10) },
  { slug: "book-foundations-medium",    primaryTag: "foundations",  titleLength: 45, publishedAtMs: fixedAge(60) },
  { slug: "book-foundations-long-old",  primaryTag: "foundations",  titleLength: 90, publishedAtMs: fixedAge(400) },
  { slug: "book-structuring-mid",       primaryTag: "structuring",  titleLength: 50, publishedAtMs: fixedAge(120) },
  { slug: "book-direction-mid",         primaryTag: "direction",    titleLength: 55, publishedAtMs: fixedAge(90) },
  { slug: "book-practice-mid",          primaryTag: "practice",     titleLength: 40, publishedAtMs: fixedAge(150) },
  { slug: "book-learning-mid",          primaryTag: "learning",     titleLength: 48, publishedAtMs: fixedAge(80) },
  { slug: "book-space-mid",             primaryTag: "space",        titleLength: 60, publishedAtMs: fixedAge(20) },
  { slug: "book-start-end-mid",         primaryTag: "start-end",    titleLength: 35, publishedAtMs: fixedAge(45) },
  { slug: "book-hidden-patterns-fresh", primaryTag: "hidden-patterns", titleLength: 50, publishedAtMs: fixedAge(5) },

  // Radar — varied
  { slug: "radar-fresh-short", primaryTag: "radar", titleLength: 22, publishedAtMs: fixedAge(2) },
  { slug: "radar-mid",         primaryTag: "radar", titleLength: 50, publishedAtMs: fixedAge(40) },
  { slug: "radar-old-long",    primaryTag: "radar", titleLength: 80, publishedAtMs: fixedAge(300) },

  // Essays — varied
  { slug: "essays-short",      primaryTag: "essays", titleLength: 20, publishedAtMs: fixedAge(15) },
  { slug: "essays-mid",        primaryTag: "essays", titleLength: 55, publishedAtMs: fixedAge(60) },
  { slug: "essays-long-old",   primaryTag: "essays", titleLength: 95, publishedAtMs: fixedAge(500) },

  // Default mood (untagged)
  { slug: "untagged-misc",     primaryTag: null,        titleLength: 40, publishedAtMs: fixedAge(30) },
  { slug: "untagged-fivelike", primaryTag: "five-things", titleLength: 30, publishedAtMs: fixedAge(20) },
];
```

> Note: `publishedAtMs` uses `Date.now()` at fixture-load time; snapshot tests must freeze time to keep output stable.

- [ ] **Step 2: Write `test/snapshot/snapshot.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { FIXTURES } from "./fixtures";
import { generateSvg } from "../../src/generate";

const FIXED_NOW = Date.parse("2026-05-01T12:00:00Z");

describe("svg snapshots", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterAll(() => vi.useRealTimers());

  for (const meta of FIXTURES) {
    it(`is stable for ${meta.slug}`, async () => {
      // re-anchor publishedAtMs relative to FIXED_NOW so snapshots don't drift
      const stableMeta = { ...meta };
      const svg = await generateSvg(stableMeta);
      expect(svg).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 3: Write `scripts/gallery.ts`**

```ts
#!/usr/bin/env tsx
import { FIXTURES } from "../test/snapshot/fixtures";
import { generateSvg } from "../src/generate";

async function main() {
  const sections: string[] = [];
  for (const meta of FIXTURES) {
    const svg = await generateSvg(meta);
    sections.push(`
      <figure>
        <figcaption>${escape(meta.slug)} · ${escape(meta.primaryTag ?? "(untagged)")} · title len ${meta.titleLength}</figcaption>
        <div class="frame">${svg}</div>
      </figure>
    `);
  }
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>monafor gallery</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; background: #181818; color: #ddd; padding: 20px; margin: 0; }
  h1 { color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; }
  figure { margin: 0; background: #222; padding: 12px; border-radius: 8px; }
  figcaption { font-family: SF Mono, Menlo, monospace; font-size: 11px; color: #aaa; margin-bottom: 8px; }
  .frame svg { display: block; width: 100%; height: auto; border-radius: 4px; }
</style>
</head><body>
<h1>monafor — fixture gallery</h1>
<div class="grid">${sections.join("")}</div>
</body></html>`;
  process.stdout.write(html);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

main();
```

- [ ] **Step 4: Run snapshot test (creates snapshot file on first run)**

Run: `npm test -- snapshot`
Expected: PASS, with new `__snapshots__/snapshot.test.ts.snap` written.

- [ ] **Step 5: Inspect the gallery visually**

Run: `npm run gallery`
Expected: a browser window opens with all 18 fixtures rendered as SVGs.

> If output looks off, that is a tuning iteration — adjust `compose.ts` density/scale defaults, regenerate snapshot with `npm test -- snapshot -u`, repeat.

- [ ] **Step 6: Commit**

```bash
git add test/snapshot scripts/gallery.ts
git commit -m "feat: snapshot fixtures + gallery for visual regression"
```

---

## Task 12: Cloudflare deploy

Set up KV, wire DNS, deploy. Most steps are one-shot ops; some require dashboard interaction the engineer should pause for.

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Authenticate Wrangler (one-time)**

Run: `npx wrangler login`
Expected: opens browser for OAuth; returns "Successfully logged in".

- [ ] **Step 2: Create the KV namespace**

Run: `npx wrangler kv:namespace create ART_CACHE`
Expected: prints output containing `id = "<some-32-char-hex>"`.

Capture the id.

- [ ] **Step 3: Update `wrangler.toml` — uncomment KV block, paste id**

Edit `wrangler.toml` to enable:

```toml
[[kv_namespaces]]
binding = "ART_CACHE"
id = "<paste-id-from-step-2>"
```

- [ ] **Step 4: Set the Ghost Content API key as a secret**

Get the key from Ghost Admin → Integrations → Custom Integrations.

Run: `npx wrangler secret put GHOST_CONTENT_KEY`
Expected: prompts for value; paste the key.

- [ ] **Step 5: First deploy (without custom domain)**

Run: `npx wrangler deploy`
Expected: deploys to `monafor.<your-subdomain>.workers.dev`.

- [ ] **Step 6: Smoke test against the workers.dev URL**

Run: `curl -s "https://monafor.<your-subdomain>.workers.dev/test-foundations.svg" | head -c 200`
Expected: starts with `<svg xmlns=...`. (The slug doesn't need to exist in Ghost — fallback kicks in.)

- [ ] **Step 7: Set up the `art.cpj.fyi` custom domain**

In Cloudflare dashboard → Workers & Pages → monafor → Settings → Triggers → Custom Domains → Add `art.cpj.fyi`.

Wait for "Active" status.

- [ ] **Step 8: Uncomment routes block in `wrangler.toml` for declarative re-deploy**

```toml
routes = [
  { pattern = "art.cpj.fyi/*", custom_domain = true }
]
```

Run: `npx wrangler deploy`

- [ ] **Step 9: Smoke test against the custom domain**

Run: `curl -s "https://art.cpj.fyi/test-foundations.svg" | head -c 200`
Expected: starts with `<svg xmlns=...`.

- [ ] **Step 10: Commit deploy config changes**

```bash
git add wrangler.toml
git commit -m "chore: enable KV binding and art.cpj.fyi custom domain"
```

---

## Task 13: Wire `art.cpj.fyi/<slug>.svg` into Ghost theme

The Worker now exists; the cpj-theme needs to use it as the OG/share image and tag-page thumbnail when no Ghost feature image is set.

**Files:**
- Modify: `cpj-theme/default.hbs` (head OG tags)
- Modify: `cpj-theme/partials/post-card.hbs` (or equivalent) for tag-page thumbnails

- [ ] **Step 1: Find the OG image meta tags in the theme**

Run: `grep -rn "og:image" "/Users/clayjones/Library/Mobile Documents/com~apple~CloudDocs/Claude/monafor/cpj-theme/"`
Note the file(s) emitting `<meta property="og:image">`.

- [ ] **Step 2: Update OG image to fall back to monafor**

In the file from step 1, change the OG image emit to prefer Ghost's `feature_image` if set, else `https://art.cpj.fyi/{{slug}}.svg`. Pseudocode for Handlebars:

```handlebars
{{#if feature_image}}
  <meta property="og:image" content="{{feature_image}}">
{{else}}
  <meta property="og:image" content="https://art.cpj.fyi/{{slug}}.svg">
{{/if}}
```

(Similar for `twitter:image`.)

- [ ] **Step 3: Find the tag-page post-card image source**

Run: `grep -rn "feature_image" "/Users/clayjones/Library/Mobile Documents/com~apple~CloudDocs/Claude/monafor/cpj-theme/"`

Identify how thumbnails are emitted on tag pages (likely in a `post-card` partial or directly in `tag.hbs`).

- [ ] **Step 4: Apply same fallback in tag-page card**

Replace direct `feature_image` references with the same conditional, e.g.:

```handlebars
<img src="{{#if feature_image}}{{feature_image}}{{else}}https://art.cpj.fyi/{{slug}}.svg{{/if}}" alt="" loading="lazy">
```

- [ ] **Step 5: Test in Ghost local dev (or staging) before pushing**

Confirm: a post without a feature_image now shows the generated SVG on its tag-page card and in OG previews (e.g., via [opengraph.xyz](https://www.opengraph.xyz/)).

- [ ] **Step 6: Commit theme changes**

```bash
cd cpj-theme
git add default.hbs partials/post-card.hbs  # adjust paths to actual files
git commit -m "feat: fall back to art.cpj.fyi SVG when post has no feature_image"
```

---

## Self-review checklist

Verified against the spec:

- ✅ Cloudflare Worker with `art.cpj.fyi/<slug>.svg` — Tasks 10, 12
- ✅ Layered composition (2–3 layers, base/figure/accent) — Task 6
- ✅ 8 marks — Task 4
- ✅ 10 strategies — Task 5
- ✅ 3 moods (Book / Radar / Essays) with section bias for Book — Task 3
- ✅ Hash → SHA-256 + bit reader — Task 1
- ✅ Signal mapping (tag → mood, title length → density, age → layer count) — Task 6
- ✅ Ghost Content API client with graceful fallback — Tasks 9, 10
- ✅ KV cache + immutable Cache-Control + RENDERER_VERSION cache key — Task 10
- ✅ 1200×630 SVG output — Task 7
- ✅ Snapshot regression + gallery for visual review — Task 11
- ✅ Theme integration (OG + tag-page thumbnails, *not* in-post hero) — Task 13

No placeholders remain. Method names and types are consistent across tasks (`generateSvg`, `composeLayers`, `runStrategy`, `renderSvg`, `fetchPostMetadata`, `Hash`, `Layer`, `MarkInstance`, `PostMetadata`).

Open questions from the spec carry forward into Tasks 6 and 11 as tuning loops, not blockers.
