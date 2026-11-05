// sapkit:program-to-spec — renders a spec workbook as one HTML file with the
// same layout as Excel shows it.
//
// WHY
//   The Excel spec is the document of record, but a reader often wants to pass
//   on ONE file that opens anywhere. This makes a read-only copy: one tab per
//   sheet, the same grid, the same pictures in the same places. It is
//   regenerated from the workbook, never edited (html-page.mjs puts that on
//   every page's footer).
//
// WHAT "SAME AS EXCEL" MEANS HERE — each rule below was checked against
// Excel's own rendering of template_base.xlsx (Range.CopyPicture, 2026-11-05)
//   · Tabs: the sheet names in xl/workbook.xml as they are. template-clone only
//     rewrites sharedStrings, so the Excel tabs keep the template's names and
//     the HTML must too. Hidden sheets get no tab, as in Excel.
//   · Column widths: the ECMA-376 conversion for a 7 px maximum digit width,
//     px = trunc((256·w + trunc(128/7)) / 256 · 7). Measured: template columns
//     A+B (2.5 + 3.5) come out at 41 px and C+D (26 + 78) at 728 px, exactly
//     what Excel draws. Row heights: pt × 4/3, rounded per row.
//   · Merged cells: value and fill come from the top-left cell, but every edge
//     of the merged area takes the border of the cell underneath that stretch
//     of edge. That is why the template's title underline sits under column B
//     only — Excel draws it that way too, and a copy that "fixed" it would no
//     longer be the same document.
//   · Gridlines: none where the sheet says showGridLines="0" (all seven
//     template sheets); only cell borders show.
//   · Values are shown as stored — no number formats. Text that does not wrap
//     spills into an empty right neighbour and is clipped otherwise; wrapped
//     text is clipped at the row height. Both as in Excel.
//   · Pictures: placed from their drawing anchors at native size (EMU ÷ 9525)
//     and laid over the grid. Parts are found through the rels chain
//     (workbook → sheet → drawing → media), never by guessing names.
//   · Colours are Excel's, so there is no dark-mode restyling.
//
// BEST EFFORT
//   A workbook exactly as sapkit made it is reproduced exactly. A file someone
//   re-saved in Excel is reproduced as far as this reader understands it:
//   theme and indexed colours map onto Office's default palettes, and anything
//   unreadable (pattern and gradient fills, rich-text runs, shapes, charts,
//   grouped or non-raster pictures, row/column default styles) falls back to
//   the default look instead of failing the run. Only "not a zip" and "no
//   xl/workbook.xml" are failures.
//
// CLI
//   node xlsx-to-html.mjs <in.xlsx> <out.html> [--lang <ko|en|ja>] [--open]
//   The shared flow (exit codes, WROTE/OPENED lines, atomic write) is
//   html-page.mjs's runCli. node built-ins only.

import { readFileSync } from 'node:fs';
import { basename, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries } from './xlsx-zip.mjs';
import { escapeHtml, frameStrings, imageDataUri, renderPage, runCli } from './html-page.mjs';

const TOOL = 'xlsx-to-html';
const USAGE = 'Usage: node xlsx-to-html.mjs <in.xlsx> <out.html> [--lang <ko|en|ja>] [--open]';

const EMU_PER_PX = 9525;
const MAX_DIGIT_PX = 7;          // Calibri's digit width at 96 DPI — Excel's column unit
const DEFAULT_ROW_PT = 15;
const DEFAULT_BASE_COL_WIDTH = 8;
const GRIDLINE = '1px solid #D9D9D9';

