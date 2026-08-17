// Swaps the mockup pictures of a cloned spec workbook and resizes their drawing anchors.
//
// template_base.xlsx ships three picture slots that every clone inherits. The clone step
// (template-clone.mjs) rewrites text only, so a freshly cloned workbook still shows the
// reference program's screenshots. This module puts the current program's renderings in
// their place — the last stage of the program-to-spec Excel pipeline.
//
//   slot          media part           sheet                    anchor   drawing part
//   ---------------------------------------------------------------------------------
//   selection     xl/media/image2.png  3 (Inputs & Screens)     C4       drawing3.xml
//   alv           xl/media/image1.png  3 (Inputs & Screens)     C19      drawing3.xml
//   processFlow   xl/media/image3.png  4 (Processing Logic)     B19      drawing4.xml
//
// Note that the media numbering does not follow the slot order: image1 is the ALV grid and
// image2 the selection screen. That is how the reference workbook was authored, and the
// numbers are part names inside a written file rather than a naming preference, so they
// stay exactly as they are.
//
// Two of the three slots are edits; the third is a creation. drawing3.xml already carries an
// <xdr:oneCellAnchor> for each Sheet-3 picture, so those need nothing but a new extent.
// drawing4.xml instead ships as an empty <xdr:wsDr/> stub — no two programs share a flow
// chart, so the reference workbook deliberately has none — which makes the first
// process-flow write a full injection: the anchor XML, the media part, and the relationship
// pointing from one to the other.
//
// WHY THE EXTENTS ARE RECOMPUTED
//   <xdr:ext> is a fixed EMU box, and Excel stretches the picture to fill it. Keeping the
//   template's numbers therefore forces every incoming PNG into the reference program's
//   aspect ratio; a 3.88:1 selection screenshot dropped into the template's 3.21:1 box came
//   out with visibly squashed text (2026-05-24). Each extent is instead derived from the
//   PNG's own IHDR dimensions, at 9525 EMU per pixel — 96 DPI against the 914400 EMU inch.
//
// WHEN THIS RUNS
//   On every Excel spec. build-spec.mjs invokes it unconditionally as pipeline step 3;
//   there is no trigger keyword and no opt-in switch. An earlier design did gate it behind
//   keywords to hold off "drift", but that misread which drift was at issue: the risk was
//   template_base geometry regressing, and geometry is precisely what this module leaves
//   alone. Styles, column widths, row heights and anchor positions all remain as cloned —
//   only <xdr:ext> values and PNG bytes move. Slots arriving without a PNG are skipped,
//   which doubles as the graceful-degrade path: with no headless browser installed the
//   renderer yields nulls and the workbook simply keeps the template's generic mockups.
//
// FAILURE POSTURE
//   Anything unexpected throws before a single byte is written — input that is not a PNG, a
//   missing media part, a drawing part with no anchor for the picture being replaced. A
//   half-swapped workbook greets the reader with Excel's repair prompt, so there is
//   deliberately no warn-and-continue path. template_base.xlsx itself is never written to;
//   callers hand over an already-cloned target.
//
// API
//   swapImages({ xlsxPath, selectionPng?, alvPng?, processFlowPng?, verbose? })
//     Each PNG argument takes a Buffer, a path string, or null/undefined to skip the slot.
//     Returns { xlsxPath, swapped: { selection, alv, processFlow }, bytes }, where bytes is
//     0 and the file is left untouched when no PNG at all was supplied.
//
// CLI
//   node image-swap.mjs <xlsx> --selection <png> --alv <png> --process-flow <png>
//   node image-swap.mjs <xlsx> <selection> <alv> <process-flow>      ("-" skips a slot)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries, zipFiles } from './xlsx-zip.mjs';

// ============================================================
// Format literals — these mirror what is inside the workbook
// ============================================================
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Magic (8) + IHDR length and type (8) + width and height (8): the shortest prefix from
// which dimensions can be read at all.
const PNG_HEADER_BYTES = 24;

const EMU_PER_PX = 9525;
const toEmu = (px) => px * EMU_PER_PX;

const DRAWING3_PART = 'xl/drawings/drawing3.xml';
const DRAWING4_PART = 'xl/drawings/drawing4.xml';
const DRAWING4_RELS_PART = 'xl/drawings/_rels/drawing4.xml.rels';

const mediaPart = (picture) => `xl/media/${picture}`;

// The Sheet-3 pair, listed in the order their inputs get validated and reported.
const SHEET3_SLOTS = [
  { key: 'selection', picture: 'image2.png' },
  { key: 'alv', picture: 'image1.png' },
];

