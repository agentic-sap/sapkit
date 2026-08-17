// program-to-spec — the one entry point that turns a writer's two JSON files
// into a finished spec workbook.
//
// Three stages, in this order, on every run:
//
//   1. cloneTemplate(tr)        → out.xlsx: template geometry byte-for-byte,
//                                 cell texts swapped to the target language
//   2. renderScreenImages(spec) → selection / ALV / process-flow PNG buffers
//   3. swapImages(out.xlsx, …)  → this program's own mockups on Sheet 3 and its
//                                 own horizontal process flow on Sheet 4
//
// WHY STAGES 2-3 ARE NOT OPT-IN
//   An earlier revision put the image stages behind trigger keywords, on the
//   theory that they caused geometry drift. They do not. Drift came from
//   assembling the workbook from scratch, which is exactly what the stage-1
//   clone replaces. The swap rewrites only the `<xdr:ext>` extents inside
//   xl/drawings/drawingN.xml and the PNG payloads under xl/media — column
//   widths, row heights, styles and fonts stay the bytes template_base.xlsx
//   shipped. And every program has its own selection screen, list layout and
//   flow, so no spec ever wanted the template's generic mockups. The gate was
//   removed for those two reasons; do not reintroduce it.
//
// GRACEFUL DEGRADE
//   Rendering shells out to a headless browser. With none installed,
//   renderScreenImages hands back null for each slot, the swap is skipped, and
//   the workbook ships with the template's generic mockups on Sheet 3 and an
//   empty Sheet 4 drawing. That is a thinner spec, never a failed run.
//
// WHAT THE WRITER SUPPLIES
//   Two JSON files, both kept beside the workbook for traceability:
//     · .sapkit/specs/_tr/{OBJECT}-{YYYYMMDD}.tr.json          cell-text map
//     · .sapkit/specs/_img/{OBJECT}-{YYYYMMDD}.image-spec.json render argument
//   Their schemas and the output-path convention live in
//   `core/procedures/program-to-spec.md`.
//
// CLI
//   node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>
//   A `-` in the second slot skips stages 2-3 and ships the text-only workbook.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloneTemplate } from './template-clone.mjs';
import { swapImages } from './image-swap.mjs';
import { renderScreenImages } from './screen-image-renderer.mjs';

// =============================================================
// Language-mixing guard
// =============================================================
// A ko/ja workbook is assembled from an English template plus writer-supplied
// image content, so English survives in two places: a template cell the TR map
// never covered, and a label the image-spec bakes straight into a PNG. Neither
// shows up until someone opens the finished file — which is how the mixed-
// language spec the user reported got out.
//
// The guard reads both sources and prints one list of everything still in
// English. It warns and continues: a leaked label is a translation defect, not
// a reason to withhold the workbook, and a run that degraded to template
// mockups still has to reach the writer.

/** Only these targets can suffer the mix — an `en` spec is English by design. */
const TRANSLATED_TARGETS = new Set(['ko', 'ja']);

/** Report caps: leaks listed per source, and how much of each value is shown. */
const LIST_LIMIT = 25;
const VALUE_WIDTH = 80;

/** Hangul syllables and kana — proof the string has already been translated. */
const LOCALIZED_SCRIPT = /[가-힯぀-ヿ]/;

// Prose = a phrase the reader expects in their own language. Bare SAP
// identifiers (VBAK, S_VKORG, ZMMR00140) also read as English but are correct
// as they stand, so the test has to let them past.
function readsAsEnglishProse(value) {
  const text = String(value);
  if (LOCALIZED_SCRIPT.test(text)) return false;   // already localized
  if (!/[A-Za-z]/.test(text)) return false;        // digits, symbols, punctuation
  // Several words with a lowercase run in them: a caption or a sentence.
  if (/\s/.test(text) && /[a-z]{2,}/.test(text)) return true;
  // A single token long enough to be a word, and neither an all-caps
  // abbreviation nor an identifier (those carry `_`, a digit, a dot or a slash).
  return /^[A-Za-z]{4,}$/.test(text) && !/^[A-Z]+$/.test(text);
}

// Walks the prose-bearing fields of an image-spec, in the order the report
// prints them. `name` keys and sampleRows are skipped on purpose: those hold
// SAP field names and demo values, which stay as the writer typed them.
function collectImageSpecLeaks(spec, lang) {
  if (!spec || !TRANSLATED_TARGETS.has(lang)) return [];

  const leaks = [];
  const check = (path, value) => {
    if (value == null || value === '') return;
    if (readsAsEnglishProse(value)) leaks.push({ path, value: String(value).slice(0, VALUE_WIDTH) });
  };
  const checkHeaders = (grid) => {
    for (const column of grid?.columns || []) check('alv.column.header', column?.header);
  };

  const selection = spec.selection || {};
  check('selection.blockLabel', selection.blockLabel);
  check('selection.optionBlockLabel', selection.optionBlockLabel);
  for (const field of [...(selection.fields || []), ...(selection.optionFields || [])]) {
    check('selection.field.label', field?.label);
    check('selection.field.note', field?.note);
  }

  // A single grid carries `columns`; a Split-ALV / Tabstrip carries `panes`,
  // each with its own title, interaction hint and columns.
  checkHeaders(spec.alv);
  for (const pane of spec.alv?.panes || []) {
    check('alv.pane.title', pane?.title);
    check('alv.pane.interaction', pane?.interaction);
    checkHeaders(pane);
  }
  check('alv.interaction', spec.alv?.interaction);

  // processFlow is either a linear string[] or the branching { nodes, edges }
  // graph. Step prefixes (`?` decision, `!` terminal) and the line breaks in
  // node labels come off first — they are drawing instructions, not words.
  const flow = spec.processFlow;
  if (Array.isArray(flow)) {
    for (const step of flow) check('processFlow', String(step).replace(/^[?!]\s*/, ''));
  } else if (flow && Array.isArray(flow.nodes)) {
    for (const node of flow.nodes) check('processFlow.node.label', String(node?.label ?? '').replace(/\n/g, ' '));
    for (const edge of flow.edges || []) check('processFlow.edge.label', edge?.label);
  }
  return leaks;
}

