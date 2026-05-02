import type { Mood, Palette } from "./types";
import type { Hash } from "./hash";

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
    bg: "#F6EFDD",
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
      "#222222", "#FF3252", "#E9306B", "#D83586",
      "#BD31BF", "#9F36CE", "#8438F2", "#999999",
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

export type ResolvedPalette = {
  bg: string;
  colors: readonly string[];
};

/**
 * Picks the per-post bg + foreground colors deterministically from the hash.
 *
 * - Book: static bg (#F6EFDD); colors = section-weighted palette
 * - Radar: static bg (#F6EFDD); colors = uniform arc palette (the classic look)
 * - Essays: static bg (#F6EFDD); colors = HP 8-color palette (uniform pick)
 *
 * (Radar previously used a dark bg with neon accents; now unified with the
 * cream/arc look.)
 *
 * The publishedAtMs param is accepted for API compatibility but currently
 * unused; future date-aware variants can branch on it.
 */
export function selectPalette(
  tag: string | null,
  _hash: Hash,
  _publishedAtMs: number = Date.now(),
): ResolvedPalette {
  const mood = moodFor(tag);
  if (mood === "essays") {
    return { bg: MOODS.essays.bg, colors: MOODS.essays.colors };
  }
  if (mood === "radar") {
    return { bg: MOODS.book.bg, colors: MOODS.book.colors };
  }
  // Book
  return { bg: MOODS.book.bg, colors: weightedPaletteFor(tag) };
}