const PF_PICTURE = 'image3.png';
// Sheet 4 anchors the flow chart at B19. XML coordinates count from zero, and B18 carries
// the "Process Flow Chart" heading, so the picture opens on the row beneath it.
const PF_ANCHOR_COL = 1;
const PF_ANCHOR_ROW = 18;

// The injected Sheet-4 drawing: one picture, top-left pinned to the cell, sized to the PNG.
function processFlowDrawing(cx, cy) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${PF_ANCHOR_COL}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${PF_ANCHOR_ROW}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="${PF_PICTURE}"/><xdr:cNvPicPr preferRelativeResize="0"/></xdr:nvPicPr><xdr:blipFill><a:blip cstate="print" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr></xdr:pic><xdr:clientData fLocksWithSheet="0"/></xdr:oneCellAnchor></xdr:wsDr>`;
}

// rId1 above resolves through this: the only relationship Sheet 4's drawing needs.
const PROCESS_FLOW_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${PF_PICTURE}"/></Relationships>`;

// ============================================================
// Inputs
// ============================================================
// Accepts a slot argument in any of its three shapes and reports the PNG's dimensions.
// Returns null for an absent slot; throws on anything that is present but unusable.
function readPngSlot(source, label) {
  if (source == null) return null;

  let bytes;
  if (Buffer.isBuffer(source)) {
    bytes = source;
  } else if (typeof source === 'string') {
    if (!existsSync(source)) throw new Error(`image-swap: ${label} PNG not found at ${source}`);
    bytes = readFileSync(source);
  } else {
    throw new Error(`image-swap: ${label} must be Buffer or file path, got ${typeof source}`);
  }

  if (bytes.length < PNG_HEADER_BYTES || !PNG_MAGIC.equals(bytes.subarray(0, 8))) {
    throw new Error(`image-swap: ${label} does not have a valid PNG signature`);
  }

  // IHDR is mandated to be the first chunk, so the dimensions sit at fixed offsets:
  // [8 magic][4 length][4 "IHDR"][4 width BE][4 height BE].
  return { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// ============================================================
// ZIP entry list edits (in place — the caller re-zips afterwards)
// ============================================================
// Replaces the payload of every entry under `name`. Reports whether any existed.
function overwriteEntry(entries, name, data) {
  let matched = false;
  for (const entry of entries) {
    if (entry.name !== name) continue;
    entry.data = data;
    matched = true;
  }
  return matched;
}

// Same, but appends the entry when the workbook does not have one yet.
function upsertEntry(entries, name, data) {
  if (!overwriteEntry(entries, name, data)) entries.push({ name, data });
}

// ============================================================
// Drawing XML edits
// ============================================================
const ANCHOR_BLOCK = /<xdr:oneCellAnchor>[\s\S]*?<\/xdr:oneCellAnchor>/g;
const ANCHOR_EXTENT = /<xdr:ext\s+cx="\d+"\s+cy="\d+"\s*\/>/;

// Rewrites the extent of the one anchor block whose picture is `picture`, leaving that
// block's <xdr:from> coordinates and every sibling block untouched. Blocks are located by
// picture name rather than position, so the workbook may list them in any order.
function resizeAnchor(xml, picture, cx, cy) {
  let located = false;
  const rewritten = xml.replace(ANCHOR_BLOCK, (block) => {
    if (!block.includes(`name="${picture}"`)) return block;
    located = true;
    return block.replace(ANCHOR_EXTENT, `<xdr:ext cx="${cx}" cy="${cy}"/>`);
  });
  if (!located) {
    throw new Error(`image-swap: drawing3.xml has no oneCellAnchor referencing ${picture}`);
  }
  return rewritten;
}

// Writes the Sheet-4 flow chart: anchor XML over the stub, then the media part and its
// relationship, either of which may still be missing on a first injection.
function injectProcessFlow(entries, png) {
  const drawing = Buffer.from(processFlowDrawing(toEmu(png.width), toEmu(png.height)), 'utf8');
  if (!overwriteEntry(entries, DRAWING4_PART, drawing)) {
    throw new Error(`image-swap: ${DRAWING4_PART} missing — wrong template?`);
  }
  upsertEntry(entries, mediaPart(PF_PICTURE), png.bytes);
  upsertEntry(entries, DRAWING4_RELS_PART, Buffer.from(PROCESS_FLOW_RELS, 'utf8'));
}

// ============================================================
// Public API
// ============================================================
export function swapImages({
  xlsxPath,
  selectionPng = null,
  alvPng = null,
  processFlowPng = null,
  verbose = true,
}) {
  if (!xlsxPath) throw new Error('image-swap: xlsxPath is required');
  if (!existsSync(xlsxPath)) throw new Error(`image-swap: xlsx not found at ${xlsxPath}`);

  // Validate every input up front: a rejected PNG must not leave a partly written file.
  const incoming = {
    selection: readPngSlot(selectionPng, 'selectionPng'),
    alv: readPngSlot(alvPng, 'alvPng'),
    processFlow: readPngSlot(processFlowPng, 'processFlowPng'),
  };

  if (!incoming.selection && !incoming.alv && !incoming.processFlow) {
    if (verbose) console.log('image-swap: nothing to swap (all inputs null) — file untouched');
    return {
      xlsxPath,
      swapped: { selection: false, alv: false, processFlow: false },
      bytes: 0,
    };
  }

  const entries = unzipEntries(readFileSync(xlsxPath));
  const swapped = { selection: false, alv: false, processFlow: false };

  // Sheet 3 — media bytes first, then the extents in the drawing that frames them.
  for (const slot of SHEET3_SLOTS) {
    const png = incoming[slot.key];
    if (!png) continue;
    const part = mediaPart(slot.picture);
    if (!overwriteEntry(entries, part, png.bytes)) {
      throw new Error(`image-swap: ${part} slot not found — wrong template?`);
    }
    swapped[slot.key] = true;
  }

  if (incoming.selection || incoming.alv) {
    let resized = false;
    for (const entry of entries) {
      if (entry.name !== DRAWING3_PART) continue;
      let xml = entry.data.toString('utf8');
      for (const slot of SHEET3_SLOTS) {
        const png = incoming[slot.key];
        if (png) xml = resizeAnchor(xml, slot.picture, toEmu(png.width), toEmu(png.height));
      }
      entry.data = Buffer.from(xml, 'utf8');
      resized = true;
    }
    if (!resized) throw new Error(`image-swap: ${DRAWING3_PART} not found — wrong template?`);
  }

  // Sheet 4 — anchor, media and relationship in one go.
  if (incoming.processFlow) {
    injectProcessFlow(entries, incoming.processFlow);
    swapped.processFlow = true;
  }

  const rezipped = zipFiles(entries);
  writeFileSync(xlsxPath, rezipped);

  if (verbose) {
    const done = [];
    for (const slot of SHEET3_SLOTS) {
      if (swapped[slot.key]) {
        done.push(`${slot.key}→${slot.picture} (${incoming[slot.key].bytes.length} B)`);
      }
    }
    const pf = incoming.processFlow;
    if (pf) done.push(`processFlow→${PF_PICTURE} (${pf.bytes.length} B, ${pf.width}×${pf.height} px)`);
    console.log(`image-swap: ${xlsxPath} updated — ${done.join(', ')} | total ${rezipped.length} B`);
  }

  return { xlsxPath, swapped, bytes: rezipped.length };
}

// ============================================================
// CLI
// ============================================================
const SLOT_FLAGS = new Map([
  ['--selection', 'selection'], ['-s', 'selection'],
  ['--alv', 'alv'], ['-a', 'alv'],
  ['--process-flow', 'processFlow'], ['-p', 'processFlow'],
]);

// Positional slots follow the workbook path, in this order.
const POSITIONAL_SLOTS = ['selection', 'alv', 'processFlow'];

const USAGE = [
  'Usage:',
  '  node image-swap.mjs <xlsx> --selection <p> --alv <p> --process-flow <p>',
  '  node image-swap.mjs <xlsx> <selection.png> <alv.png> <process-flow.png>',
  '      (positional, use "-" to skip any slot)',
];

// Flags win over positionals for the same slot; "-" in a positional means "leave this one".
function parseCliArgs(argv) {
  const parsed = { xlsx: null, selection: null, alv: null, processFlow: null, help: false };
  const loose = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const slot = SLOT_FLAGS.get(token);
    if (slot) { parsed[slot] = argv[++i]; continue; }
    if (token === '--help' || token === '-h') { parsed.help = true; continue; }
    loose.push(token);
  }

  if (loose[0]) parsed.xlsx = loose[0];
  POSITIONAL_SLOTS.forEach((slot, index) => {
    const value = loose[index + 1];
    if (value && parsed[slot] == null && value !== '-') parsed[slot] = value;
  });
  return parsed;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help || !args.xlsx) {
    for (const line of USAGE) console.log(line);
    process.exit(args.help ? 0 : 2);
  }
  try {
    swapImages({
      xlsxPath: resolve(args.xlsx),
      selectionPng: args.selection ? resolve(args.selection) : null,
      alvPng: args.alv ? resolve(args.alv) : null,
      processFlowPng: args.processFlow ? resolve(args.processFlow) : null,
    });
  } catch (err) {
    console.error(`image-swap: ${err.message}`);
    process.exit(1);
  }
}