// =============================================================
// A small XML reader
// =============================================================
// Enough XML for OOXML parts: elements, attributes, text, CDATA. Namespace
// prefixes are dropped from element and attribute names, so a part written
// with other prefixes (or none) reads the same. Comments, processing
// instructions and doctypes are skipped.

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/[^>]*>|<([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|[^<]+/g;
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NAMED_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body] ?? whole;
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const localName = (qualified) => qualified.slice(qualified.indexOf(':') + 1);

function parseXml(text) {
  const root = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const top = stack[stack.length - 1];
    if (token[0] !== '<') top.text += decodeEntities(token);
    else if (match[1] !== undefined) top.text += match[1];
    else if (token[1] === '/') { if (stack.length > 1) stack.pop(); }
    else if (match[2] !== undefined) {
      const element = { name: localName(match[2]), attrs: readAttributes(match[3]), children: [], text: '' };
      top.children.push(element);
      if (!match[4]) stack.push(element);
    }
  }
  return root;
}

// An unprefixed attribute wins over a prefixed one with the same local name.
function readAttributes(source) {
  const attrs = {};
  for (const [, name, double, single] of source.matchAll(ATTRIBUTE)) {
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    const key = localName(name);
    if (!(key in attrs) || !name.includes(':')) attrs[key] = decodeEntities(double ?? single);
  }
  return attrs;
}

const kids = (element, name) => (element ? element.children.filter((c) => c.name === name) : []);
const kid = (element, name) => (element ? element.children.find((c) => c.name === name) : undefined);

function descendants(element, name, found = []) {
  for (const child of element?.children ?? []) {
    if (child.name === name) found.push(child);
    descendants(child, name, found);
  }
  return found;
}

// Cell text: every <t> under the element except phonetic guides (<rPh>).
function textOf(element) {
  if (!element) return '';
  if (element.name === 't') return element.text;
  if (element.name === 'rPh') return '';
  return element.children.map(textOf).join('');
}

const number = (value, fallback) => {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback;
};
const isTrue = (value) => value !== undefined && value !== '0' && value !== 'false';

// =============================================================
// Package parts and the rels chain
// =============================================================

function relsPathOf(part) {
  const dir = posix.dirname(part);
  return `${dir === '.' ? '' : `${dir}/`}_rels/${posix.basename(part)}.rels`;
}

/** Relationship Id → resolved part name, for the part's own .rels file. */
function readRels(parts, part) {
  const map = new Map();
  const xml = parts.get(relsPathOf(part));
  if (!xml) return map;
  for (const rel of descendants(parseXml(xml.toString('utf8')), 'Relationship')) {
    if (rel.attrs.TargetMode === 'External' || !rel.attrs.Target) continue;
    const target = rel.attrs.Target;
    const resolved = target.startsWith('/')
      ? target.slice(1)
      : posix.normalize(posix.join(posix.dirname(part), target));
    map.set(rel.attrs.Id, resolved);
  }
  return map;
}

function openWorkbook(buffer, sourceName) {
  let entries;
  try {
    entries = unzipEntries(buffer);
  } catch {
    throw new Error(`${sourceName} is not an xlsx workbook (not a zip archive)`);
  }
  const parts = new Map(entries.map((entry) => [entry.name, entry.data]));
  if (!parts.has('xl/workbook.xml')) {
    throw new Error(`${sourceName} is not an xlsx workbook (no xl/workbook.xml)`);
  }
  return parts;
}

// =============================================================
// Colours
// =============================================================
// Literal rgb is exact. theme/indexed map onto Office's default palettes,
// since a re-saved file's own theme is not read (best effort).

const INDEXED = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '
  + '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '
  + '800000 008000 000080 808000 800080 008080 C0C0C0 808080 '
  + '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF '
  + '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF '
  + '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 '
  + '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 '
  + '003366 339966 003300 333300 993300 993366 333399 333333 '
  + '000000 FFFFFF').split(' '); // 64 = system foreground, 65 = system background

// Excel's theme index order: lt1, dk1, lt2, dk2, accent1-6, hlink, folHlink.
const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31',
  'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

