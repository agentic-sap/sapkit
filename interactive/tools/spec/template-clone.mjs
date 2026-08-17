// program-to-spec — Excel writer that clones the reference workbook.
//
// The workbook is never assembled from scratch. `assets/spec/template_base.xlsx`
// is unpacked, `xl/sharedStrings.xml` gets its cell texts swapped, and every
// other zip entry is written back with its bytes untouched. Styles, borders,
// fonts, column widths, row heights, drawing anchors and media therefore cannot
// drift — they are literally the same bytes the reference workbook shipped.
// That byte passthrough is the geometry guarantee documented in
// `core/procedures/program-to-spec.md`; widening the edited set would void it.
//
// The caller's deliverable is a TR map, not a workbook: a flat object whose keys
// are the template's English cell texts (entity-decoded) and whose values are
// this program's target-language replacements.
//
//     { "Object Type": "오브젝트 타입", "ZMMRTEST003": "ZMMR1001" }
//
// A cell text with no TR entry is left exactly as the template had it. That is
// deliberate — SAP identifiers the target program shares with the reference spec
// (table names, field names) need no swap — so unmapped texts are reported as a
// warning list rather than treated as an error. The producer decides which of
// them are genuine TR-map gaps.
//
// Fixed slot counts per sheet, and the placeholder conventions for filling slots
// the target program does not use, live in `core/procedures/program-to-spec.md`
// (§Excel TR Map). Keeping the row counts intact is what keeps the borders and
// fills aligned with the cloned geometry.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries, zipFiles } from './xlsx-zip.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The one zip entry this module is allowed to rewrite. */
const STRINGS_ENTRY = 'xl/sharedStrings.xml';

/** Reference workbook, relative to this file: tools/spec → assets/spec.
 *  (Upstream filed it under a top-level `asset/`; the sapkit layout is
 *  `assets/spec/`, and the inherited default pointed at a path that does not
 *  exist here — every CLI run died with "template not found", 2026-07-31.) */
const TEMPLATE_FROM_HERE = ['..', '..', 'assets', 'spec', 'template_base.xlsx'];

/** `<t>` elements carry the cell text; the capture keeps their attributes. */
const CELL_TEXT = /<t([^>]*)>([\s\S]*?)<\/t>/g;

/** How much of the unmapped-text report to print, and how long each line runs. */
const REPORT_LIMIT = 20;
const REPORT_WIDTH = 80;

// =============================================================
// XML text entities
// =============================================================
// Both tables are order-sensitive: `&amp;` is decoded last and encoded first,
// so a literal ampersand in the source text never gets read as the start of an
// entity, and an encoded entity never gets its own ampersand re-encoded.
const DECODE = [[/&lt;/g, '<'], [/&gt;/g, '>'], [/&quot;/g, '"'], [/&apos;/g, "'"], [/&amp;/g, '&']];
const ENCODE = [[/&/g, '&amp;'], [/</g, '&lt;'], [/>/g, '&gt;'], [/"/g, '&quot;'], [/'/g, '&apos;']];

const applyEntities = (text, table) =>
  table.reduce((acc, [pattern, literal]) => acc.replace(pattern, literal), text);

// Excel collapses leading/trailing whitespace and newlines unless the element
// opts out, so a replacement that carries any needs the preserve flag.
const needsPreserve = (text) => /^\s|\s$|\n/.test(text);

// Worth reporting as a possible TR-map gap: has Latin letters (so it reads as
// English source text) and is longer than a single character (bare codes and
// numbering cells are not prose).
const looksTranslatable = (text) => /[A-Za-z]/.test(text) && text.length > 1;

// =============================================================
// sharedStrings.xml rewrite
// =============================================================
function rewriteCellTexts(xml, tr) {
  const unmapped = [];
  const rewritten = xml.replace(CELL_TEXT, (element, attrs, encoded) => {
    const source = applyEntities(encoded, DECODE);
    const replacement = tr[source];
    if (replacement == null) {
      if (looksTranslatable(source)) unmapped.push(source.slice(0, REPORT_WIDTH));
      return element;
    }
    const keptAttrs = needsPreserve(replacement) && !/xml:space/.test(attrs)
      ? ` xml:space="preserve"${attrs}`
      : attrs;
    return `<t${keptAttrs}>${applyEntities(replacement, ENCODE)}</t>`;
  });
  return { xml: rewritten, unmapped };
}

function report(outPath, byteCount, unmapped) {
  console.log(`template-clone: wrote ${outPath} (${byteCount} bytes)`);
  if (unmapped.length === 0) return;
  console.log(`template-clone: ${unmapped.length} English string(s) had no TR mapping:`);
  for (const text of unmapped.slice(0, REPORT_LIMIT)) console.log(`  · ${JSON.stringify(text)}`);
  const rest = unmapped.length - REPORT_LIMIT;
  if (rest > 0) console.log(`  · … (${rest} more)`);
}

// =============================================================
// Public API
// =============================================================
export function cloneTemplate({ outPath, tr, templatePath, verbose = true }) {
  const tplPath = templatePath || resolve(HERE, ...TEMPLATE_FROM_HERE);
  if (!existsSync(tplPath)) {
    throw new Error(`template-clone: template not found at ${tplPath}`);
  }
  const entries = unzipEntries(readFileSync(tplPath));
  const strings = entries.find((entry) => entry.name === STRINGS_ENTRY);
  if (!strings) {
    throw new Error(`template-clone: ${STRINGS_ENTRY} missing from template`);
  }
  const { xml, unmapped } = rewriteCellTexts(strings.data.toString('utf8'), tr);
  strings.data = Buffer.from(xml, 'utf8');

  const workbook = zipFiles(entries);
  writeFileSync(outPath, workbook);
  if (verbose) report(outPath, workbook.length, unmapped);
  return { outPath, bytes: workbook.length, missing: unmapped };
}

// CLI:  node template-clone.mjs <tr-json-path> <out-xlsx-path>
// argv[1] is compared through resolve() against this file's own path so the
// Windows drive-letter and separator spellings of the same file still match.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [trPath, outPath] = process.argv.slice(2);
  if (!trPath || !outPath) {
    console.error('Usage: node template-clone.mjs <tr-json-path> <out-xlsx-path>');
    process.exit(2);
  }
  cloneTemplate({ outPath, tr: JSON.parse(readFileSync(trPath, 'utf8')) });
}
