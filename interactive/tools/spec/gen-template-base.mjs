// Builds `assets/spec/template_base.xlsx` — the reference workbook every Excel
// spec is cloned from.
//
// WHY A GENERATOR AND NOT A CHECKED-IN BINARY
//   The pipeline treats that workbook as its geometry authority: template-clone
//   copies every zip entry byte-for-byte except sharedStrings, so whatever the
//   template says about styles, widths, row heights and drawing anchors is what
//   every delivered spec says. A binary nobody can rebuild makes that authority
//   unauditable — a wrong column width or a lost anchor can only be fixed by
//   hand-editing zip members. This script is the workbook's source: the parts
//   are authored here, the two mockup PNGs are rendered here, and the archive is
//   sealed with the same xlsx-zip writer the rest of the pipeline uses.
//
// THE CONTRACT IT HAS TO SATISFY
//   `core/procedures/program-to-spec.md` is the consumer-side spec, and two
//   modules read the result:
//
//   template-clone.mjs — rewrites `xl/sharedStrings.xml` and nothing else, by
//     substituting `<t>` payloads through a TR map keyed on the English source
//     text. So every cell text in this workbook must live in sharedStrings; an
//     inline string would be untranslatable and would silently ship English
//     into a Korean spec.
//
//   image-swap.mjs — replaces the mockups. It requires, by exact part name:
//       xl/media/image1.png      the ALV grid          (Sheet 3, anchored C19)
//       xl/media/image2.png      the selection screen  (Sheet 3, anchored C4)
//       xl/drawings/drawing3.xml one bare <xdr:oneCellAnchor> per picture,
//                                located by `name="imageN.png"`, each holding an
//                                <xdr:ext cx=".." cy=".."/> the swap recomputes
//       xl/drawings/drawing4.xml an EMPTY <xdr:wsDr/> stub — the part has to
//                                exist (the swap overwrites, never creates it)
//                                and must carry no anchor, because no two
//                                programs share a process flow
//     `xl/media/image3.png` and `xl/drawings/_rels/drawing4.xml.rels` are
//     deliberately absent: the swap injects both on the first process-flow
//     write. Shipping them would mean shipping a flow chart that belongs to no
//     program.
//
//   Media numbering therefore runs against slot order — image1 is the grid,
//   image2 the screen. That is part-name identity inside a written file, not a
//   naming preference, so it stays.
//
// WHY SEVEN DRAWINGS FOR TWO PICTURES
//   drawing3 and drawing4 are named for the sheets they belong to. Keeping
//   drawingN ↔ sheetN across all seven sheets makes those two names derived
//   rather than magic, and lets a later sheet host an image without renumbering
//   the parts image-swap hardcodes. The five unused ones are the same empty stub
//   Sheet 4 already needs.
//
// WHAT THE CELLS SAY
//   The workbook is a finished specification for a reference report, not a form
//   of blanks: its texts ARE the TR keys, and the slot counts per sheet are what
//   keeps a target program's borders and fills aligned after cloning. Counts,
//   column headers and the reference identifiers (ZMMRTEST003, VBAK, VBELN,
//   S_VKORG…S_VBELN) come from the procedure document's TR-map section; the
//   prose is written here. Identifiers a target program shares with the
//   reference are meant to survive the clone unmapped, which is why they are
//   real names rather than `{{placeholders}}`.
//
// DETERMINISM
//   Same input, same bytes. Shared strings are numbered in first-use order,
//   xlsx-zip writes zeroed member timestamps, and the PNG renders are stable for
//   a given browser build. Run it twice and diff if in doubt.
//
// CLI
//   node gen-template-base.mjs [out.xlsx]
//   Defaults to ../../assets/spec/template_base.xlsx, i.e. it replaces the
//   asset in place. Pass a path to build somewhere else (reproducibility
//   checks, review copies).

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFiles } from './xlsx-zip.mjs';
import { renderScreenImages } from './screen-image-renderer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '..', '..', 'assets', 'spec', 'template_base.xlsx');

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const EMU_PER_PX = 9525;
const PT_PER_PX = 0.75;          // 96 DPI screen pixel → Excel's typographic point
const DEFAULT_ROW_PT = 15;

const esc = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// ══════════════════════════════════════════════════════════════════
// 1. Styles — the geometry half of what the clone inherits
// ══════════════════════════════════════════════════════════════════
// Colours are literal rgb so the workbook needs no theme part: a theme would be
// a large inherited blob whose only job is to name the same greys.

const INK = 'FF1F2937';        // body text
const INK_STRONG = 'FF0F2A43'; // headings
const INK_SOFT = 'FF6B7280';   // captions
const INK_FAINT = 'FF9CA3AF';  // placeholder text
const NAVY = 'FF1F3B57';       // table header fill
const RULE = 'FFD5DBE1';       // cell borders
const BAND = 'FFF4F6F8';       // key-column and trailer fill
const PANEL = 'FFE8EEF4';      // section heading fill
const CAUTION_INK = 'FF92400E';
const CAUTION_FILL = 'FFFEF6E7';
const CAUTION_RULE = 'FFE3CFA3';

