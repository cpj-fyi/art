import type { PostMetadata } from "../../src/types";

export function buildFixtures(nowMs: number): PostMetadata[] {
  const fixedAge = (days: number) => nowMs - days * 24 * 60 * 60 * 1000;
  return [
    { slug: "book-foundations-short",     primaryTag: "foundations",     titleLength: 18, publishedAtMs: fixedAge(10) },
    { slug: "book-foundations-medium",    primaryTag: "foundations",     titleLength: 45, publishedAtMs: fixedAge(60) },
    { slug: "book-foundations-long-old",  primaryTag: "foundations",     titleLength: 90, publishedAtMs: fixedAge(400) },
    { slug: "book-structuring-mid",       primaryTag: "structuring",     titleLength: 50, publishedAtMs: fixedAge(120) },
    { slug: "book-direction-mid",         primaryTag: "direction",       titleLength: 55, publishedAtMs: fixedAge(90) },
    { slug: "book-practice-mid",          primaryTag: "practice",        titleLength: 40, publishedAtMs: fixedAge(150) },
    { slug: "book-learning-mid",          primaryTag: "learning",        titleLength: 48, publishedAtMs: fixedAge(80) },
    { slug: "book-space-mid",             primaryTag: "space",           titleLength: 60, publishedAtMs: fixedAge(20) },
    { slug: "book-start-end-mid",         primaryTag: "start-end",       titleLength: 35, publishedAtMs: fixedAge(45) },
    { slug: "book-hidden-patterns-fresh", primaryTag: "hidden-patterns", titleLength: 50, publishedAtMs: fixedAge(5) },
    { slug: "radar-fresh-short",          primaryTag: "radar",           titleLength: 22, publishedAtMs: fixedAge(2) },
    { slug: "radar-mid",                  primaryTag: "radar",           titleLength: 50, publishedAtMs: fixedAge(40) },
    { slug: "radar-old-long",             primaryTag: "radar",           titleLength: 80, publishedAtMs: fixedAge(300) },
    { slug: "essays-short",               primaryTag: "essays",          titleLength: 20, publishedAtMs: fixedAge(15) },
    { slug: "essays-mid",                 primaryTag: "essays",          titleLength: 55, publishedAtMs: fixedAge(60) },
    { slug: "essays-long-old",            primaryTag: "essays",          titleLength: 95, publishedAtMs: fixedAge(500) },
    { slug: "untagged-misc",              primaryTag: null,              titleLength: 40, publishedAtMs: fixedAge(30) },
    { slug: "untagged-fivelike",          primaryTag: "five-things",     titleLength: 30, publishedAtMs: fixedAge(20) },
  ];
}

export const FIXED_NOW = Date.parse("2026-05-01T12:00:00Z");
