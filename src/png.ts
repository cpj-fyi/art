// @ts-expect-error — .wasm import resolved by Wrangler's CompiledWasm rule
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initWasm(resvgWasm as WebAssembly.Module);
  }
  return initPromise;
}

/**
 * Render an SVG string to a PNG byte array.
 * The output is sized to 1200×630 (matches the OG card aspect ratio our SVG uses).
 */
export async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureInitialized();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    // No font config needed: our SVGs are pure <rect> with no text.
  });
  return resvg.render().asPng();
}