const FONTS = [
  { sz: 10, color: INK, name: 'Calibri' },                          // 0 body
  { sz: 10, color: INK, name: 'Calibri', b: true },                 // 1 body bold
  { sz: 16, color: INK_STRONG, name: 'Calibri', b: true },          // 2 sheet title
  { sz: 9, color: INK_SOFT, name: 'Calibri', i: true },             // 3 caption
  { sz: 10, color: 'FFFFFFFF', name: 'Calibri', b: true },          // 4 table header
  { sz: 11, color: INK_STRONG, name: 'Calibri', b: true },          // 5 section heading
  { sz: 10, color: INK, name: 'Consolas' },                         // 6 identifier
  { sz: 10, color: INK_STRONG, name: 'Consolas', b: true },         // 7 identifier bold
  { sz: 10, color: INK_FAINT, name: 'Calibri', i: true },           // 8 placeholder
  { sz: 10, color: CAUTION_INK, name: 'Calibri' },                  // 9 review note
  { sz: 9, color: INK_SOFT, name: 'Calibri' },                      // 10 trailer
  { sz: 12, color: INK_STRONG, name: 'Calibri', b: true },          // 11 chart heading
];

// `null` = no fill (index 0 and 1 are the two Excel reserves).
const FILLS = [null, 'gray125', NAVY, BAND, PANEL, CAUTION_FILL];

// `all` boxes the cell; `bottom` rules underneath it.
const BORDERS = [
  null,                                        // 0 none
  { all: RULE },                               // 1 table cell
  { all: NAVY },                               // 2 table header
  { bottom: { style: 'medium', rgb: NAVY } },  // 3 title underline
  { all: CAUTION_RULE },                       // 4 review note
];

// horizontal / vertical / wrap, applied only where it differs from the default.
const CELL_STYLES = [
  { name: 'base', font: 0 },
  { name: 'title', font: 2, border: 3, v: 'center' },
  { name: 'caption', font: 3, v: 'center' },
  { name: 'chartHeading', font: 11, v: 'center' },
  { name: 'section', font: 5, fill: 4, border: 1, v: 'center' },
  { name: 'th', font: 4, fill: 2, border: 2, h: 'left', v: 'center' },
  { name: 'thCenter', font: 4, fill: 2, border: 2, h: 'center', v: 'center' },
  { name: 'text', font: 0, border: 1, v: 'top', wrap: true },
  { name: 'center', font: 0, border: 1, h: 'center', v: 'center' },
  { name: 'label', font: 1, fill: 3, border: 1, v: 'center' },
  { name: 'ident', font: 6, border: 1, v: 'center' },
  { name: 'identKey', font: 7, fill: 3, border: 1, v: 'center' },
  { name: 'identCenter', font: 6, border: 1, h: 'center', v: 'center' },
  { name: 'placeholder', font: 8, border: 1, h: 'center', v: 'center' },
  { name: 'trailer', font: 10, fill: 3, border: 1, v: 'center', wrap: true },
  { name: 'note', font: 9, fill: 5, border: 4, v: 'center', wrap: true },
  { name: 'noteMark', font: 9, fill: 5, border: 4, h: 'center', v: 'center' },
];

const STYLE = Object.fromEntries(CELL_STYLES.map((style, index) => [style.name, index]));

function fontXml({ sz, b, i, color, name }) {
  return `<font><sz val="${sz}"/>${b ? '<b/>' : ''}${i ? '<i/>' : ''}`
    + `<color rgb="${color}"/><name val="${name}"/></font>`;
}

function fillXml(fill) {
  if (fill === null) return '<fill><patternFill patternType="none"/></fill>';
  if (fill === 'gray125') return '<fill><patternFill patternType="gray125"/></fill>';
  return `<fill><patternFill patternType="solid"><fgColor rgb="${fill}"/>`
    + '<bgColor indexed="64"/></patternFill></fill>';
}

function borderXml(border) {
  if (!border) return '<border><left/><right/><top/><bottom/><diagonal/></border>';
  if (border.all) {
    const side = (tag) => `<${tag} style="thin"><color rgb="${border.all}"/></${tag}>`;
    return `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`;
  }
  const { style, rgb } = border.bottom;
  return `<border><left/><right/><top/><bottom style="${style}"><color rgb="${rgb}"/></bottom>`
    + '<diagonal/></border>';
}

function cellXfXml({ font = 0, fill = 0, border = 0, h, v, wrap }) {
  const parts = [];
  if (h) parts.push(`horizontal="${h}"`);
  if (v) parts.push(`vertical="${v}"`);
  if (wrap) parts.push('wrapText="1"');
  const alignment = parts.length ? `<alignment ${parts.join(' ')}/>` : '';
  return `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"`
    + ` applyFont="1" applyFill="1" applyBorder="1"${alignment ? ' applyAlignment="1"' : ''}>`
    + `${alignment}</xf>`;
}