/** A colour element → '#RRGGBB', or `fallback` when it says auto or nothing usable. */
function colorOf(element, fallback) {
  if (!element) return fallback;
  const { rgb, theme, indexed, tint } = element.attrs;
  let hex;
  if (rgb !== undefined && /^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(rgb)) hex = rgb.slice(-6);
  else if (theme !== undefined) hex = THEME[number(theme, -1)];
  else if (indexed !== undefined) hex = INDEXED[number(indexed, -1)];
  if (!hex) return fallback;
  return `#${applyTint(hex, number(tint, 0)).toUpperCase()}`;
}

// Excel tints move the HSL lightness toward black (< 0) or white (> 0).
function applyTint(hex, tint) {
  if (!tint) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2 + 2) % 2 - 1));
  const m = l - c / 2;
  const sector = Math.floor(((h % 6) + 6) % 6);
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// =============================================================
// Styles
// =============================================================

const BORDER_CSS = {
  hair: [1, '1px solid'], thin: [2, '1px solid'], dotted: [2, '1px dotted'],
  dashed: [2, '1px dashed'], dashDot: [2, '1px dashed'], dashDotDot: [2, '1px dotted'],
  medium: [4, '2px solid'], mediumDashed: [4, '2px dashed'], mediumDashDot: [4, '2px dashed'],
  mediumDashDotDot: [4, '2px dashed'], slantDashDot: [4, '2px dashed'],
  double: [5, '3px double'], thick: [6, '3px solid'],
};

function readFont(element) {
  const flag = (name) => kid(element, name) !== undefined && isTrue(kid(element, name).attrs.val ?? '1');
  const underline = kid(element, 'u');
  return {
    size: number(kid(element, 'sz')?.attrs.val, 11),
    name: kid(element, 'name')?.attrs.val ?? 'Calibri',
    bold: flag('b'),
    italic: flag('i'),
    strike: flag('strike'),
    underline: underline !== undefined && underline.attrs.val !== 'none',
    color: colorOf(kid(element, 'color'), '#000000'),
  };
}

// Only solid pattern fills are drawn; other patterns and gradients read as none.
function readFill(element) {
  const pattern = kid(element, 'patternFill');
  if (pattern?.attrs.patternType !== 'solid') return null;
  return colorOf(kid(pattern, 'fgColor'), null);
}

