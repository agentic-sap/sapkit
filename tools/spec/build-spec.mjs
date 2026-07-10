// sc4sap:program-to-spec — Single entry point that builds a complete spec xlsx.
//
// PIPELINE (always-on — no trigger keywords required)
//   1. cloneTemplate(tr) → out.xlsx with sharedStrings translated
//   2. renderScreenImages(imageSpec) → {selection,alv,processFlow} PNG buffers
//   3. swapImages(out.xlsx, ...png buffers) → final xlsx with program-specific
//      Selection + ALV mockups (Sheet 3) and horizontal Process Flow (Sheet 4)
//
// WHY ALWAYS-ON
//   The previous opt-in design was based on a misread of the drift problem.
//   Drift = template_base.xlsx geometry regressing (the old throwaway-driver
//   issue). Image swap only updates xl/drawings/drawingN.xml `<xdr:ext>`
//   values and PNG bytes — geometry, styles, column widths, fonts all stay
//   bound to template_base. So running image swap on every spec is safe and
//   produces a more accurate document. Each program needs its own selection
//   screen / ALV layout / flow chart anyway.
//
//   Graceful degrade: if no headless browser is on PATH, renderScreenImages
//   returns nulls per slot and swapImages skips them — the xlsx ends with
//   the template's generic mockups (Sheet 3) and a blank Sheet 4 drawing.
//
// SAP-WRITER OUTPUT CONTRACT
//   The agent produces TWO JSON files alongside the xlsx target:
//     · {OBJECT}-{YYYYMMDD}.tr.json          translation map (English → KO)
//     · {OBJECT}-{YYYYMMDD}.image-spec.json  renderScreenImages() argument
//   Persist them under .sc4sap/specs/_tr/ and _img/ for traceability.
//
// CLI
//   node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>
//     Pass "-" for image-spec.json to skip image rendering entirely
//     (text-only spec with template's generic mockups).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneTemplate } from './template-clone.mjs';
import { swapImages } from './image-swap.mjs';
import { renderScreenImages } from './screen-image-renderer.mjs';

export async function buildSpec({ trPath, imageSpecPath = null, outPath, verbose = true }) {
  if (!trPath || !existsSync(trPath)) throw new Error(`build-spec: tr.json not found at ${trPath}`);
  if (!outPath) throw new Error('build-spec: outPath is required');

  const tr = JSON.parse(readFileSync(trPath, 'utf8'));
  const cloneResult = cloneTemplate({ outPath, tr, verbose });

  if (!imageSpecPath || imageSpecPath === '-') {
    if (verbose) console.log('build-spec: no image-spec provided → text-only xlsx (template mockups intact)');
    return { outPath, bytes: cloneResult.bytes, imageSwapped: { selection: false, alv: false, processFlow: false } };
  }
  if (!existsSync(imageSpecPath)) throw new Error(`build-spec: image-spec.json not found at ${imageSpecPath}`);

  const imageSpec = JSON.parse(readFileSync(imageSpecPath, 'utf8'));
  const rendered = await renderScreenImages(imageSpec);
  if (verbose) {
    const ok = (s) => s ? `OK ${s.width}x${s.height}` : 'NULL';
    console.log(`build-spec: rendered selection=${ok(rendered.selection)} alv=${ok(rendered.alv)} processFlow=${ok(rendered.processFlow)}`);
  }
  const anyRendered = rendered.selection || rendered.alv || rendered.processFlow;
  if (!anyRendered) {
    if (verbose) console.log('build-spec: no PNGs rendered (likely missing headless browser) → keeping template mockups');
    return { outPath, bytes: cloneResult.bytes, imageSwapped: { selection: false, alv: false, processFlow: false } };
  }

  const swapResult = swapImages({
    xlsxPath: outPath,
    selectionPng:   rendered.selection?.pngBuffer,
    alvPng:         rendered.alv?.pngBuffer,
    processFlowPng: rendered.processFlow?.pngBuffer,
    verbose,
  });
  return { outPath, bytes: swapResult.bytes, imageSwapped: swapResult.swapped };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [trPath, imageSpecPath, outPath] = process.argv.slice(2);
  if (!trPath || !outPath) {
    console.error('Usage: node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>');
    process.exit(2);
  }
  try {
    await buildSpec({
      trPath: resolve(trPath),
      imageSpecPath: (imageSpecPath && imageSpecPath !== '-') ? resolve(imageSpecPath) : null,
      outPath: resolve(outPath),
    });
  } catch (e) {
    console.error(`build-spec: ${e.message}`);
    process.exit(1);
  }
}