function stylesXml() {
  return XML_DECL
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<fonts count="${FONTS.length}">${FONTS.map(fontXml).join('')}</fonts>`
    + `<fills count="${FILLS.length}">${FILLS.map(fillXml).join('')}</fills>`
    + `<borders count="${BORDERS.length}">${BORDERS.map(borderXml).join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${CELL_STYLES.length}">${CELL_STYLES.map(cellXfXml).join('')}</cellXfs>`
    // Names the built-in style every xf inherits from. Excel shows it as
    // "Normal" in the style gallery; without it the gallery opens empty.
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

// ══════════════════════════════════════════════════════════════════
// 2. Sheet content — a finished spec for the reference report
// ══════════════════════════════════════════════════════════════════
// Row builders return descriptors the serializer turns into <row> elements:
//   { at, h?, merge?: [ref], cells: { COL: [styleName, text] } }
// `text` null leaves the cell empty but styled, which is how a merged range
// keeps its border across the cells it swallows.

const OBJECT = 'ZMMRTEST003';

/** Title + caption pair that opens every sheet. */
function heading(title, caption, span) {
  return [
    { at: 2, h: 26, merge: [`B2:${span}2`], cells: { B: ['title', title] } },
    { at: 3, h: 18, merge: [`B3:${span}3`], cells: { B: ['caption', caption] } },
  ];
}

/** One full-width bar introducing a block inside a sheet. */
function section(at, text, span) {
  const cells = { B: ['section', text] };
  return { at, h: 20, merge: [`B${at}:${span}${at}`], cells };
}

/**
 * Header row plus body rows over the given columns.
 * `body` rows are arrays of texts; `styles` names the body style per column,
 * `headerStyles` the header style per column (defaults to left-aligned).
 */
function table({ at, cols, header, styles, headerStyles, body, headerHeight = 20, rowHeight = 18 }) {
  const rows = [{
    at,
    h: headerHeight,
    cells: Object.fromEntries(cols.map((col, i) => [col, [headerStyles?.[i] || 'th', header[i]]])),
  }];
  body.forEach((line, index) => {
    rows.push({
      at: at + 1 + index,
      h: rowHeight,
      cells: Object.fromEntries(cols.map((col, i) => [col, [styles[i], line[i]]])),
    });
  });
  return rows;
}

/** Full-width review notes, each with its own marker cell. */
function notes(at, texts, span) {
  return texts.map((text, index) => ({
    at: at + index,
    h: 20,
    merge: [`C${at + index}:${span}${at + index}`],
    cells: { B: ['noteMark', '⚠'], C: ['note', text] },
  }));
}

// ── Sheet 1 · Program Overview ─────────────────────────────────────
// 17 Field/Value rows: identification, ownership, and the one-paragraph
// business purpose a reader needs before any other sheet makes sense.
const OVERVIEW = [
  ['Program Name', OBJECT],
  ['Object Type', 'PROG/P (ABAP Report)'],
  ['Program Title', 'Open sales order items'],
  ['Development Package', 'ZMM_REPORT'],
  ['Original Transport', 'ZMMK900123'],
  ['Created By', 'ZDEVELOPER'],
  ['Created On', '2026-01-14'],
  ['Last Changed By', 'ZDEVELOPER'],
  ['Last Changed On', '2026-03-02'],
  ['Archetype', 'ALV report, read-only'],
  ['Transaction Code', 'ZMM01'],
  ['Execution Mode', 'Dialog, and as a background variant'],
  ['Selection Screen', '1000, standard'],
  ['Main Data Source', 'VBAK'],
  ['Output Medium', 'ALV grid, with spreadsheet export'],
  ['Expected Volume', 'Up to 50,000 items per run'],
  ['Business Purpose', 'Lists the sales order items still open for a sales organisation and'
    + ' document date range, so the order desk can work the backlog from one list.'],
];

const sheet1 = {
  tab: 'Program Overview',
  cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 26], [4, 4, 78]],
  rows: [
    ...heading(`Program Overview (${OBJECT})`, 'Identification and ownership of the object this specification describes.', 'D'),
    ...table({
      at: 5,
      cols: ['C', 'D'],
      header: ['Field', 'Value'],
      styles: ['label', 'text'],
      body: OVERVIEW,
    }),
  ],
};

// ── Sheet 2 · Data Model ───────────────────────────────────────────
// 4 table slots plus a trailer that fixes the access legend, so a reader never
// has to guess whether READ excludes writes.
const DATA_MODEL = [
  ['VBAK', 'READ', 'VBELN', 'Driving',
    'Sales document header. Narrowed by the sales organisation and document date on the selection screen.'],
  ['VBAP', 'READ', 'VBELN, POSNR', 'INNER JOIN',
    'Item level. Supplies material, order quantity, sales unit and net value.'],
  ['VBUK', 'READ', 'VBELN', 'LEFT JOIN',
    'Header status. Only documents whose overall delivery status is A or B stay in the list.'],
  ['KNA1', 'READ', 'KUNNR', 'LEFT JOIN',
    'Sold-to party name for the output. Missing master data leaves the name column empty.'],
];