function readBorder(element) {
  const side = (name) => {
    const edge = kid(element, name);
    const css = edge && BORDER_CSS[edge.attrs.style];
    return css ? { weight: css[0], css: `${css[1]} ${colorOf(kid(edge, 'color'), '#000000')}` } : null;
  };
  return { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') };
}

function readStyles(parts) {
  const xml = parts.get('xl/styles.xml');
  const root = xml ? parseXml(xml.toString('utf8')) : null;
  const sheet = root && kid(root, 'styleSheet');
  const fonts = kids(kid(sheet, 'fonts'), 'font').map(readFont);
  const fills = kids(kid(sheet, 'fills'), 'fill').map(readFill);
  const borders = kids(kid(sheet, 'borders'), 'border').map(readBorder);
  const defaultFont = fonts[0] ?? readFont(undefined);
  const xfs = kids(kid(sheet, 'cellXfs'), 'xf').map((xf) => {
    const align = kid(xf, 'alignment')?.attrs ?? {};
    return {
      font: fonts[number(xf.attrs.fontId, 0)] ?? defaultFont,
      fill: fills[number(xf.attrs.fillId, 0)] ?? null,
      border: borders[number(xf.attrs.borderId, 0)] ?? null,
      horizontal: align.horizontal ?? 'general',
      vertical: align.vertical ?? 'bottom',
      wrap: isTrue(align.wrapText),
      indent: number(align.indent, 0),
    };
  });
  if (!xfs.length) {
    xfs.push({ font: defaultFont, fill: null, border: null, horizontal: 'general', vertical: 'bottom', wrap: false, indent: 0 });
  }
  return xfs;
}

// Font names land inside a CSS string, so anything that could close it goes.
const fontStack = (name) => {
  const safe = String(name).replace(/[\u0000-\u001f"'\\<>;{}]/g, '').trim() || 'Calibri';
  return `"${safe}",${/consolas|courier|mono/i.test(safe) ? 'monospace' : 'sans-serif'}`;
};

const H_ALIGN = { left: 'left', right: 'right', center: 'center', centerContinuous: 'center', distributed: 'center', justify: 'justify', fill: 'left' };
const V_ALIGN = { top: 'flex-start', center: 'center', justify: 'center', distributed: 'center', bottom: 'flex-end' };

/** One class per cellXfs entry: font, fill, alignment, wrap. Borders are drawn separately. */
function styleCss(xfs) {
  return xfs.map((xf, index) => {
    const { font } = xf;
    const rules = [
      `font-family:${fontStack(font.name)}`,
      `font-size:${font.size}pt`,
      `color:${font.color}`,
    ];
    if (font.bold) rules.push('font-weight:700');
    if (font.italic) rules.push('font-style:italic');
    if (font.underline || font.strike) {
      rules.push(`text-decoration:${[font.underline && 'underline', font.strike && 'line-through'].filter(Boolean).join(' ')}`);
    }
    if (xf.fill) rules.push(`background:${xf.fill}`);
    if (H_ALIGN[xf.horizontal]) rules.push(`text-align:${H_ALIGN[xf.horizontal]}`);
    rules.push(`justify-content:${V_ALIGN[xf.vertical] ?? 'flex-end'}`);
    if (xf.wrap) rules.push('white-space:pre-wrap;overflow-wrap:anywhere');
    if (xf.indent > 0) rules.push(`padding-left:${2 + xf.indent * 9}px`);
    return `.x${index}{${rules.join(';')}}`;
  }).join('\n');
}

// =============================================================
// Worksheets
// =============================================================

function columnNumber(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRef(ref) {
  const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(ref ?? '').toUpperCase());
  return match ? { col: columnNumber(match[1]), row: Number(match[2]) } : null;
}

function readSharedStrings(parts) {
  const xml = parts.get('xl/sharedStrings.xml');
  if (!xml) return [];
  return kids(kid(parseXml(xml.toString('utf8')), 'sst'), 'si').map(textOf);
}

function cellValue(cell, strings) {
  const type = cell.attrs.t ?? 'n';
  if (type === 'inlineStr') return textOf(kid(cell, 'is'));
  const raw = kid(cell, 'v')?.text;
  if (raw === undefined) return '';
  if (type === 's') return strings[number(raw, -1)] ?? '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  return raw;
}

const colPxOf = (width) => Math.trunc(((256 * width + Math.trunc(128 / MAX_DIGIT_PX)) / 256) * MAX_DIGIT_PX);

function readWorksheet(xml, strings) {
  const document = parseXml(xml);
  const root = kid(document, 'worksheet') ?? kid(document, 'chartsheet');
  const format = kid(root, 'sheetFormatPr')?.attrs ?? {};
  const view = kid(kid(root, 'sheetViews'), 'sheetView');

  const defaultColPx = format.defaultColWidth !== undefined
    ? colPxOf(number(format.defaultColWidth, 8.43))
    : Math.ceil((number(format.baseColWidth, DEFAULT_BASE_COL_WIDTH) * MAX_DIGIT_PX + 5) / 8) * 8;
  const defaultRowPx = Math.round(number(format.defaultRowHeight, DEFAULT_ROW_PT) * 4 / 3);

  const colDefs = kids(kid(root, 'cols'), 'col').map((col) => ({
    min: number(col.attrs.min, 0),
    max: number(col.attrs.max, 0),
    px: isTrue(col.attrs.hidden) ? 0 : colPxOf(number(col.attrs.width, 0)),
  }));

  const rowPx = new Map();
  const cells = new Map();
  let lastRow = 0;
  let lastCol = 0;
  let rowNo = 0;
  for (const row of kids(kid(root, 'sheetData'), 'row')) {
    rowNo = number(row.attrs.r, rowNo + 1);
    if (isTrue(row.attrs.hidden)) rowPx.set(rowNo, 0);
    else if (row.attrs.ht !== undefined) rowPx.set(rowNo, Math.round(number(row.attrs.ht, DEFAULT_ROW_PT) * 4 / 3));
    lastRow = Math.max(lastRow, rowNo);
    let colNo = 0;
    for (const c of kids(row, 'c')) {
      colNo = parseRef(c.attrs.r)?.col ?? colNo + 1;
      cells.set(`${rowNo},${colNo}`, { style: number(c.attrs.s, 0), type: c.attrs.t ?? 'n', value: cellValue(c, strings) });
      lastCol = Math.max(lastCol, colNo);
    }
  }

  const merges = [];
  for (const merge of kids(kid(root, 'mergeCells'), 'mergeCell')) {
    const [from, to] = String(merge.attrs.ref ?? '').split(':').map(parseRef);
    if (!from) continue;
    const area = { r1: from.row, c1: from.col, r2: (to ?? from).row, c2: (to ?? from).col };
    merges.push(area);
    lastRow = Math.max(lastRow, area.r2);
    lastCol = Math.max(lastCol, area.c2);
  }

  return {
    cells,
    merges,
    lastRow,
    lastCol,
    gridlines: !(view && view.attrs.showGridLines !== undefined && !isTrue(view.attrs.showGridLines)),
    drawingRelId: kid(root, 'drawing')?.attrs.id,
    colPx: (c) => colDefs.find((d) => c >= d.min && c <= d.max)?.px ?? defaultColPx,
    rowPx: (r) => rowPx.get(r) ?? defaultRowPx,
  };
}

// =============================================================
// Pictures
// =============================================================

/** Pixel offset of the start of a 0-based column/row index, plus an EMU offset. */
function offsetPx(index, emu, sizeOf) {
  let px = 0;
  for (let i = 1; i <= index; i++) px += sizeOf(i);
  return px + number(emu, 0) / EMU_PER_PX;
}

function markerPx(marker, sheet) {
  if (!marker) return null;
  return {
    x: offsetPx(number(kid(marker, 'col')?.text, 0), kid(marker, 'colOff')?.text, sheet.colPx),
    y: offsetPx(number(kid(marker, 'row')?.text, 0), kid(marker, 'rowOff')?.text, sheet.rowPx),
  };
}

const extentPx = (ext) => ext && {
  w: number(ext.attrs.cx, 0) / EMU_PER_PX,
  h: number(ext.attrs.cy, 0) / EMU_PER_PX,
};

/** Where Excel puts the anchor's box: one/absolute anchors carry a size, two-cell anchors span from→to. */
function anchorBox(anchor, sheet) {
  if (anchor.name === 'absoluteAnchor') {
    const pos = kid(anchor, 'pos');
    const size = extentPx(kid(anchor, 'ext'));
    return pos && size && { x: number(pos.attrs.x, 0) / EMU_PER_PX, y: number(pos.attrs.y, 0) / EMU_PER_PX, ...size };
  }
  const from = markerPx(kid(anchor, 'from'), sheet);
  if (!from) return null;
  if (anchor.name === 'oneCellAnchor') {
    const size = extentPx(kid(anchor, 'ext'));
    return size && { ...from, ...size };
  }
  const to = markerPx(kid(anchor, 'to'), sheet);
  if (to) return { ...from, w: to.x - from.x, h: to.y - from.y };
  const size = extentPx(descendants(kid(anchor, 'pic'), 'ext')[0]);
  return size && { ...from, ...size };
}

function readPictures(parts, sheetPart, sheet) {
  const drawingPart = sheet.drawingRelId && readRels(parts, sheetPart).get(sheet.drawingRelId);
  const xml = drawingPart && parts.get(drawingPart);
  if (!xml) return [];
  const rels = readRels(parts, drawingPart);
  const wsDr = kid(parseXml(xml.toString('utf8')), 'wsDr');
  const pictures = [];
  for (const anchor of wsDr?.children ?? []) {
    if (!['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'].includes(anchor.name)) continue;
    const pic = kid(anchor, 'pic');
    const embed = descendants(pic, 'blip')[0]?.attrs.embed;
    const media = embed && parts.get(rels.get(embed));
    const uri = media && imageDataUri(media);
    const box = uri && anchorBox(anchor, sheet);
    if (!box || box.w <= 0 || box.h <= 0) continue;
    const nv = descendants(pic, 'cNvPr')[0]?.attrs ?? {};
    pictures.push({ ...box, uri, alt: nv.descr || nv.name || '' });
  }
  return pictures;
}

// =============================================================
// Sheet → HTML
// =============================================================

const area = (r1, c1, r2, c2) => `grid-area:${r1}/${c1}/${r2 + 1}/${c2 + 1}`;
const round = (px) => Math.round(px * 100) / 100;

function mergeIndex(merges) {
  const at = new Map();
  for (const merge of merges) {
    for (let r = merge.r1; r <= merge.r2; r++) {
      for (let c = merge.c1; c <= merge.c2; c++) at.set(`${r},${c}`, merge);
    }
  }
  return at;
}

/** Fills and values: one element per merged area (top-left cell) or per single cell. */
function cellElements(sheet, xfs, mergeAt) {
  const out = [];
  for (const [key, cell] of sheet.cells) {
    const [r, c] = key.split(',').map(Number);
    const merge = mergeAt.get(key);
    if (merge && (merge.r1 !== r || merge.c1 !== c)) continue;
    const xf = xfs[cell.style] ?? xfs[0];
    if (cell.value === '' && !xf.fill) continue;
    const classes = [`xc x${xfs[cell.style] ? cell.style : 0}`];
    if (cell.type === 'n' && cell.value !== '') classes.push('xn');
    if (cell.type === 'b' || cell.type === 'e') classes.push('xe');
    // Unmerged, unwrapped, left-flowing text spills into an empty right neighbour.
    const leftFlowing = xf.horizontal === 'left' || (xf.horizontal === 'general' && !classes.includes('xn') && !classes.includes('xe'));
    const neighbour = sheet.cells.get(`${r},${c + 1}`);
    if (!merge && !xf.wrap && leftFlowing && cell.value !== '' && !(neighbour && neighbour.value !== '')) {
      classes.push('xo');
    }
    const span = merge ?? { r1: r, c1: c, r2: r, c2: c };
    out.push({ r, c, html: `<div class="${classes.join(' ')}" style="${area(span.r1, span.c1, span.r2, span.c2)}">${escapeHtml(cell.value)}</div>` });
  }
  out.sort((a, b) => a.r - b.r || a.c - b.c);
  return out.map((e) => e.html);
}

/**
 * Borders, one edge at a time. Each edge belongs to the cell left of / above
 * it (the first row and column also own their outer edge) and is drawn once.
 * Edges inside a merged area are not drawn; the others take the borders of
 * the cells on either side — the heavier wins, the left/upper one on a tie.
 */
function borderElements(sheet, xfs, mergeAt) {
  const sideOf = (r, c, side) => {
    const cell = sheet.cells.get(`${r},${c}`);
    return cell ? (xfs[cell.style] ?? xfs[0]).border?.[side] ?? null : null;
  };
  const fillAt = (r, c) => {
    const merge = mergeAt.get(`${r},${c}`);
    const cell = merge ? sheet.cells.get(`${merge.r1},${merge.c1}`) : sheet.cells.get(`${r},${c}`);
    return cell ? (xfs[cell.style] ?? xfs[0]).fill : null;
  };
  const edge = (a, b, ra, ca, rb, cb) => {
    const merge = mergeAt.get(`${ra},${ca}`);
    if (merge && merge === mergeAt.get(`${rb},${cb}`)) return null;
    const chosen = !b || (a && a.weight >= b.weight) ? a : b;
    if (chosen) return chosen.css;
    if (sheet.gridlines && !fillAt(ra, ca) && !fillAt(rb, cb)) return GRIDLINE;
    return null;
  };

  const owned = new Map();
  const own = (r, c, side, css) => {
    if (!css) return;
    const key = `${r},${c}`;
    if (!owned.has(key)) owned.set(key, { r, c, sides: [] });
    owned.get(key).sides.push(`border-${side}:${css}`);
  };
  for (let r = 1; r <= sheet.lastRow; r++) {
    for (let c = 0; c <= sheet.lastCol; c++) {
      const css = edge(c > 0 ? sideOf(r, c, 'right') : null, c < sheet.lastCol ? sideOf(r, c + 1, 'left') : null, r, c, r, c + 1);
      if (c > 0) own(r, c, 'right', css);
      else own(r, 1, 'left', css);
    }
  }
  for (let r = 0; r <= sheet.lastRow; r++) {
    for (let c = 1; c <= sheet.lastCol; c++) {
      const css = edge(r > 0 ? sideOf(r, c, 'bottom') : null, r < sheet.lastRow ? sideOf(r + 1, c, 'top') : null, r, c, r + 1, c);
      if (r > 0) own(r, c, 'bottom', css);
      else own(1, c, 'top', css);
    }
  }
  return [...owned.values()]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map(({ r, c, sides }) => `<div class="xb" style="${area(r, c, r, c)};${sides.join(';')}"></div>`);
}

function renderSheet(sheet, pictures, xfs) {
  const mergeAt = mergeIndex(sheet.merges);
  const cols = [];
  for (let c = 1; c <= sheet.lastCol; c++) cols.push(`${sheet.colPx(c)}px`);
  const rows = [];
  for (let r = 1; r <= sheet.lastRow; r++) rows.push(`${sheet.rowPx(r)}px`);
  const gridW = cols.reduce((sum, w) => sum + parseFloat(w), 0);
  const gridH = rows.reduce((sum, h) => sum + parseFloat(h), 0);
  const width = Math.ceil(Math.max(gridW, ...pictures.map((p) => p.x + p.w)));
  const height = Math.ceil(Math.max(gridH, ...pictures.map((p) => p.y + p.h)));

  const images = pictures.map((p) => `<img class="xi" src="${p.uri}" alt="${escapeHtml(p.alt)}" `
    + `style="left:${round(p.x)}px;top:${round(p.y)}px;width:${round(p.w)}px;height:${round(p.h)}px">`);
  return `<div class="xl-sheet" style="width:${width}px;height:${height}px;`
    + `grid-template-columns:${cols.join(' ') || 'none'};grid-template-rows:${rows.join(' ') || 'none'}">\n`
    + [...cellElements(sheet, xfs, mergeAt), ...borderElements(sheet, xfs, mergeAt), ...images].join('\n')
    + '\n</div>';
}

// =============================================================
// Page
// =============================================================

const CSS = `
:root{color-scheme:light}
body{background:#fff;color:#000}
.xl-tabs{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:2px;padding:6px 8px 0;background:#f3f3f3;border-bottom:1px solid #c6c6c6;font:13px/1.4 system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.xl-tab{margin:0 0 -1px;padding:5px 14px;border:1px solid #c6c6c6;border-radius:3px 3px 0 0;background:#e9e9e9;color:#333;font:inherit;cursor:pointer}
.xl-tab[aria-selected="true"]{background:#fff;border-bottom-color:#fff;color:#107c41;font-weight:600}
.xl-tab:focus-visible{outline:2px solid #107c41;outline-offset:-2px}
.xl-panel{padding:12px;overflow:auto}
.xl-title{display:none;margin:0 0 8px;font:600 14pt system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.xl-sheet{position:relative;display:grid}
.xc{display:flex;flex-direction:column;justify-content:flex-end;min-width:0;min-height:0;overflow:clip;padding:0 2px;white-space:pre;text-align:left;line-height:1.2}
.xn{text-align:right}
.xe{text-align:center}
.xo{overflow-x:visible;z-index:1}
.xb{z-index:2;pointer-events:none}
.xi{position:absolute;z-index:3;max-width:none}
@media print{
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.xl-tabs{display:none}
.xl-panel,.xl-panel[hidden]{display:block;overflow:visible;break-before:page}
.xl-panel:first-of-type{break-before:auto}
.xl-title{display:block}
}
`;

// The one script the page's CSP admits: switching tabs.
const TAB_SCRIPT = 'document.querySelectorAll(".xl-tab").forEach(function(tab){'
  + 'tab.addEventListener("click",function(){'
  + 'document.querySelectorAll(".xl-tab").forEach(function(other){'
  + 'var on=other===tab;other.setAttribute("aria-selected",on?"true":"false");'
  + 'document.getElementById(other.getAttribute("aria-controls")).hidden=!on;});});});';

/** Visible sheets in workbook order, each with its part name. */
function listSheets(parts) {
  const workbook = kid(parseXml(parts.get('xl/workbook.xml').toString('utf8')), 'workbook');
  const rels = readRels(parts, 'xl/workbook.xml');
  return kids(kid(workbook, 'sheets'), 'sheet')
    .filter((sheet) => !['hidden', 'veryHidden'].includes(sheet.attrs.state))
    .map((sheet) => ({ name: sheet.attrs.name ?? '', part: rels.get(sheet.attrs.id) }));
}

const EMPTY_SHEET = '<worksheet/>';

/** The whole conversion, without touching the filesystem. */
export function renderWorkbookHtml(buffer, { lang = 'en', sourceName = 'workbook.xlsx', now = new Date() } = {}) {
  const parts = openWorkbook(buffer, basename(sourceName));
  const strings = readSharedStrings(parts);
  const xfs = readStyles(parts);
  const sheets = listSheets(parts);

  const tabs = [];
  const panels = [];
  sheets.forEach((entry, index) => {
    const id = `xl-sheet-${index + 1}`;
    const xml = (entry.part && parts.get(entry.part)?.toString('utf8')) || EMPTY_SHEET;
    const sheet = readWorksheet(xml, strings);
    const pictures = entry.part ? readPictures(parts, entry.part, sheet) : [];
    const name = escapeHtml(entry.name);
    const first = index === 0;
    tabs.push(`<button type="button" class="xl-tab" role="tab" id="${id}-tab" aria-controls="${id}" aria-selected="${first}">${name}</button>`);
    panels.push(`<section class="xl-panel" role="tabpanel" id="${id}" aria-labelledby="${id}-tab"${first ? '' : ' hidden'}>\n`
      + `<h2 class="xl-title">${name}</h2>\n${renderSheet(sheet, pictures, xfs)}\n</section>`);
  });

  const bodyHtml = `<nav class="xl-tabs" role="tablist" aria-label="${escapeHtml(frameStrings(lang).sheets)}">\n`
    + `${tabs.join('\n')}\n</nav>\n<main>\n${panels.join('\n')}\n</main>`;
  return renderPage({
    lang,
    title: basename(sourceName),
    css: `${CSS}${styleCss(xfs)}\n`,
    bodyHtml,
    script: TAB_SCRIPT,
    sources: [sourceName],
    now,
  });
}

function render(args) {
  let buffer;
  try {
    buffer = readFileSync(args.input);
  } catch (error) {
    throw new Error(`cannot read ${args.input}: ${error.code || error.message}`);
  }
  return renderWorkbookHtml(buffer, { lang: args.lang, sourceName: args.input });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({ tool: TOOL, usage: USAGE, argv: process.argv.slice(2), accepts: [], render });
}
