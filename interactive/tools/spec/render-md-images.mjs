// program-to-spec — the Markdown branch's image stage.
//
// The workbook branch (`build-spec.mjs`) never needs this file: it clones a
// template and swaps the rendered PNGs straight into the archive. Markdown has
// no container to swap into. It points at files on disk, so the same three
// renders — selection screen, ALV layout, process flow — have to be written out
// as real PNGs in a folder the `.md` can reach with `![](…)`.
//
// The point is that both branches draw from the same renderer. Before this, a
// Markdown spec fell back to ASCII wireframes and Mermaid source while the xlsx
// carried proper diagrams; the gap was in the plumbing, not the drawing.
//
// CLI
//   node render-md-images.mjs <image-spec.json> <out-dir>
//
// Writes `selection.png`, `alv.png` and `flow.png` for whichever slots the spec
// fills, and prints the manifest as JSON.
//
// Missing slots are normal, not errors. `renderScreenImages` returns null for a
// slot it could not rasterise — most often because no headless browser is on
// PATH — and each null simply leaves that PNG unwritten and marked `null` in the
// manifest, which is the writer's cue to keep its text fallback for that one.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScreenImages } from './screen-image-renderer.mjs';

// slot key → the manifest key it is reported under, and the file it is written
// to. `processFlow` is the renderer's name for what the spec calls `flow`.
const SLOTS = [
  ['selection', 'selection', 'selection.png'],
  ['alv', 'alv', 'alv.png'],
  ['processFlow', 'flow', 'flow.png'],
];

/**
 * Render the PNGs an `image-spec.json` describes into `outDir`.
 *
 * @param {object}  args
 * @param {string}  args.imageSpecPath  path to the spec written by the caller
 * @param {string}  args.outDir         asset folder; created when missing
 * @param {boolean} [args.verbose=true] narrate each slot on stdout
 * @returns {Promise<object>} `{ selection, alv, flow }`, each either null or
 *   `{ file, width, height, bytes }`
 */
export async function renderMdImages({ imageSpecPath, outDir, verbose = true }) {
  if (!imageSpecPath || !existsSync(imageSpecPath)) {
    throw new Error(`render-md-images: image-spec.json not found at ${imageSpecPath}`);
  }
  if (!outDir) throw new Error('render-md-images: outDir is required');
  mkdirSync(outDir, { recursive: true });

  const spec = JSON.parse(readFileSync(imageSpecPath, 'utf8'));
  const rendered = await renderScreenImages(spec);

  // Every key is present from the start, so a consumer can tell "not rendered"
  // from "slot unknown" without probing.
  const manifest = { selection: null, alv: null, flow: null };

  for (const [renderedKey, manifestKey, fileName] of SLOTS) {
    const image = rendered[renderedKey];
    if (!image?.pngBuffer) {
      if (verbose) console.log(`render-md-images: ${manifestKey} → null (no PNG; MD keeps text fallback)`);
      continue;
    }
    const { pngBuffer, width, height } = image;
    writeFileSync(join(outDir, fileName), pngBuffer);
    manifest[manifestKey] = { file: fileName, width, height, bytes: pngBuffer.length };
    if (verbose) console.log(`render-md-images: ${fileName} ${width}x${height} (${pngBuffer.length} B)`);
  }

  return manifest;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Only when this file is what was launched; importing it must stay side-effect
// free.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [specArg, outArg] = process.argv.slice(2);
  if (!specArg || !outArg) {
    console.error('Usage: node render-md-images.mjs <image-spec.json> <out-dir>');
    process.exit(2);
  }
  try {
    const manifest = await renderMdImages({
      imageSpecPath: resolve(specArg),
      outDir: resolve(outArg),
    });
    console.log(JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error(`render-md-images: ${err.message}`);
    process.exit(1);
  }
}