const sheet2 = {
  tab: 'Data Model',
  cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 14], [4, 4, 12], [5, 5, 24], [6, 6, 14], [7, 7, 62]],
  rows: [
    ...heading('Data Model', 'Tables the program reads, in the order the main SELECT resolves them.', 'G'),
    ...table({
      at: 5,
      cols: ['C', 'D', 'E', 'F', 'G'],
      header: ['Table', 'Access', 'Key Fields', 'Join Type', 'Notes'],
      headerStyles: ['th', 'thCenter', 'th', 'thCenter', 'th'],
      styles: ['identKey', 'center', 'ident', 'center', 'text'],
      body: DATA_MODEL,
      rowHeight: 30,
    }),
    {
      at: 10,
      h: 20,
      merge: ['C10:G10'],
      cells: {
        C: ['trailer', 'Access legend: READ is a SELECT only. The program issues no INSERT,'
          + ' UPDATE, DELETE or CALL TRANSACTION anywhere.'],
      },
    },
  ],
};

// ── Sheet 3 · Inputs & Screens ─────────────────────────────────────
// Anchors are fixed by the pipeline: the selection mockup at C4, the grid at
// C19. Everything else is laid out around them — the selection image gets rows
// 4-17, its caption sits at row 18, and the grid band runs 19-31.
const PARAMETERS = [
  ['S_VKORG', 'SELECT-OPTIONS VBAK-VKORG', 'Yes', '—',
    'Sales organisation. At least one value or range must be entered.'],
  ['S_VTWEG', 'SELECT-OPTIONS VBAK-VTWEG', 'No', '—',
    'Distribution channel. Left empty it covers every channel of the sales organisation.'],
  ['S_SPART', 'SELECT-OPTIONS VBAK-SPART', 'No', '—',
    'Division. Left empty it covers every division.'],
  ['S_AUDAT', 'SELECT-OPTIONS VBAK-AUDAT', 'Yes', 'Current month',
    'Document date range, defaulted to the first and last day of the current month.'],
  ['S_VBELN', 'SELECT-OPTIONS VBAK-VBELN', 'No', '—',
    'One sales document or a range, for narrowing the list down to a reported case.'],
];

const REVIEW_NOTES = [
  'The authority check runs over the selection values, not over the rows read, so a document'
  + ' reachable through a permitted sales organisation is never re-checked.',
  'The document date range has no upper bound, so an open-ended entry reads the whole header table.',
  'Status filtering happens in ABAP after the join; moving it into the WHERE clause would cut'
  + ' the transferred rows.',
  'The field catalogue is built by hand, so a structure change in VBAP surfaces only at runtime.',
  'Background variants reuse the dialog selection screen, and a variant saved with an empty date'
  + ' range inherits no default.',
];

/** Row height that spreads a rendered image over a fixed band of rows. */
const bandRowHeight = (pngHeight, rowCount) =>
  Math.max(DEFAULT_ROW_PT, Math.ceil((pngHeight * PT_PER_PX / rowCount) * 100) / 100);

function buildSheet3(images) {
  const selectionBand = bandRowHeight(images.selection.height, 14); // rows 4-17
  const gridBand = bandRowHeight(images.alv.height, 13);            // rows 19-31
  const band = (from, to, h) => {
    const rows = [];
    for (let at = from; at <= to; at++) rows.push({ at, h, cells: {} });
    return rows;
  };

  return {
    tab: 'Inputs & Screens',
    cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 16], [4, 4, 26], [5, 5, 10], [6, 6, 16], [7, 7, 58]],
    rows: [
      ...heading('Inputs & Screens', 'The selection screen as the user meets it, and the list it produces.', 'G'),
      ...band(4, 17, selectionBand),
      {
        at: 18,
        h: 20,
        merge: ['B18:G18'],
        cells: { B: ['caption', 'List output. Column order, width and alignment follow the ALV field catalogue.'] },
      },
      ...band(19, 31, gridBand),
      section(33, 'Selection Parameters', 'G'),
      ...table({
        at: 34,
        cols: ['C', 'D', 'E', 'F', 'G'],
        header: ['Field', 'Type', 'Required', 'Default', 'Description'],
        headerStyles: ['th', 'th', 'thCenter', 'th', 'th'],
        styles: ['identKey', 'ident', 'center', 'text', 'text'],
        body: PARAMETERS,
        rowHeight: 30,
      }),
      section(41, 'Review Notes', 'G'),
      ...notes(42, REVIEW_NOTES, 'G'),
    ],
  };
}

