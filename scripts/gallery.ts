#!/usr/bin/env tsx
import { buildFixtures, FIXED_NOW } from "../test/snapshot/fixtures";
import { generateSvg } from "../src/generate";

async function main() {
  const fixtures = buildFixtures(FIXED_NOW);
  const sections: string[] = [];
  for (const meta of fixtures) {
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
