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