// ── Sheet 4 · Processing Logic ─────────────────────────────────────
// 12 step slots occupy rows 6-17 so that the process-flow heading lands on B18
// and the injected chart opens at B19, which is where image-swap puts it.
const STEPS = [
  ['1', 'INITIALIZATION', 'F_SET_DEFAULTS',
    'Preset the document date range to the current month and load the user default layout.'],
  ['2', 'AT SELECTION-SCREEN OUTPUT', 'F_MODIFY_SCREEN',
    'Hide the layout field when the program runs from a background variant.'],
  ['3', 'AT SELECTION-SCREEN', 'F_CHECK_INPUT',
    'Reject an empty sales organisation and a date range longer than 365 days.'],
  ['4', 'AT SELECTION-SCREEN ON VALUE-REQUEST', 'F_F4_LAYOUT',
    'Offer the layouts saved for the current user as F4 help.'],
  ['5', 'START-OF-SELECTION', 'F_AUTHORITY_CHECK',
    'Check V_VBAK_VKO activity 03 for each sales organisation in the selection.'],
  ['6', 'START-OF-SELECTION', 'F_READ_ORDERS',
    'Read header, item and status in one join into the internal table GT_ORDER.'],
  ['7', 'START-OF-SELECTION', 'F_READ_CUSTOMER',
    'Read the sold-to party names for the collected customer numbers in one pass.'],
  ['8', 'START-OF-SELECTION', 'F_FILTER_OPEN',
    'Drop the items whose overall delivery status is complete.'],
  ['9', 'START-OF-SELECTION', 'F_CALC_TOTALS',
    'Total the net value per sales document and carry it on the first item of each.'],
  ['10', 'END-OF-SELECTION', 'F_BUILD_CATALOG',
    'Build the field catalogue: labels, widths, alignment and the hidden technical columns.'],
  ['11', 'END-OF-SELECTION', 'F_DISPLAY_ALV',
    'Display the grid, register the double-click handler and enable the spreadsheet export.'],
  ['12', 'END-OF-SELECTION', 'F_HANDLE_EMPTY',
    'When no item survives the filter, issue an information message and end without a grid.'],
];

const sheet4 = {
  tab: 'Processing Logic',
  cols: [[1, 1, 2.5], [2, 2, 5], [3, 3, 34], [4, 4, 22], [5, 5, 66]],
  rows: [
    ...heading('Processing Logic', 'Event blocks and routines in the order they run.', 'E'),
    ...table({
      at: 5,
      cols: ['B', 'C', 'D', 'E'],
      header: ['#', 'Event', 'Routine', 'Step'],
      headerStyles: ['thCenter', 'th', 'th', 'th'],
      styles: ['identCenter', 'ident', 'identKey', 'text'],
      body: STEPS,
      rowHeight: 26,
    }),
    {
      at: 18,
      h: 26,
      merge: ['B18:E18'],
      cells: { B: ['chartHeading', 'Process Flow Chart'] },
    },
  ],
};

// ── Sheet 5 · Output ───────────────────────────────────────────────
// 10 column slots, matching the field catalogue the ALV mockup shows.
const OUTPUT_COLUMNS = [
  ['1', 'VBELN', 'Sales document number, hotspot to the display transaction', '10', 'No', 'No'],
  ['2', 'POSNR', 'Item number', '6', 'No', 'No'],
  ['3', 'MATNR', 'Material number', '18', 'No', 'No'],
  ['4', 'MAKTX', 'Material description in the logon language', '40', 'No', 'No'],
  ['5', 'KWMENG', 'Order quantity, right-aligned', '13', 'No', 'No'],
  ['6', 'VRKME', 'Sales unit', '3', 'No', 'No'],
  ['7', 'NETWR', 'Net value of the item, right-aligned', '15', 'No', 'No'],
  ['8', 'WAERK', 'Document currency', '5', 'No', 'No'],
  ['9', 'KUNNR', 'Sold-to party, kept for the drill-down', '10', 'No', 'Yes'],
  ['10', 'NAME1', 'Sold-to party name', '35', 'No', 'No'],
];

const sheet5 = {
  tab: 'Output',
  cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 8], [4, 4, 14], [5, 5, 56], [6, 6, 10], [7, 7, 10], [8, 8, 10]],
  rows: [
    ...heading('Output', 'The ALV field catalogue, in display order.', 'H'),
    ...table({
      at: 5,
      cols: ['C', 'D', 'E', 'F', 'G', 'H'],
      header: ['Order', 'Field', 'Description', 'Length', 'Edit', 'Hidden'],
      headerStyles: ['thCenter', 'th', 'th', 'thCenter', 'thCenter', 'thCenter'],
      styles: ['identCenter', 'identKey', 'text', 'center', 'center', 'center'],
      body: OUTPUT_COLUMNS,
    }),
  ],
};