function printLeaks(leaks, format) {
  for (const leak of leaks.slice(0, LIST_LIMIT)) console.log(`    · ${format(leak)}`);
  const rest = leaks.length - LIST_LIMIT;
  if (rest > 0) console.log(`    · … (${rest} more)`);
}

// Both sources in one report. The clone's unmapped-text list supplies the cell
// side; the image-spec walk supplies the PNG side.
function reportLanguageMix({ missing, imageSpec, lang, verbose }) {
  if (!verbose) return;
  const translated = TRANSLATED_TARGETS.has(lang);
  const cellLeaks = translated ? (missing || []).filter((text) => readsAsEnglishProse(text)) : [];
  const imageLeaks = collectImageSpecLeaks(imageSpec, lang);

  if (!cellLeaks.length && !imageLeaks.length) {
    if (translated) console.log(`build-spec: language check OK — no English prose leaked into the ${lang} spec.`);
    return;
  }

  console.log(`\n⚠ build-spec: LANGUAGE MIX detected (target lang=${lang}). Translate these and re-run:`);
  if (cellLeaks.length) {
    console.log(`  TR map — ${cellLeaks.length} untranslated English string(s) (still English in the xlsx cells):`);
    printLeaks(cellLeaks, (text) => JSON.stringify(text));
  }
  if (imageLeaks.length) {
    console.log(`  image-spec — ${imageLeaks.length} English label(s) baked into the mockup PNGs:`);
    printLeaks(imageLeaks, (leak) => `${leak.path}: ${JSON.stringify(leak.value)}`);
  }
  console.log('');
}

// =============================================================
// Public API
// =============================================================
/** What `imageSwapped` reports whenever stage 3 never ran. */
const NOTHING_SWAPPED = { selection: false, alv: false, processFlow: false };

export async function buildSpec({ trPath, imageSpecPath = null, outPath, verbose = true }) {
  if (!trPath || !existsSync(trPath)) throw new Error(`build-spec: tr.json not found at ${trPath}`);
  if (!outPath) throw new Error('build-spec: outPath is required');

  const tr = JSON.parse(readFileSync(trPath, 'utf8'));
  const cloned = cloneTemplate({ outPath, tr, verbose });

  // Stage 1 alone: no image-spec, so the template's generic mockups stand.
  if (!imageSpecPath || imageSpecPath === '-') {
    if (verbose) console.log('build-spec: no image-spec provided → text-only xlsx (template mockups intact)');
    reportLanguageMix({ missing: cloned.missing, imageSpec: null, lang: tr.__lang || 'en', verbose });
    return { outPath, bytes: cloned.bytes, imageSwapped: { ...NOTHING_SWAPPED } };
  }
  if (!existsSync(imageSpecPath)) throw new Error(`build-spec: image-spec.json not found at ${imageSpecPath}`);

  const imageSpec = JSON.parse(readFileSync(imageSpecPath, 'utf8'));
  // The image-spec states the target language; the TR map's `__lang` is the
  // fallback. Report before rendering, so the leak list arrives even when the
  // browser is slow or absent.
  reportLanguageMix({ missing: cloned.missing, imageSpec, lang: imageSpec.lang || tr.__lang || 'en', verbose });

  const pngs = await renderScreenImages(imageSpec);
  if (verbose) {
    const slot = (png) => (png ? `OK ${png.width}x${png.height}` : 'NULL');
    console.log(`build-spec: rendered selection=${slot(pngs.selection)} alv=${slot(pngs.alv)} processFlow=${slot(pngs.processFlow)}`);
  }
  if (!pngs.selection && !pngs.alv && !pngs.processFlow) {
    if (verbose) console.log('build-spec: no PNGs rendered (likely missing headless browser) → keeping template mockups');
    return { outPath, bytes: cloned.bytes, imageSwapped: { ...NOTHING_SWAPPED } };
  }

  // Partial renders are normal: the swap takes the slots that came back and
  // leaves the rest of the workbook on its template mockup.
  const swap = swapImages({
    xlsxPath: outPath,
    selectionPng: pngs.selection?.pngBuffer,
    alvPng: pngs.alv?.pngBuffer,
    processFlowPng: pngs.processFlow?.pngBuffer,
    verbose,
  });
  return { outPath, bytes: swap.bytes, imageSwapped: swap.swapped };
}

// =============================================================
// CLI
// =============================================================
// argv[1] goes through resolve() before the comparison so this file spelled
// with a Windows drive letter or back-slashes still matches its own URL.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [trArg, imageArg, outArg] = process.argv.slice(2);
  if (!trArg || !outArg) {
    console.error('Usage: node build-spec.mjs <tr.json> <image-spec.json|-> <out.xlsx>');
    process.exit(2);
  }
  try {
    await buildSpec({
      trPath: resolve(trArg),
      imageSpecPath: (imageArg && imageArg !== '-') ? resolve(imageArg) : null,
      outPath: resolve(outArg),
    });
  } catch (error) {
    console.error(`build-spec: ${error.message}`);
    process.exit(1);
  }
}