// ── Sheet 6 · Authorizations ───────────────────────────────────────
// 5 rows, and the gaps are rows too: a check the program does not make is the
// part of an authorisation review a reader most needs written down.
const AUTHORIZATIONS = [
  ['Transaction start', 'S_TCODE', 'Transaction', 'Yes',
    'Implicit at ZMM01. A background job scheduled through SM36 does not pass it.'],
  ['Sales organisation', 'V_VBAK_VKO', 'Row', 'Yes',
    'AUTHORITY-CHECK with activity 03 for every sales organisation entered in S_VKORG.'],
  ['Distribution channel', 'V_VBAK_VKO', 'Row', 'No',
    'GAP. The channel field of the same object is never filled, so any channel of a permitted'
    + ' sales organisation can be read.'],
  ['Table display', 'S_TABU_DIS', 'Table', 'No',
    'GAP. Not required by the report itself, but the spreadsheet export hands the same rows to'
    + ' the desktop.'],
  ['Layout maintenance', 'S_ALV_LAYO', 'Function', 'No',
    'GAP. Every user can save a global layout because the check is left out.'],
];

const sheet6 = {
  tab: 'Authorizations',
  cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 24], [4, 4, 16], [5, 5, 14], [6, 6, 14], [7, 7, 58]],
  rows: [
    ...heading('Authorizations', 'The checks the program performs, and the gaps the review found.', 'G'),
    ...table({
      at: 5,
      cols: ['C', 'D', 'E', 'F', 'G'],
      header: ['Check', 'Object', 'Level', 'Implemented?', 'Notes'],
      headerStyles: ['th', 'th', 'thCenter', 'thCenter', 'th'],
      styles: ['label', 'identKey', 'center', 'center', 'text'],
      body: AUTHORIZATIONS,
      rowHeight: 30,
    }),
  ],
};

// ── Sheet 7 · Exceptions ───────────────────────────────────────────
// 3 rows: what goes wrong, how the program answers, and what the user does next.
const EXCEPTIONS = [
  ['Selection returns no item', 'Information message, then leave the program',
    'ZMM 015  No open item for the selected range',
    'Widen the document date range, or check whether the documents are already fully delivered.'],
  ['No authorisation for a sales organisation', 'Error message on the selection screen, focus stays on the field',
    'ZMM 021  No display authorisation for sales organisation &1',
    'Request V_VBAK_VKO activity 03 for that sales organisation, or drop it from the selection.'],
  ['Document date range longer than 365 days', 'Error message on the selection screen',
    'ZMM 007  Document date range may not exceed 365 days',
    'Split the run into shorter ranges, or schedule it as a background job.'],
];

const sheet7 = {
  tab: 'Exceptions',
  cols: [[1, 1, 2.5], [2, 2, 3.5], [3, 3, 30], [4, 4, 30], [5, 5, 34], [6, 6, 50]],
  rows: [
    ...heading('Exceptions', 'Error situations, how the program reacts, and the way out.', 'F'),
    ...table({
      at: 5,
      cols: ['C', 'D', 'E', 'F'],
      header: ['Trigger', 'Mechanism', 'Message', 'Recovery'],
      styles: ['label', 'text', 'ident', 'text'],
      body: EXCEPTIONS,
      rowHeight: 36,
    }),
  ],
};

// ══════════════════════════════════════════════════════════════════
// 3. Mockup images — rendered here, not stored here
// ══════════════════════════════════════════════════════════════════
// The reference spec's own screen and list. Its parameters are the five the
// Sheet 3 table documents and its columns the first of Sheet 5's catalogue, so
// the imagery and the tables tell one story. Every real run replaces both
// pictures anyway; these are what a reader sees if the render degrades.

const REFERENCE_IMAGE_SPEC = {
  lang: 'en',
  selection: {
    blockLabel: 'Selection criteria',
    fields: [
      { name: 'S_VKORG', label: 'Sales organisation', required: true, range: true },
      { name: 'S_VTWEG', label: 'Distribution channel', range: true },
      { name: 'S_SPART', label: 'Division', range: true },
      { name: 'S_AUDAT', label: 'Document date', required: true, range: true, note: 'Defaults to the current month' },
      { name: 'S_VBELN', label: 'Sales document', range: true },
    ],
    optionFields: [],
  },
  alv: {
    columns: [
      { name: 'VBELN', header: 'Sales doc.', width: 120, hotspot: true },
      { name: 'POSNR', header: 'Item', width: 70 },
      { name: 'MATNR', header: 'Material', width: 150 },
      { name: 'KWMENG', header: 'Order qty', width: 110, align: 'end' },
      { name: 'VRKME', header: 'Unit', width: 70 },
      { name: 'NETWR', header: 'Net value', width: 130, align: 'end' },
      { name: 'WAERK', header: 'Curr.', width: 80 },
    ],
    sampleRows: [
      { VBELN: '0000004711', POSNR: '000010', MATNR: 'FERT-100', KWMENG: '120.000', VRKME: 'EA', NETWR: '1,440.00', WAERK: 'EUR' },
      { VBELN: '0000004711', POSNR: '000020', MATNR: 'HALB-220', KWMENG: '48.000', VRKME: 'EA', NETWR: '612.50', WAERK: 'EUR' },
      { VBELN: '0000004712', POSNR: '000010', MATNR: 'ROH-905', KWMENG: '1,000.000', VRKME: 'KG', NETWR: '2,875.00', WAERK: 'EUR' },
    ],
    maxRows: 3,
  },
};

async function renderMockups() {
  const rendered = await renderScreenImages(REFERENCE_IMAGE_SPEC);
  for (const slot of ['selection', 'alv']) {
    if (!rendered[slot]) {
      throw new Error(
        `gen-template-base: the ${slot} mockup did not render. The template's picture slots`
        + ' cannot be left empty, so this needs a headless Chrome or Edge on the machine that'
        + ' builds the asset (see findBrowser in screen-image-renderer.mjs).',
      );
    }
  }
  return rendered;
}

// ══════════════════════════════════════════════════════════════════
// 4. Serialization — content model to OOXML parts
// ══════════════════════════════════════════════════════════════════

/**
 * Interns cell texts in first-use order, which is what keeps output stable.
 * `refOf` is called once per text cell, so it also counts the references the
 * `count` attribute has to report.
 */
function createStringTable() {
  const index = new Map();
  const order = [];
  let references = 0;
  return {
    refOf(text) {
      references += 1;
      if (!index.has(text)) {
        index.set(text, order.length);
        order.push(text);
      }
      return index.get(text);
    },
    xml() {
      const items = order.map((text) => `<si><t>${esc(text)}</t></si>`).join('');
      return XML_DECL
        + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        + ` count="${references}" uniqueCount="${order.length}">${items}</sst>`;
    },
  };
}

const SHEET_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const colIndex = (letter) => letter.charCodeAt(0) - 64;

function worksheetXml(sheet, index, strings) {
  const widest = Math.max(...sheet.cols.map(([, max]) => max));
  const lastRow = Math.max(...sheet.rows.map((row) => row.at));
  const lastCol = String.fromCharCode(64 + widest);

  const cols = sheet.cols
    .map(([min, max, width]) => `<col min="${min}" max="${max}" width="${width}" customWidth="1"/>`)
    .join('');

  const rows = sheet.rows
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((row) => {
      const cells = Object.entries(row.cells)
        .sort(([a], [b]) => colIndex(a) - colIndex(b))
        .map(([col, [styleName, text]]) => {
          const ref = `${col}${row.at}`;
          const s = STYLE[styleName];
          if (text == null) return `<c r="${ref}" s="${s}"/>`;
          return `<c r="${ref}" s="${s}" t="s"><v>${strings.refOf(text)}</v></c>`;
        })
        .join('');
      const height = row.h ? ` ht="${row.h}" customHeight="1"` : '';
      return `<row r="${row.at}"${height}>${cells}</row>`;
    })
    .join('');

  const merges = sheet.rows.flatMap((row) => row.merge || []);
  const mergeCells = merges.length
    ? `<mergeCells count="${merges.length}">${
      merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';

  // Element order follows CT_Worksheet: sheetPr, dimension, sheetViews,
  // sheetFormatPr, cols, sheetData, mergeCells, pageMargins, pageSetup, drawing.
  return XML_DECL
    + `<worksheet ${SHEET_NS}>`
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<dimension ref="A1:${lastCol}${lastRow}"/>`
    + `<sheetViews><sheetView showGridLines="0"${index === 0 ? ' tabSelected="1"' : ''} workbookViewId="0"/></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="${DEFAULT_ROW_PT}"/>`
    + `<cols>${cols}</cols>`
    + `<sheetData>${rows}</sheetData>`
    + mergeCells
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>'
    + '<drawing r:id="rId1"/>'
    + '</worksheet>';
}

const DRAWING_NS = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
  + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
  + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** The empty drawing a sheet without a picture carries — and Sheet 4's stub. */
const drawingStubXml = () => `${XML_DECL}<xdr:wsDr ${DRAWING_NS}/>`;

/**
 * One picture pinned to a cell and sized to its own pixels.
 *
 * The shapes here are load-bearing: image-swap finds a picture by scanning for
 * a bare `<xdr:oneCellAnchor>` block containing `name="<part>"`, and rewrites
 * the `<xdr:ext cx=".." cy=".."/>` inside it. Keep both spellings literal.
 */
function pictureAnchor({ id, part, rel, col, row, width, height }) {
  return '<xdr:oneCellAnchor>'
    + `<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff>`
    + `<xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:ext cx="${width * EMU_PER_PX}" cy="${height * EMU_PER_PX}"/>`
    + `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${part}"/>`
    + '<xdr:cNvPicPr preferRelativeResize="0"/></xdr:nvPicPr>'
    + `<xdr:blipFill><a:blip cstate="print" r:embed="${rel}"/>`
    + '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
    + '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr>'
    + '</xdr:pic><xdr:clientData fLocksWithSheet="0"/></xdr:oneCellAnchor>';
}

// Sheet 3's drawing. Anchor coordinates are zero-based, so C4 is col 2 / row 3
// and C19 is col 2 / row 18.
function drawing3Xml(images) {
  return `${XML_DECL}<xdr:wsDr ${DRAWING_NS}>`
    + pictureAnchor({
      id: 1, part: 'image2.png', rel: 'rId2', col: 2, row: 3,
      width: images.selection.width, height: images.selection.height,
    })
    + pictureAnchor({
      id: 2, part: 'image1.png', rel: 'rId1', col: 2, row: 18,
      width: images.alv.width, height: images.alv.height,
    })
    + '</xdr:wsDr>';
}

const relationships = (items) => XML_DECL
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + items.map(({ id, type, target }) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${
      type}" Target="${target}"/>`).join('')
  + '</Relationships>';

function workbookXml(sheets) {
  const entries = sheets
    .map((sheet, index) =>
      `<sheet name="${esc(sheet.tab)}" sheetId="${index + 1}" r:id="rId${index + 4}"/>`)
    .join('');
  return XML_DECL
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<workbookPr/>'
    + '<bookViews><workbookView activeTab="0"/></bookViews>'
    + `<sheets>${entries}</sheets>`
    + '</workbook>';
}

function contentTypesXml(sheets) {
  const override = (part, type) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const ml = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  return XML_DECL
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + override('/xl/workbook.xml', `${ml}.sheet.main+xml`)
    + override('/xl/styles.xml', `${ml}.styles+xml`)
    + override('/xl/sharedStrings.xml', `${ml}.sharedStrings+xml`)
    + sheets.map((_, i) => override(`/xl/worksheets/sheet${i + 1}.xml`, `${ml}.worksheet+xml`)).join('')
    + sheets.map((_, i) => override(`/xl/drawings/drawing${i + 1}.xml`,
      'application/vnd.openxmlformats-officedocument.drawing+xml')).join('')
    + '</Types>';
}

// ══════════════════════════════════════════════════════════════════
// 5. Assembly
// ══════════════════════════════════════════════════════════════════

export async function buildTemplateBase({ outPath = DEFAULT_OUT, verbose = true } = {}) {
  const images = await renderMockups();
  const sheets = [sheet1, sheet2, buildSheet3(images), sheet4, sheet5, sheet6, sheet7];

  // sharedStrings has to be serialized after the worksheets that intern into it.
  const strings = createStringTable();
  const worksheets = sheets.map((sheet, index) => worksheetXml(sheet, index, strings));

  const text = (name, xml) => ({ name, data: Buffer.from(xml, 'utf8') });
  const entries = [
    text('[Content_Types].xml', contentTypesXml(sheets)),
    text('_rels/.rels', relationships([
      { id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' },
    ])),
    text('xl/workbook.xml', workbookXml(sheets)),
    text('xl/_rels/workbook.xml.rels', relationships([
      { id: 'rId1', type: 'styles', target: 'styles.xml' },
      { id: 'rId2', type: 'sharedStrings', target: 'sharedStrings.xml' },
      ...sheets.map((_, i) => ({
        id: `rId${i + 4}`, type: 'worksheet', target: `worksheets/sheet${i + 1}.xml`,
      })),
    ])),
    text('xl/styles.xml', stylesXml()),
    ...worksheets.map((xml, i) => text(`xl/worksheets/sheet${i + 1}.xml`, xml)),
    ...sheets.map((_, i) => text(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, relationships([
      { id: 'rId1', type: 'drawing', target: `../drawings/drawing${i + 1}.xml` },
    ]))),
    // drawing3 carries the two Sheet-3 pictures; the rest are stubs, and
    // drawing4's emptiness is what image-swap's process-flow injection needs.
    ...sheets.map((_, i) => text(`xl/drawings/drawing${i + 1}.xml`,
      i === 2 ? drawing3Xml(images) : drawingStubXml())),
    text('xl/drawings/_rels/drawing3.xml.rels', relationships([
      { id: 'rId1', type: 'image', target: '../media/image1.png' },
      { id: 'rId2', type: 'image', target: '../media/image2.png' },
    ])),
    { name: 'xl/media/image1.png', data: images.alv.pngBuffer },
    { name: 'xl/media/image2.png', data: images.selection.pngBuffer },
    text('xl/sharedStrings.xml', strings.xml()),
  ];

  const workbook = zipFiles(entries);
  writeFileSync(outPath, workbook);

  if (verbose) {
    console.log(`gen-template-base: wrote ${outPath} (${workbook.length} bytes, ${entries.length} parts)`);
    console.log(`gen-template-base: sheets ${sheets.map((sheet) => sheet.tab).join(' · ')}`);
    console.log(`gen-template-base: image1.png=alv ${images.alv.width}x${images.alv.height}`
      + ` · image2.png=selection ${images.selection.width}x${images.selection.height}`);
  }
  return { outPath, bytes: workbook.length, parts: entries.length };
}

// CLI. argv[1] runs through resolve() first so the Windows drive-letter and
// back-slash spellings of this file still match its own URL.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outArg] = process.argv.slice(2);
  try {
    await buildTemplateBase({ outPath: outArg ? resolve(outArg) : DEFAULT_OUT });
  } catch (error) {
    console.error(`gen-template-base: ${error.message}`);
    process.exit(1);
  }
}
