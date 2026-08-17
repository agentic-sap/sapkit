// sapkit:program-to-spec / package-to-process — screen & diagram image renderer.
//
// WHAT THIS MODULE IS
//   Eight pure SVG builders plus one headless-browser rasterizer. Every builder
//   is paired with a `*Metrics` twin that reports the exact pixel box the
//   builder will declare, because the rasterizer has to size a browser window
//   before the SVG exists. Builder and twin therefore share ONE layout pass
//   (see `compute*Layout` below) — the pair can never drift apart the way two
//   hand-copied formula sets do.
//
//   pair 1  renderSelectionScreenSVG        / selectionScreenMetrics
//   pair 2  renderAlvLayoutSVG              / alvLayoutMetrics
//   pair 3  renderProcessFlowSVG            / processFlowMetrics
//   pair 4  renderProcessFlowHorizontalSVG  / processFlowHorizontalMetrics
//   pair 5  renderFlowchartSVG              / flowchartMetrics
//   pair 6  renderSequenceDiagramSVG        / sequenceDiagramMetrics
//   pair 7  renderProcessMapSVG             / processMapMetrics
//   pair 8  renderMultipaneAlvSVG           / multipaneAlvMetrics
//   plus    rasterizeSvgToPng   — SVG string  → PNG Buffer | null
//           renderScreenImages  — one image-spec → the three xlsx/md slots
//
// COORDINATE SPACE
//   Builders lay out in an unscaled "design" space and publish it as the
//   viewBox. Only the outer width/height attributes carry RENDER_SCALE, so the
//   browser paints the same geometry 15 % larger without any interior number
//   changing. `scaled()` is the only place that factor is applied.
//
// HARD CONSTRAINTS (do not relax)
//   · Zero npm dependencies — node: builtins only.
//   · No headless browser on PATH is a SUPPORTED state: findBrowser() returns
//     null, rasterizeSvgToPng() returns null, and every caller degrades to its
//     text/wireframe fallback. Never make a browser mandatory.
//   · Output bytes are frozen. Two long-standing quirks are load-bearing for
//     that freeze and are marked `QUIRK:` at their site — read those comments
//     before "fixing" anything that looks like an off-by-scale mistake.

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

// ══════════════════════════════════════════════════════════════════
// 1. Primitives — escaping, text measurement, wrapping, SVG scaffolding
// ══════════════════════════════════════════════════════════════════

/** Escape the five characters that can break an attribute or text node. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Greedy word wrap by CHARACTER COUNT. Retained for callers that want a
 * character budget rather than a pixel budget.
 *
 * Currently unreferenced inside this module — kept deliberately rather than
 * deleted, since removing a helper is a separate decision from re-expressing
 * one. Safe to drop if a future pass confirms no external use.
 */
function wrapTextByChars(text, charsPerLine = 60) {
  const lines = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current.length + word.length + 1 > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Rough advance width in px at 12 px Arial: 7 px per ASCII cell, 13 px per
 * anything above U+007F. Deliberately coarse and deliberately generous — it
 * drives the selection screen's label-column width, and under-measuring there
 * used to slide long English labels underneath the input boxes.
 */
function approxTextWidthPx(text) {
  let width = 0;
  for (const ch of String(text ?? '')) width += ch.charCodeAt(0) > 0x7F ? 13 : 7;
  return width;
}

// Code-point ranges that occupy roughly a full-width cell: Hangul Jamo, CJK
// radicals/symbols, Hiragana/Katakana, CJK ideographs, Hangul syllables,
// half/full-width forms, and everything from the SMP emoji planes upward.
const WIDE_RANGES = [
  [0x1100, 0x11FF], [0x2E80, 0x303F], [0x3040, 0x30FF],
  [0x3400, 0x9FFF], [0xAC00, 0xD7AF], [0xFF00, 0xFFEF],
];
const WIDE_FLOOR = 0x1F000;
const WIDE_FACTOR = 1.8;

/**
 * Pixel-budget wrap used by every box-and-label renderer here.
 *
 * Breaks on whitespace when it can and mid-token when a single token exceeds
 * the budget, so a 200-character identifier still fits inside its box instead
 * of overflowing it. Whitespace tokens are preserved mid-line and stripped at
 * a line start.
 */
function wrapTextPx(text, maxPx, charPx = 7) {
  const cellWidth = (ch) => {
    const cp = ch.codePointAt(0);
    const wide = cp >= WIDE_FLOOR || WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
    return wide ? charPx * WIDE_FACTOR : charPx;
  };
  const spanWidth = (span) => [...span].reduce((sum, ch) => sum + cellWidth(ch), 0);

  const lines = [];
  let line = '', lineW = 0;
  for (const token of String(text ?? '').split(/(\s+)/)) {
    if (!token) continue;
    const tokenW = spanWidth(token);
    if (lineW + tokenW <= maxPx) {
      // Fits on the current line.
      line += token;
      lineW += tokenW;
    } else if (tokenW > maxPx) {
      // Unbreakable-by-space token wider than a whole line → split per char.
      if (line) { lines.push(line); line = ''; lineW = 0; }
      for (const ch of token) {
        const chW = cellWidth(ch);
        if (lineW + chW > maxPx) {
          if (line) lines.push(line);
          line = ch; lineW = chW;
        } else {
          line += ch; lineW += chW;
        }
      }
    } else {
      // Token fits a fresh line — start one, dropping the leading whitespace.
      if (line) lines.push(line);
      line = token.replace(/^\s+/, '');
      lineW = spanWidth(line);
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Wrap honouring explicit `\n` breaks first, then the pixel budget. */
function wrapLabel(label, maxPx) {
  return String(label ?? '').split('\n').flatMap(seg => wrapTextPx(seg, maxPx));
}

/**
 * Outer-SVG scale factor. Interior coordinates and font sizes never change;
 * the browser simply paints the same viewBox 15 % larger. Raise for crisper
 * embedded PNGs, lower if images grow too wide for the target sheet.
 */
const RENDER_SCALE = 1.15;

/** Design-space length → declared device px. */
const scaled = (n) => Math.round(n * RENDER_SCALE);

/** The `{width,height}` shape every `*Metrics` export returns. */
const metricsOf = (w, h) => ({ width: scaled(w), height: scaled(h) });

/**
 * Wrap body markup in the document scaffold shared by all eight builders:
 * XML declaration, root <svg> carrying the scaled box plus the design-space
 * viewBox, and the common Arial/12 px text defaults.
 */
function svgDocument({ width, height, body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scaled(width)}" height="${scaled(height)}" viewBox="0 0 ${width} ${height}" font-family="Arial,sans-serif" font-size="12">
${body.join('\n')}
</svg>`;
}

/** Opaque white backdrop — every image is composited over paper, not alpha. */
const backdrop = (width, height) => `<rect width="${width}" height="${height}" fill="#FFF"/>`;

/** Soft drop shadow. Percentages are filter-region padding around the bbox. */
function dropShadowFilter(id, [x, y, w, h], dy, blur, opacity) {
  return `<filter id="${id}" x="${x}%" y="${y}%" width="${w}%" height="${h}%">`
    + `<feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${INK.shadow}" flood-opacity="${opacity}"/>`
    + `</filter>`;
}

/** Solid triangular arrowhead in user-space units (immune to stroke width). */
function solidArrowMarker(id, fill) {
  return `<marker id="${id}" markerWidth="11" markerHeight="11" refX="8.5" refY="3.2" orient="auto" markerUnits="userSpaceOnUse">`
    + `<path d="M0,0 L9.5,3.2 L0,6.4 Z" fill="${fill}"/></marker>`;
}

/**
 * Path tracing a rectangle with only its TOP corners rounded — used for grid
 * header bands that must sit flush against the body below them.
 */
function roundedTopRectPath(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} a${r},${r} 0 0 1 ${r},-${r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${y + h} Z`;
}

/** Centred multi-line text at 12 px — the process-flow box label pattern. */
function centredLines(cx, firstBaseline, lineH, lines, fill, bold = false) {
  return lines.map((line, i) =>
    `<text x="${cx}" y="${firstBaseline + i * lineH}" text-anchor="middle" font-size="12"`
    + `${bold ? ' font-weight="700"' : ''} fill="${fill}">${esc(line)}</text>`);
}

// ── Shared palette ────────────────────────────────────────────────
// Only values reused across sections live here; single-site colours stay
// inline where they are easier to read against their shape.
const INK = {
  heading:  '#0A4F8C',   // chart titles and terminal-pill text
  shadow:   '#8C9BAA',   // drop-shadow flood colour
  text:     '#2B3A4A',   // default label ink on light fills
  edge:     '#5E7388',   // connector strokes and their arrowheads
  accent:   '#1F5AA0',   // hotspots, interaction captions
  gridLine: '#C8D4E2',   // ALV frames and column separators
};
const SAP_BLUE = { fill: '#2E6FB0', stroke: '#24598F' };   // headers, pills
const AMBER    = { fill: '#FFF6D8', stroke: '#D9A400' };   // decisions, notes
const MESSAGE  = { fill: '#FCE7E4', stroke: '#C0563E' };   // io / exception
const PANEL    = { fill: '#FFFFFF', stroke: '#3E7DB3' };   // framed blocks

// ══════════════════════════════════════════════════════════════════
// 2. Localized strings
// ══════════════════════════════════════════════════════════════════
//
// Held as one row per string, three columns per language, so adding a phrase
// is a single line rather than an edit in each language block (the shape that
// let 'ko' defaults leak into EN/JA specs before D-053). Adding a LANGUAGE
// means appending a column here and to LANGUAGES; anything unrecognized falls
// back to Korean.

const LANGUAGES = ['ko', 'en', 'ja'];

const PHRASES = {
  //                 ko                          en                                        ja
  required:       ['필수 입력',                   'Required',                               '必須入力'],
  dropdown:       ['▼ 복수 선택',                 '▼ Multi-select',                         '▼ 複数選択'],
  range:          ['~ 범위(LOW~HIGH)',            '~ Range (LOW~HIGH)',                     '~ 範囲(LOW~HIGH)'],
  status_done:    ['완료',                        'Done',                                   '完了'],
  status_partial: ['부분입고',                    'Partial',                                '一部入荷'],
  status_open:    ['미입고',                      'Open',                                   '未入荷'],
  hotspot_text:   ['밑줄 파랑',                   'Blue underline',                         '青下線'],
  hotspot_label:  ['Hotspot (더블클릭 이동)',      '= Hotspot (click to navigate)',          '= Hotspot (ダブルクリックで遷移)'],
  editable_cell:  ['노랑 셀',                     'Yellow cell',                            '黄色セル'],
  editable_label: ['편집 가능',                    '= Editable',                             '= 編集可能'],
  block_label:    ['조회 조건',                   'Selection Criteria',                     '照会条件'],
  option_label:   ['옵션',                        'Options',                                'オプション'],
  flow_heading:   ['처리 흐름도',                 'Process Flow',                           '処理フロー'],
  pane_caption:   ['트리 노드 클릭 시 우측 갱신',  'Click a tree node to refresh the right pane', 'ツリーノードをクリックすると右側を更新'],
  fc_terminal:    ['시작 · 종료',                 'Start · End',                            '開始 · 終了'],
  fc_process:     ['처리',                        'Process',                                '処理'],
  fc_decision:    ['분기 (조건)',                 'Decision',                               '分岐 (条件)'],
  fc_message:     ['메시지 · 예외',               'Message · Exception',                    'メッセージ · 例外'],
  fc_yes:         ['예',                          'Yes',                                    'はい'],
  fc_no:          ['아니오',                      'No',                                     'いいえ'],
};

// Pivot the row table into one lookup object per language, once at load.
const LEGEND = Object.fromEntries(LANGUAGES.map((lang, col) => [
  lang,
  Object.fromEntries(Object.entries(PHRASES).map(([key, byLang]) => [key, byLang[col]])),
]));

/** Phrase table for `lang`, falling back to Korean for anything unlisted. */
const legendFor = (lang) => LEGEND[lang] || LEGEND.ko;

// ══════════════════════════════════════════════════════════════════
// 3. Selection screen  (pair 1)
// ══════════════════════════════════════════════════════════════════
//
// Field schema
//   { label, name, required?, range?, note? }
//   `range: true` paints LOW ~ HIGH as two boxes. `defaultLow` / `defaultHigh`
//   are accepted and IGNORED on purpose: the field name already labels the box,
//   so echoing a default inside it only adds noise. The Parameters table in
//   the spec document is where those values belong.
//
// Option-field schema
//   { label, name, note? } — rendered as a checkbox row in a second block.

const SEL_ROW_H       = 24;
const SEL_PAD_TOP     = 40;
const SEL_PAD_BOTTOM  = 60;
const SEL_LABEL_X     = 38;
const SEL_LABEL_GAP   = 16;   // clearance between longest label and input box
const SEL_BOX_W       = 150;
const SEL_SEP_GAP     = 8;    // label-side gap before the '~' range separator
const SEL_INPUT_X_MIN = 200;  // floor, so short CJK labels keep the legacy look
const SEL_NOTE_W      = 200;  // right margin reserved for trailing note text
const SEL_BLOCK_TOP   = 20;

// Shared by the selection screen AND the ALV grid: both mockups carry the same
// soft plate shadow so they read as one family alongside the diagram renderers.
const IMG_SHADOW_ID = 'imgsh';
const IMG_SHADOW = dropShadowFilter(IMG_SHADOW_ID, [-8, -20, 116, 142], 1.4, 1.6, 0.4);

/**
 * One layout pass shared by the builder and its metrics twin.
 *
 * The label column is measured from the LONGEST label across both blocks and
 * every input x-coordinate is pushed right of it, which is what keeps a label
 * like "Distribution Channel (S_VTWEG)" from running under its own input box.
 */
function computeSelectionLayout({ fields = [], optionFields = [] } = {}) {
  const optionBlockH = optionFields.length ? 24 + optionFields.length * SEL_ROW_H : 0;
  const canvasH = SEL_PAD_TOP + fields.length * SEL_ROW_H + SEL_PAD_BOTTOM + optionBlockH + 60;

  const labelText = (f) => `${f.label} (${f.name})`;
  const allLabels = [...fields.map(labelText), ...optionFields.map(labelText)];
  const widestLabel = allLabels.length ? Math.max(...allLabels.map(approxTextWidthPx)) : 150;

  // x-ladder, left to right: label │ LOW box │ ~ │ HIGH box │ ▼ │ note
  const inputX      = Math.max(SEL_INPUT_X_MIN, SEL_LABEL_X + widestLabel + SEL_LABEL_GAP);
  const sepX        = inputX + SEL_BOX_W + SEL_SEP_GAP;   // '~' centre
  const highX       = sepX + 10;                          // HIGH box left edge
  const rangeDropX  = highX + SEL_BOX_W + 2;
  const singleDropX = inputX + SEL_BOX_W + 2;
  const canvasW     = Math.max(900, rangeDropX + 28 + SEL_NOTE_W);

  const blockH    = SEL_PAD_TOP + fields.length * SEL_ROW_H + 20;
  const optBlockY = SEL_BLOCK_TOP + blockH + 20;

  return {
    optionBlockH, canvasW, canvasH,
    inputX, sepX, highX, rangeDropX, singleDropX,
    rangeNoteX: rangeDropX + 28,
    singleNoteX: singleDropX + 28,
    blockH, optBlockY,
    legendY: optBlockY + optionBlockH + 30,
  };
}

/** Framed block outline plus its tab-style caption chip. */
function selectionBlock(y, width, height, caption, minTabW) {
  return [
    `<rect x="10" y="${y}" width="${width - 20}" height="${height}" rx="8" fill="${PANEL.fill}" stroke="${PANEL.stroke}" stroke-width="1.3" filter="url(#${IMG_SHADOW_ID})"/>`,
    `<rect x="28" y="${y - 9}" width="${Math.max(minTabW, approxTextWidthPx(caption) + 46)}" height="18" rx="4" fill="#DCE7F1" stroke="#9DBBD6"/>`,
    `<text x="38" y="${y + 4}" font-weight="700" fill="${SAP_BLUE.stroke}">◆ ${esc(caption)}</text>`,
  ];
}

const selInputBox = (x, y) =>
  `<rect x="${x}" y="${y - 12}" width="${SEL_BOX_W}" height="16" fill="${PANEL.fill}" stroke="#9AA7B4" rx="2"/>`;

const selDropdown = (x, y) =>
  `<rect x="${x}" y="${y - 12}" width="16" height="16" fill="#E7EEF5" stroke="#9AA7B4" rx="2"/>`
  + `<text x="${x + 8}" y="${y}" text-anchor="middle">▼</text>`;

const selNote = (x, y, note) => (note ? `<text x="${x}" y="${y}" fill="#666">${esc(note)}</text>` : '');

export function renderSelectionScreenSVG({
  fields = [],
  blockLabel = null,
  optionFields = [],
  optionBlockLabel = null,
  lang = 'ko',
} = {}) {
  const L = legendFor(lang);
  // Omitted (or blank) block captions take the localized default, so an EN/JA
  // spec never inherits the Korean wording. Explicit values always win.
  const mainCaption   = blockLabel || L.block_label;
  const optionCaption = optionBlockLabel || L.option_label;

  const g = computeSelectionLayout({ fields, optionFields });

  const fieldRows = fields.map((f, i) => {
    const y = SEL_PAD_TOP + (i + 1) * SEL_ROW_H - 6;
    const star = f.required ? `<text x="25" y="${y}" fill="#B00020" font-weight="700">*</text>` : '';
    const label = `<text x="${SEL_LABEL_X}" y="${y}">${esc(f.label)} (${esc(f.name)})</text>`;
    if (f.range) {
      return [
        star, label,
        selInputBox(g.inputX, y),
        `<text x="${g.sepX}" y="${y}" text-anchor="middle">~</text>`,
        selInputBox(g.highX, y),
        selDropdown(g.rangeDropX, y),
        selNote(g.rangeNoteX, y, f.note),
      ].join('');
    }
    return [
      star, label,
      selInputBox(g.inputX, y),
      selDropdown(g.singleDropX, y),
      selNote(g.singleNoteX, y, f.note),
    ].join('');
  }).join('');

  const optionRows = optionFields.map((f, i) => {
    const y = g.optBlockY + 34 + i * SEL_ROW_H;
    return [
      `<rect x="${g.inputX}" y="${y - 10}" width="12" height="12" fill="#FFF" stroke="#555"/>`,
      `<text x="${g.inputX + 20}" y="${y}">${esc(f.label)} (${esc(f.name)})</text>`,
      f.note ? `<text x="${g.inputX + 220}" y="${y}" fill="#666">${esc(f.note)}</text>` : '',
    ].join('');
  }).join('');

  // Legend entries are derived from the spec, not assumed: no required field
  // means no `*` entry, no range field means no `~` entry, and an empty field
  // set drops the legend row entirely. The renderer must not advertise
  // features the program does not have.
  const everyField = [...fields, ...optionFields];
  const legendItems = [];
  if (everyField.some(f => f.required)) legendItems.push(`<tspan fill="#B00020" font-weight="700">*</tspan> ${esc(L.required)}`);
  if (fields.length) legendItems.push(esc(L.dropdown));
  if (fields.some(f => f.range)) legendItems.push(esc(L.range));
  const legend = legendItems.length
    ? `<text x="25" y="${g.legendY}" fill="#555" font-size="11">${legendItems.join(' · ')}</text>`
    : '';

  const optionBlock = optionFields.length
    ? `\n${[...selectionBlock(g.optBlockY, g.canvasW, g.optionBlockH, optionCaption, 70), optionRows].join('\n')}\n`
    : '';

  return svgDocument({
    width: g.canvasW,
    height: g.canvasH,
    body: [
      `<defs>${IMG_SHADOW}</defs>`,
      backdrop(g.canvasW, g.canvasH),
      ...selectionBlock(SEL_BLOCK_TOP, g.canvasW, g.blockH, mainCaption, 120),
      fieldRows,
      optionBlock,
      legend,
    ],
  });
}

export function selectionScreenMetrics({ fields = [], optionFields = [] } = {}) {
  const g = computeSelectionLayout({ fields, optionFields });
  return metricsOf(g.canvasW, g.canvasH);
}

// ══════════════════════════════════════════════════════════════════
// 4. ALV grid  (pair 2)
// ══════════════════════════════════════════════════════════════════
//
// Column schema
//   { name, header?, width?, align?: 'left'|'center'|'end', hotspot?, editable? }
//   The reserved column name `_status` paints a traffic-light glyph.
//
// Row schema
//   { [colName]: value, _status?: '●'|'○'|'◉', _locked?: boolean }
//
// As with the selection screen, legend entries are FEATURE-DETECTED from the
// spec: no hotspot column drops the hotspot entry, no editable column drops
// the editable entry, no status source drops the traffic lights, and when
// nothing applies the legend row vanishes and the canvas loses ~30 px.

const ALV_ROW_H     = 24;
const ALV_HEADER_H  = 22;
const ALV_COL_W     = 100;   // per-column default
const ALV_TOP       = 10;
const ALV_W_MIN     = 900;
const ALV_W_MAX     = 1600;
const ALV_CORNER_R  = 7;
const STATUS_COL    = '_status';
const STATUS_INK    = { '●': '#D4A017', '○': '#C0392B', '◉': '#1E8449' };
const ALV_ROW_BAND  = '#F5F9FC';
const ALV_ROW_LOCK  = '#F0F5FA';

const colWidth = (c) => c.width || ALV_COL_W;

/** One layout pass shared by the builder and its metrics twin. */
function computeAlvLayout({ columns = [], sampleRows = [], maxRows = 3 } = {}) {
  const rows = sampleRows.slice(0, Math.max(1, Math.min(maxRows, 5)));
  const naturalW = columns.reduce((sum, c) => sum + colWidth(c), 0) + 20;
  const canvasW = Math.max(ALV_W_MIN, Math.min(naturalW, ALV_W_MAX));

  const feature = {
    status:   columns.some(c => c.name === STATUS_COL) || rows.some(r => r && r._status),
    hotspot:  columns.some(c => c.hotspot),
    editable: columns.some(c => c.editable),
  };
  feature.any = feature.status || feature.hotspot || feature.editable;

  const canvasH = ALV_TOP + ALV_HEADER_H + rows.length * ALV_ROW_H + (feature.any ? 80 : 30);

  // Left edge of every column, accumulated left to right.
  let cursor = ALV_TOP;
  const colLeft = columns.map(c => { const left = cursor; cursor += colWidth(c); return left; });

  return {
    rows, colLeft, feature, canvasW, canvasH,
    gridRight: cursor,
    gridH: ALV_HEADER_H + rows.length * ALV_ROW_H,
    legendY: ALV_TOP + ALV_HEADER_H + rows.length * ALV_ROW_H + 30,
  };
}

/** Paint one data cell. Returns '' for cells with nothing to show. */
function alvCell(column, row, left, baselineY, rowTop) {
  const width = colWidth(column);
  const centreX = left + width / 2;
  const value = row[column.name];

  if (column.editable) {
    const fill = row._locked ? '#E5E5E5' : '#FFF6C8';
    const stroke = row._locked ? '#999' : '#A67F25';
    const box = `<rect x="${left + 2}" y="${rowTop + 3}" width="${width - 4}" height="${ALV_ROW_H - 6}" fill="${fill}" stroke="${stroke}"/>`;
    if (value === undefined) return box;
    return box
      + `<text x="${left + width - 8}" y="${baselineY}" text-anchor="end" font-family="monospace" fill="${row._locked ? '#888' : '#000'}">${esc(value)}</text>`;
  }

  if (value === undefined || value === null || value === '') return '';
  const text = String(value);

  if (column.name === STATUS_COL) {
    return `<text x="${centreX}" y="${baselineY}" text-anchor="middle" fill="${STATUS_INK[text] || '#555'}" font-weight="700">${esc(text)}</text>`;
  }
  if (column.hotspot) {
    return `<text x="${centreX}" y="${baselineY}" text-anchor="middle" font-family="monospace" fill="${INK.accent}" text-decoration="underline">${esc(text)}</text>`;
  }

  const anchor = column.align === 'end' ? 'end' : column.align === 'left' ? 'start' : 'middle';
  const x = anchor === 'end' ? left + width - 8 : anchor === 'start' ? left + 8 : centreX;
  // Digits, separators and signs get tabular monospace so columns line up.
  const family = /^[\d.,\-]+$/.test(text) ? 'monospace' : 'Arial,sans-serif';
  return `<text x="${x}" y="${baselineY}" text-anchor="${anchor}" font-family="${family}">${esc(text)}</text>`;
}

export function renderAlvLayoutSVG({ columns = [], sampleRows = [], maxRows = 3, lang = 'ko' } = {}) {
  const L = legendFor(lang);
  const g = computeAlvLayout({ columns, sampleRows, maxRows });
  const { rows, colLeft, gridRight } = g;

  const headerCells = columns.map((c, i) =>
    `<text x="${colLeft[i] + colWidth(c) / 2}" y="${ALV_TOP + ALV_HEADER_H - 7}" text-anchor="middle" font-weight="700" fill="#FFFFFF">${esc(c.header || c.name)}</text>`,
  ).join('');

  const separators = colLeft.slice(1).map(x =>
    `<line x1="${x}" y1="${ALV_TOP + ALV_HEADER_H}" x2="${x}" y2="${ALV_TOP + g.gridH}" stroke="${INK.gridLine}"/>`,
  ).join('');

  const dataRows = rows.map((row, i) => {
    const rowTop = ALV_TOP + ALV_HEADER_H + i * ALV_ROW_H;
    const striped = i % 2 === 1;
    const band = striped || row._locked
      ? `<rect x="${ALV_TOP}" y="${rowTop}" width="${gridRight - ALV_TOP}" height="${ALV_ROW_H}" fill="${row._locked ? ALV_ROW_LOCK : striped ? ALV_ROW_BAND : '#FFF'}"/>`
      : '';
    const cells = columns
      .map((c, ci) => alvCell(c, row, colLeft[ci], rowTop + ALV_ROW_H - 8, rowTop))
      .join('');
    return band + cells;
  }).join('');

  const legendItems = [];
  if (g.feature.status) {
    legendItems.push(
      `<tspan fill="${STATUS_INK['◉']}" font-weight="700">◉</tspan> ${esc(L.status_done)}`,
      `<tspan fill="${STATUS_INK['●']}" font-weight="700">●</tspan> ${esc(L.status_partial)}`,
      `<tspan fill="${STATUS_INK['○']}" font-weight="700">○</tspan> ${esc(L.status_open)}`,
    );
  }
  if (g.feature.hotspot) legendItems.push(`<tspan fill="${INK.accent}" text-decoration="underline">${esc(L.hotspot_text)}</tspan> ${esc(L.hotspot_label)}`);
  if (g.feature.editable) legendItems.push(`<tspan>${esc(L.editable_cell)}</tspan> ${esc(L.editable_label)}`);
  const legend = g.feature.any
    ? `<text x="${ALV_TOP}" y="${g.legendY}" font-size="11" fill="#555">${legendItems.join(' · ')}</text>`
    : '';

  // Same rectangle twice: a shadowed white plate UNDER the cells, and a plain
  // outline OVER them so the border is never covered by a row band.
  const gridFrame = (fill, extra) =>
    `<rect x="${ALV_TOP}" y="${ALV_TOP}" width="${gridRight - ALV_TOP}" height="${g.gridH}" rx="${ALV_CORNER_R}" fill="${fill}" stroke="${INK.gridLine}"${extra}/>`;

  return svgDocument({
    width: g.canvasW,
    height: g.canvasH,
    body: [
      `<defs>${IMG_SHADOW}</defs>`,
      backdrop(g.canvasW, g.canvasH),
      gridFrame(PANEL.fill, ` filter="url(#${IMG_SHADOW_ID})"`),
      `<path d="${roundedTopRectPath(ALV_TOP, ALV_TOP, gridRight - ALV_TOP, ALV_HEADER_H, ALV_CORNER_R)}" fill="${SAP_BLUE.fill}" stroke="${SAP_BLUE.stroke}" stroke-width="1.1"/>`,
      headerCells,
      dataRows,
      separators,
      gridFrame('none', ''),
      legend,
    ],
  });
}

export function alvLayoutMetrics({ columns = [], sampleRows = [], maxRows = 3 } = {}) {
  const g = computeAlvLayout({ columns, sampleRows, maxRows });
  return metricsOf(g.canvasW, g.canvasH);
}

// ══════════════════════════════════════════════════════════════════
// 5. Linear process flow — vertical (pair 3) and horizontal (pair 4)
// ══════════════════════════════════════════════════════════════════
//
// Item format is a plain string array, one step per entry:
//   'text'    → process box (rectangle)
//   '? text'  → decision   (amber diamond)
//   '! text'  → terminal   (grey pill)
//
// Horizontal is the shape the xlsx embeds (sheet4 anchor B19): a spec reader
// needs the end-to-end flow in one viewport, and a tall vertical chart forces
// scrolling. Box width there adapts per label (150..220 px) and the chart stays
// on ONE row on purpose — Excel scrolls sideways when there are many steps.

const FLOW_BLUE   = '#0A4F8C';
const FLOW_AMBER  = '#FFFDE7';
const FLOW_GREY   = '#EFEFEF';
const FLOW_LABEL  = '#222';

/** Split a `?`/`!` prefix off a step and name its shape. */
function classifyStep(raw) {
  const text = String(raw ?? '');
  if (/^\?\s*/.test(text)) return { kind: 'decision', label: text.replace(/^\?\s*/, '') };
  if (/^!\s*/.test(text)) return { kind: 'terminal', label: text.replace(/^!\s*/, '') };
  return { kind: 'process', label: text };
}

// ── vertical ──────────────────────────────────────────────────────
const PFV_BOX_W       = 680;
const PFV_BOX_H_MIN   = 38;
const PFV_TERM_H_MIN  = 38;
const PFV_DIAMOND_MIN = 60;
const PFV_LINE_H      = 18;
const PFV_PAD_TOP     = 48;
const PFV_PAD_BOT     = 28;
const PFV_ARROW_H     = 30;

/**
 * Inner text budget for a vertical box. A diamond tapers, so its usable width
 * at the outer lines is far narrower than the bounding box — hence the much
 * larger horizontal padding.
 */
function pfvTextLines(label, kind) {
  const padX = kind === 'decision' ? 60 : 24;
  return wrapTextPx(label, PFV_BOX_W - padX * 2);
}

/** One layout pass shared by the vertical builder and its metrics twin. */
function computeVerticalFlowLayout(items) {
  let y = PFV_PAD_TOP;
  const steps = items.map((raw, i) => {
    const { kind, label } = classifyStep(raw);
    const lines = pfvTextLines(label, kind);
    const textH = lines.length * PFV_LINE_H;
    const boxH = kind === 'decision' ? Math.max(PFV_DIAMOND_MIN, textH + 28)
      : kind === 'terminal' ? Math.max(PFV_TERM_H_MIN, textH + 16)
        : Math.max(PFV_BOX_H_MIN, textH + 16);
    const top = y;
    y += boxH;
    const arrow = i < items.length - 1;
    if (arrow) y += PFV_ARROW_H;
    return { kind, lines, boxH, top, arrow };
  });
  return { steps, canvasH: y + PFV_PAD_BOT };
}

export function renderProcessFlowSVG(items = [], { lang = 'ko', heading = null, width = 760, orientation = 'vertical' } = {}) {
  const title = heading || legendFor(lang).flow_heading;
  if (orientation === 'horizontal') return renderProcessFlowHorizontalSVG(items, { lang, heading: title });

  const centreX = width / 2;
  const boxLeft = (width - PFV_BOX_W) / 2;
  const { steps, canvasH } = computeVerticalFlowLayout(items);

  const parts = [
    `<text x="${centreX}" y="${PFV_PAD_TOP - 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${FLOW_BLUE}">${esc(title)}</text>`,
  ];

  for (const step of steps) {
    const { kind, lines, boxH, top } = step;
    const midY = top + boxH / 2;
    // Text block is vertically centred; +5 lifts the baseline to optical centre.
    const firstBaseline = midY - ((lines.length - 1) * PFV_LINE_H) / 2 + 5;

    if (kind === 'decision') {
      const dx = PFV_BOX_W / 2, dy = boxH / 2;
      parts.push(`<polygon points="${centreX},${midY - dy} ${centreX + dx},${midY} ${centreX},${midY + dy} ${centreX - dx},${midY}" fill="${FLOW_AMBER}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(centreX, firstBaseline, PFV_LINE_H, lines, FLOW_LABEL));
    } else if (kind === 'terminal') {
      parts.push(`<rect x="${boxLeft}" y="${top}" width="${PFV_BOX_W}" height="${boxH}" rx="${boxH / 2}" fill="${FLOW_GREY}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(centreX, firstBaseline, PFV_LINE_H, lines, FLOW_BLUE, true));
    } else {
      parts.push(`<rect x="${boxLeft}" y="${top}" width="${PFV_BOX_W}" height="${boxH}" fill="#FFFFFF" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(centreX, firstBaseline, PFV_LINE_H, lines, FLOW_LABEL));
    }

    if (step.arrow) {
      const from = top + boxH;
      parts.push(`<line x1="${centreX}" y1="${from}" x2="${centreX}" y2="${from + PFV_ARROW_H - 8}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(`<polygon points="${centreX - 7},${from + PFV_ARROW_H - 10} ${centreX + 7},${from + PFV_ARROW_H - 10} ${centreX},${from + PFV_ARROW_H}" fill="${FLOW_BLUE}"/>`);
    }
  }

  return svgDocument({
    width,
    height: canvasH,
    body: [backdrop(width, canvasH), parts.join('\n')],
  });
}

export function processFlowMetrics(items = [], { width = 760, orientation = 'vertical' } = {}) {
  if (orientation === 'horizontal') return processFlowHorizontalMetrics(items);
  return metricsOf(width, computeVerticalFlowLayout(items).canvasH);
}

// ── horizontal ────────────────────────────────────────────────────
const PFH_BOX_W_MIN = 150;
const PFH_BOX_W_MAX = 220;
const PFH_BOX_H     = 78;
const PFH_ARROW_W   = 28;
const PFH_PAD_X     = 28;
const PFH_PAD_TOP   = 50;
const PFH_PAD_BOT   = 24;
const PFH_LINE_H    = 18;

/**
 * Box width for one horizontal step: snug around a single-line label, capped
 * at PFH_BOX_W_MAX, and pinned to the cap as soon as the label needs two lines.
 */
function pfhBoxWidth(label) {
  const oneLine = wrapTextPx(label, PFH_BOX_W_MAX - 24);
  if (oneLine.length > 1) return PFH_BOX_W_MAX;
  const snug = approxTextWidthPx(oneLine[0]) + 32;
  return Math.max(PFH_BOX_W_MIN, Math.min(PFH_BOX_W_MAX, Math.round(snug)));
}

/** One layout pass shared by the horizontal builder and its metrics twin. */
function computeHorizontalFlowLayout(items) {
  const boxes = items.map(raw => {
    const { kind, label } = classifyStep(raw);
    const boxW = pfhBoxWidth(label);
    return { kind, label, boxW, lines: wrapTextPx(label, boxW - (kind === 'decision' ? 40 : 24)) };
  });
  const canvasW = boxes.reduce(
    (sum, b, i) => sum + b.boxW + (i < boxes.length - 1 ? PFH_ARROW_W : 0),
    PFH_PAD_X * 2,
  );
  return { boxes, canvasW, canvasH: PFH_PAD_TOP + PFH_BOX_H + PFH_PAD_BOT };
}

export function renderProcessFlowHorizontalSVG(items = [], { lang = 'ko', heading = null } = {}) {
  const title = heading || legendFor(lang).flow_heading;
  const { boxes, canvasW, canvasH } = computeHorizontalFlowLayout(items);
  const midY = PFH_PAD_TOP + PFH_BOX_H / 2;

  const parts = [
    `<text x="${canvasW / 2}" y="${PFH_PAD_TOP - 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${FLOW_BLUE}">${esc(title)}</text>`,
  ];

  let x = PFH_PAD_X;
  boxes.forEach((box, i) => {
    const firstBaseline = midY - ((box.lines.length - 1) * PFH_LINE_H) / 2 + 5;
    if (box.kind === 'decision') {
      const dx = box.boxW / 2, dy = PFH_BOX_H / 2, cx = x + dx;
      parts.push(`<polygon points="${cx},${midY - dy} ${cx + dx},${midY} ${cx},${midY + dy} ${cx - dx},${midY}" fill="${FLOW_AMBER}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(cx, firstBaseline, PFH_LINE_H, box.lines, FLOW_LABEL));
    } else if (box.kind === 'terminal') {
      parts.push(`<rect x="${x}" y="${PFH_PAD_TOP}" width="${box.boxW}" height="${PFH_BOX_H}" rx="${PFH_BOX_H / 2}" fill="${FLOW_GREY}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(x + box.boxW / 2, firstBaseline, PFH_LINE_H, box.lines, FLOW_BLUE, true));
    } else {
      parts.push(`<rect x="${x}" y="${PFH_PAD_TOP}" width="${box.boxW}" height="${PFH_BOX_H}" fill="#FFFFFF" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(...centredLines(x + box.boxW / 2, firstBaseline, PFH_LINE_H, box.lines, FLOW_LABEL));
    }
    x += box.boxW;

    if (i < boxes.length - 1) {
      const tail = x + 2, head = x + PFH_ARROW_W - 8;
      parts.push(`<line x1="${tail}" y1="${midY}" x2="${head}" y2="${midY}" stroke="${FLOW_BLUE}" stroke-width="1.6"/>`);
      parts.push(`<polygon points="${head},${midY - 6} ${head},${midY + 6} ${x + PFH_ARROW_W},${midY}" fill="${FLOW_BLUE}"/>`);
      x += PFH_ARROW_W;
    }
  });

  return svgDocument({
    width: canvasW,
    height: canvasH,
    body: [backdrop(canvasW, canvasH), parts.join('\n')],
  });
}

export function processFlowHorizontalMetrics(items = []) {
  const { canvasW, canvasH } = computeHorizontalFlowLayout(items);
  return metricsOf(canvasW, canvasH);
}

// ══════════════════════════════════════════════════════════════════
// 6. Branching flowchart  (pair 5)
// ══════════════════════════════════════════════════════════════════
//
// The linear renderers can only draw one chain. Real ABAP report logic
// branches (validation fail → re-enter, empty result → exit) and loops back,
// so this builder consumes a small graph instead of a list:
//
//   nodes: [{ id, type:'start'|'end'|'process'|'decision'|'io', label,
//             lane?: 'right' }]
//   edges: [{ from, to, label? }]      // routing is derived from geometry
//
// Layout: spine nodes (no lane) stack down the centre column in array order;
// `lane:'right'` nodes align to the y of whichever node points at them, which
// is what keeps exception paths and loop-backs clear of the spine arrows.
// A `\n` in a label forces a break.

const FC_CENTER_X = 250;
const FC_RIGHT_X  = 620;
const FC_WIDTH    = 800;
const FC_PROC_W   = 300;
const FC_DEC_W    = 240;
const FC_LINE_H   = 17;
const FC_VGAP     = 48;
const FC_PAD_TOP  = 66;
const FC_PAD_BOT  = 56;
const FC_ARROW_ID = 'fcarrow';
const FC_SHADOW_ID = 'fcsh';

/** Intrinsic size of one node, driven by its wrapped label. */
function fcMeasureNode(node) {
  const type = node.type || 'process';

  if (type === 'decision') {
    const lines = wrapLabel(node.label, FC_DEC_W - 86);
    // A diamond's usable half-width at vertical offset o is (w/2)·(1 − o/dy),
    // so the outermost line is the one that decides the half-height: solve
    // that relation for dy using the widest line.
    const widest = Math.max(...lines.map(approxTextWidthPx));
    const maxOffset = ((lines.length - 1) / 2) * FC_LINE_H + 12;
    const dy = maxOffset / Math.max(0.3, 1 - widest / FC_DEC_W);
    return { type, w: FC_DEC_W, h: Math.max(92, Math.round(dy * 2), lines.length * FC_LINE_H + 34), lines };
  }

  if (type === 'start' || type === 'end') {
    const lines = wrapLabel(node.label, 240);
    const widest = Math.max(...lines.map(approxTextWidthPx));
    return { type, w: Math.max(120, widest + 56), h: Math.max(42, lines.length * FC_LINE_H + 18), lines };
  }

  const lines = wrapLabel(node.label, FC_PROC_W - 30);
  return { type, w: FC_PROC_W, h: Math.max(46, lines.length * FC_LINE_H + 20), lines };
}

/** One layout pass shared by the builder and its metrics twin. */
function computeFlowchartLayout(graph = {}) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const pos = {};

  // Pass 1 — stack the spine.
  let y = FC_PAD_TOP;
  for (const node of nodes) {
    if (node.lane === 'right') continue;
    const m = fcMeasureNode(node);
    pos[node.id] = { ...m, x: FC_CENTER_X, yTop: y, cy: y + m.h / 2 };
    y += m.h + FC_VGAP;
  }
  let maxY = y - FC_VGAP;

  // Pass 2 — hang side nodes off their incoming spine node.
  for (const node of nodes) {
    if (node.lane !== 'right') continue;
    const m = fcMeasureNode(node);
    const inbound = edges.find(e => e.to === node.id && pos[e.from]);
    const cy = inbound ? pos[inbound.from].cy : FC_PAD_TOP + m.h / 2;
    pos[node.id] = { ...m, x: FC_RIGHT_X, yTop: cy - m.h / 2, cy };
    if (cy + m.h / 2 > maxY) maxY = cy + m.h / 2;
  }

  return { nodes, edges, byId, pos, width: FC_WIDTH, height: maxY + FC_PAD_BOT };
}

function fcNodeSvg(p) {
  const { x: cx, cy, w, h, yTop: top } = p;
  const firstBaseline = cy - ((p.lines.length - 1) * FC_LINE_H) / 2 + 4;
  const label = (fill, bold) => p.lines.map((line, i) =>
    `<text x="${cx}" y="${firstBaseline + i * FC_LINE_H}" text-anchor="middle" font-size="12.5"`
    + `${bold ? ' font-weight="700"' : ''} fill="${fill}">${esc(line)}</text>`).join('');
  const shadow = ` filter="url(#${FC_SHADOW_ID})"`;

  if (p.type === 'decision') {
    const dx = w / 2;
    return `<polygon points="${cx},${top} ${cx + dx},${cy} ${cx},${top + h} ${cx - dx},${cy}" fill="${AMBER.fill}" stroke="${AMBER.stroke}" stroke-width="1.6"${shadow}/>${label(INK.text)}`;
  }
  if (p.type === 'start' || p.type === 'end') {
    return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${SAP_BLUE.fill}" stroke="${SAP_BLUE.stroke}" stroke-width="1.4"${shadow}/>${label('#FFFFFF', true)}`;
  }
  if (p.type === 'io') {
    // Parallelogram — the classic message / exception glyph.
    const skew = 14, left = cx - w / 2, right = cx + w / 2;
    return `<polygon points="${left + skew},${top} ${right},${top} ${right - skew},${top + h} ${left},${top + h}" fill="${MESSAGE.fill}" stroke="${MESSAGE.stroke}" stroke-width="1.5"${shadow}/>${label(INK.text)}`;
  }
  return `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="7" ry="7" fill="#F4F8FC" stroke="#5A85AE" stroke-width="1.5"${shadow}/>${label(INK.text)}`;
}

/** White pill carrying an edge label so it stays legible over a connector. */
function fcChip(x, y, text, colour) {
  const w = approxTextWidthPx(text) + 12;
  return `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="16" rx="3" fill="#FFFFFF" stroke="#D7DEE6"/>`
    + `<text x="${x}" y="${y + 1}" text-anchor="middle" font-size="11" font-weight="700" fill="${colour}">${esc(text)}</text>`;
}

const FC_CHIP_NEUTRAL = '#56657A';
const FC_CHIP_YES     = '#1E7A46';
const FC_CHIP_NO      = '#B0402F';
const FC_CHIP_LOOP    = '#7A4B9C';

function fcEdgeSvg(edge, layout, lang) {
  const a = layout.pos[edge.from], b = layout.pos[edge.to];
  if (!a || !b) return '';

  const aSide = layout.byId[edge.from]?.lane === 'right';
  const bSide = layout.byId[edge.to]?.lane === 'right';
  const south = p => ({ x: p.x, y: p.yTop + p.h });
  const north = p => ({ x: p.x, y: p.yTop });
  const east = p => ({ x: p.x + p.w / 2, y: p.cy });

  const label = edge.label;
  let points, labelX, labelY, colour = FC_CHIP_NEUTRAL;

  if (!aSide && bSide) {
    // Spine decision → exception lane: straight run east.
    points = [east(a), { x: b.x - b.w / 2, y: a.cy }];
    labelX = (a.x + a.w / 2 + b.x - b.w / 2) / 2;
    labelY = a.cy - 7;
    if (label === legendFor(lang).fc_no || /no|아니|いいえ/i.test(label || '')) colour = FC_CHIP_NO;
  } else if (aSide && !bSide) {
    // Exception lane → spine: loop back up, or drop down to an exit.
    const start = b.cy < a.cy ? north(a) : south(a);
    points = [start, { x: a.x, y: b.cy }, east(b)];
    labelX = a.x;
    labelY = (start.y + b.cy) / 2;
    colour = FC_CHIP_LOOP;
  } else {
    // Spine to spine: straight down.
    points = [south(a), north(b)];
    labelX = a.x + 12;
    labelY = south(a).y + 17;
    if (label === legendFor(lang).fc_yes || /yes|예|はい/i.test(label || '')) colour = FC_CHIP_YES;
  }

  const line = `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${INK.edge}" stroke-width="1.7" marker-end="url(#${FC_ARROW_ID})"/>`;
  return line + (label ? fcChip(labelX, labelY, label, colour) : '');
}

/** Four shape swatches with localized captions, centred under the chart. */
function fcLegendSvg(lang, y, width) {
  const L = legendFor(lang);
  const entries = [
    ['terminal', L.fc_terminal], ['process', L.fc_process],
    ['decision', L.fc_decision], ['message', L.fc_message],
  ];
  const swatch = (kind, x) => {
    if (kind === 'terminal') return `<rect x="${x}" y="${y - 9}" width="22" height="13" rx="6.5" fill="${SAP_BLUE.fill}" stroke="${SAP_BLUE.stroke}"/>`;
    if (kind === 'decision') return `<polygon points="${x + 11},${y - 10} ${x + 22},${y - 2} ${x + 11},${y + 6} ${x},${y - 2}" fill="${AMBER.fill}" stroke="${AMBER.stroke}"/>`;
    if (kind === 'message') return `<polygon points="${x + 4},${y - 9} ${x + 22},${y - 9} ${x + 18},${y + 4} ${x},${y + 4}" fill="${MESSAGE.fill}" stroke="${MESSAGE.stroke}"/>`;
    return `<rect x="${x}" y="${y - 9}" width="22" height="13" rx="3" fill="#F4F8FC" stroke="#5A85AE"/>`;
  };
  const cellW = 165;
  const startX = Math.max(20, (width - cellW * entries.length) / 2);
  return entries.map(([kind, caption], i) => {
    const x = startX + i * cellW;
    return swatch(kind, x) + `<text x="${x + 30}" y="${y + 1}" font-size="11.5" fill="${FC_CHIP_NEUTRAL}">${esc(caption)}</text>`;
  }).join('');
}

export function renderFlowchartSVG(graph = {}, { lang = 'ko', heading = null } = {}) {
  const title = heading || legendFor(lang).flow_heading;
  const layout = computeFlowchartLayout(graph);
  const { width, height } = layout;

  const defs = `<defs>`
    + solidArrowMarker(FC_ARROW_ID, INK.edge)
    + dropShadowFilter(FC_SHADOW_ID, [-12, -25, 124, 150], 1.4, 1.5, 0.45)
    + `</defs>`;

  return svgDocument({
    width,
    height,
    body: [
      defs,
      backdrop(width, height),
      `<text x="${width / 2}" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="${INK.heading}">${esc(title)}</text>`,
      (layout.edges || []).map(e => fcEdgeSvg(e, layout, lang)).join('\n'),
      (layout.nodes || []).map(n => fcNodeSvg(layout.pos[n.id])).join('\n'),
      fcLegendSvg(lang, height - 22, width),
    ],
  });
}

export function flowchartMetrics(graph = {}) {
  const { width, height } = computeFlowchartLayout(graph);
  return metricsOf(width, height);
}

// ══════════════════════════════════════════════════════════════════
// 7. Sequence diagram  (pair 6)
// ══════════════════════════════════════════════════════════════════
//
// spec: {
//   actors: [{ id, label, kind:'actor'|'participant' }],   // left→right order
//   items: [
//     { m:[from,to], t:'text' },           // sync call  (solid, filled head)
//     { m:[from,to], t:'text', r:true },   // return     (dashed, open head)
//     { note:'text', over:[id,…] },        // note box spanning lifelines
//     { alt:'label' } | { opt:'label' } | { loop:'label' },   // open a frame
//     { elselbl:'label' },                 // else divider inside an alt frame
//     { end:true },                        // close the innermost open frame
//   ]
// }
//
// Column width is deliberately narrow (156, down from 198) while fonts went
// UP: markdown viewers downscale to body width, so a narrower source image
// with larger type reads bigger on screen — apparent size tracks
// font_px · containerWidth / imageWidth, not font_px alone.

const SQ_COL_W  = 156;
const SQ_LEFT   = 30;
const SQ_TOP    = 56;
const SQ_HEAD_H = 50;
const SQ_HEAD_W = SQ_COL_W - 34;
const SQ_HEAD_GAP = 22;
const SQ_ROW    = 48;
const SQ_NOTE   = 42;
const SQ_BOT    = 30;
const SQ_SELF   = 40;
// Vertical slots consumed by frame chrome. CLOSE is 22 rather than 14 because
// a label immediately after a close stacks UPWARD from its arrow (see
// seqLabel), and at 14 its white plate clipped the frame's bottom border.
const SQ_FRAG_OPEN  = 32;
const SQ_FRAG_ELSE  = 26;
const SQ_FRAG_CLOSE = 22;

const SQ_INK   = '#2B3A4A';
const SQ_LIFE  = '#A7B3C0';
const SQ_MLINE = '#3C5063';
const SQ_RET   = '#6B7C8D';
const SQ_LABEL_W = 138;   // wrap budget for message labels
const SQ_NOTE_LINE_H = 15;
const SQ_ARROW_SYNC = 'sqf';
const SQ_ARROW_RET  = 'sqo';
const SQ_SHADOW_ID  = 'sqsh';

/** Centre x of the i-th lifeline. */
const seqActorX = (i) => SQ_LEFT + SQ_HEAD_W / 2 + i * SQ_COL_W;

/** Note-box text budget for a span from column `lo` to column `hi`. */
const seqNoteWrapPx = (lo, hi) => (hi - lo) * SQ_COL_W + SQ_HEAD_W - 18;

/** One layout pass shared by the builder and its metrics twin. */
function computeSequenceLayout(spec = {}) {
  const actors = spec.actors || [];
  const columnOf = Object.fromEntries(actors.map((a, i) => [a.id, i]));
  const placed = [], frames = [], open = [];
  let y = SQ_TOP + SQ_HEAD_H + SQ_HEAD_GAP;

  for (const item of (spec.items || [])) {
    if (item.alt != null || item.opt != null || item.loop != null) {
      const kind = item.alt != null ? 'alt' : item.opt != null ? 'opt' : 'loop';
      const frame = {
        kind, label: item.alt ?? item.opt ?? item.loop,
        y0: y - 8, elses: [],
        minI: 0, maxI: Math.max(0, actors.length - 1),
      };
      open.push(frame); frames.push(frame);
      y += SQ_FRAG_OPEN;
    } else if (item.elselbl != null) {
      open[open.length - 1]?.elses.push({ y: y - 4, label: item.elselbl });
      y += SQ_FRAG_ELSE;
    } else if (item.end) {
      const frame = open.pop();
      if (frame) frame.y1 = y;
      y += SQ_FRAG_CLOSE;
    } else if (item.note != null) {
      const ids = (item.over && item.over.length) ? item.over : [actors[0]?.id];
      const cols = ids.map(id => columnOf[id]).filter(v => v != null);
      const lo = Math.min(...cols), hi = Math.max(...cols);
      // Measure with the SAME budget the painter uses, and advance by the REAL
      // box height rather than the nominal slot, so a tall note cannot bleed
      // into the row below it.
      const lines = wrapTextPx(String(item.note), seqNoteWrapPx(lo, hi));
      const h = Math.max(SQ_NOTE - 10, lines.length * SQ_NOTE_LINE_H + 12);
      placed.push({ type: 'note', y, lo, hi, text: item.note, h });
      y += h + 10;
    } else if (item.m) {
      const fi = columnOf[item.m[0]], ti = columnOf[item.m[1]];
      if (fi == null || ti == null) continue;
      // Labels stack UPWARD from their arrow, so reserve the extra lines'
      // height BEFORE placing it — otherwise a wrapped label pokes into the
      // actor headers (painted later, so they cover it) or the previous row.
      const lineCount = item.t ? wrapTextPx(String(item.t), SQ_LABEL_W).length : 1;
      y += (lineCount - 1) * SQ_NOTE_LINE_H;
      placed.push({ type: 'msg', y, fi, ti, self: fi === ti, text: item.t || '', ret: !!item.r });
      y += fi === ti ? SQ_SELF : SQ_ROW;
    }
  }
  for (const frame of open) frame.y1 = y;   // unclosed frames run to the end

  const width = SQ_LEFT * 2 + Math.max(0, actors.length - 1) * SQ_COL_W + SQ_HEAD_W;
  return { actors, placed, frames, width, height: y + SQ_BOT };
}

/** Message label on a translucent plate, stacking upward from `y`. */
function seqLabel(cx, y, text, anchor = 'middle', ret = false) {
  if (!text) return '';
  const lines = wrapTextPx(String(text), SQ_LABEL_W);
  const lineH = 14.5;
  const top = y - (lines.length - 1) * lineH;
  const plateW = Math.max(...lines.map(approxTextWidthPx)) + 10;
  const fromStart = anchor === 'start';
  const x0 = fromStart ? cx : cx - plateW / 2;
  const out = [`<rect x="${x0}" y="${top - 11}" width="${plateW}" height="${lines.length * lineH + 1}" rx="2.5" fill="#FFFFFF" fill-opacity="0.92"/>`];
  for (const [i, line] of lines.entries()) {
    out.push(`<text x="${fromStart ? x0 + 5 : cx}" y="${top + i * lineH}" text-anchor="${fromStart ? 'start' : 'middle'}" font-size="12.5" fill="${ret ? '#5B7088' : SQ_INK}">${esc(line)}</text>`);
  }
  return out.join('');
}

export function renderSequenceDiagramSVG(spec = {}, { lang = 'ko', title = null } = {}) {
  const layout = computeSequenceLayout(spec);
  const { actors, placed, frames, width, height } = layout;

  const defs = `<defs>`
    + `<marker id="${SQ_ARROW_SYNC}" markerWidth="12" markerHeight="10" refX="9.5" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,4 L0,8 Z" fill="${SQ_MLINE}"/></marker>`
    + `<marker id="${SQ_ARROW_RET}" markerWidth="13" markerHeight="10" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,0 L11,4 L1,8" fill="none" stroke="${SQ_RET}" stroke-width="1.4"/></marker>`
    + dropShadowFilter(SQ_SHADOW_ID, [-20, -30, 140, 170], 1.2, 1.3, 0.4)
    + `</defs>`;

  const parts = [];

  // Layer 1 — alt/opt/loop frames, behind everything.
  for (const frame of frames) {
    const x0 = seqActorX(frame.minI) - SQ_COL_W / 2 + 14;
    const x1 = seqActorX(frame.maxI) + SQ_COL_W / 2 - 14;
    const y1 = frame.y1 || frame.y0 + 24;
    parts.push(`<rect x="${x0}" y="${frame.y0}" width="${x1 - x0}" height="${y1 - frame.y0}" rx="5" fill="#F5F8FB" fill-opacity="0.5" stroke="#9DAEC0" stroke-width="1.2"/>`);
    // Folded-corner tab carrying "ALT  <label>".
    const tabW = approxTextWidthPx(`${frame.kind.toUpperCase()}  ${frame.label}`) + 16;
    parts.push(`<path d="M${x0},${frame.y0} h${tabW} l-9,15 h-${tabW - 9} z" fill="#DCE7F1" stroke="#9DAEC0" stroke-width="1"/>`);
    parts.push(`<text x="${x0 + 8}" y="${frame.y0 + 12}" font-size="10.5" font-weight="700" fill="#3C5A75">${esc(frame.kind.toUpperCase())} <tspan font-weight="400">${esc(frame.label)}</tspan></text>`);
    for (const branch of frame.elses) {
      parts.push(`<line x1="${x0}" y1="${branch.y}" x2="${x1}" y2="${branch.y}" stroke="#9DAEC0" stroke-width="1" stroke-dasharray="5,3"/>`);
      parts.push(`<text x="${x0 + 8}" y="${branch.y - 4}" font-size="10" font-style="italic" fill="#5B7088">[${esc(branch.label)}]</text>`);
    }
  }

  // Layer 2 — lifelines.
  actors.forEach((_, i) => {
    const x = seqActorX(i);
    parts.push(`<line x1="${x}" y1="${SQ_TOP + SQ_HEAD_H}" x2="${x}" y2="${height - SQ_BOT + 8}" stroke="${SQ_LIFE}" stroke-width="1.2" stroke-dasharray="3,4"/>`);
  });

  // Layer 3 — notes and messages.
  for (const item of placed) {
    if (item.type === 'note') {
      const x0 = seqActorX(item.lo) - SQ_HEAD_W / 2, x1 = seqActorX(item.hi) + SQ_HEAD_W / 2;
      const lines = wrapTextPx(item.text, (x1 - x0) - 18);
      const h = item.h ?? Math.max(SQ_NOTE - 10, lines.length * SQ_NOTE_LINE_H + 12);
      parts.push(`<rect x="${x0}" y="${item.y - 4}" width="${x1 - x0}" height="${h}" rx="3" fill="${AMBER.fill}" stroke="${AMBER.stroke}" filter="url(#${SQ_SHADOW_ID})"/>`);
      for (const [i, line] of lines.entries()) {
        parts.push(`<text x="${(x0 + x1) / 2}" y="${item.y + 12 + i * SQ_NOTE_LINE_H}" text-anchor="middle" font-size="12.5" fill="${SQ_INK}">${esc(line)}</text>`);
      }
      continue;
    }
    if (item.self) {
      const x = seqActorX(item.fi);
      parts.push(`<path d="M${x},${item.y} h36 v18 h-32" fill="none" stroke="${SQ_MLINE}" stroke-width="1.5" marker-end="url(#${SQ_ARROW_SYNC})"/>`);
      parts.push(seqLabel(x + 42, item.y + 1, item.text, 'start'));
    } else {
      const from = seqActorX(item.fi), to = seqActorX(item.ti);
      const dir = to > from ? 1 : -1;   // stop one px short so the head lands clean
      const stroke = item.ret ? SQ_RET : SQ_MLINE;
      const dash = item.ret
        ? ` stroke-dasharray="6,3" marker-end="url(#${SQ_ARROW_RET})"`
        : ` marker-end="url(#${SQ_ARROW_SYNC})"`;
      parts.push(`<line x1="${from}" y1="${item.y}" x2="${to - dir}" y2="${item.y}" stroke="${stroke}" stroke-width="1.5"${dash}/>`);
      parts.push(seqLabel((from + to) / 2, item.y - 7, item.text, 'middle', item.ret));
    }
  }

  // Layer 4 — actor headers, painted last so they mask any label that rose
  // into their band.
  actors.forEach((actor, i) => {
    const x = seqActorX(i);
    const human = actor.kind === 'actor';
    const fill = human ? '#6B4FA0' : SAP_BLUE.fill;
    const stroke = human ? '#553F80' : SAP_BLUE.stroke;
    parts.push(`<rect x="${x - SQ_HEAD_W / 2}" y="${SQ_TOP}" width="${SQ_HEAD_W}" height="${SQ_HEAD_H}" rx="7" fill="${fill}" stroke="${stroke}" filter="url(#${SQ_SHADOW_ID})"/>`);
    if (human) {
      // Stick figure marking a person rather than a system.
      const gx = x - SQ_HEAD_W / 2 + 12, gy = SQ_TOP + 13;
      parts.push(`<circle cx="${gx}" cy="${gy}" r="3.2" fill="none" stroke="#FFFFFF" stroke-width="1.3"/><line x1="${gx}" y1="${gy + 3}" x2="${gx}" y2="${gy + 9}" stroke="#FFFFFF" stroke-width="1.3"/><line x1="${gx - 3}" y1="${gy + 5}" x2="${gx + 3}" y2="${gy + 5}" stroke="#FFFFFF" stroke-width="1.3"/>`);
    }
    const lines = wrapTextPx(actor.label, SQ_HEAD_W - 18);
    const firstBaseline = SQ_TOP + SQ_HEAD_H / 2 - (lines.length - 1) * 8 + 5;
    for (const [li, line] of lines.entries()) {
      parts.push(`<text x="${x}" y="${firstBaseline + li * SQ_NOTE_LINE_H}" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">${esc(line)}</text>`);
    }
  });

  const caption = title || spec.title;
  return svgDocument({
    width,
    height,
    body: [
      defs,
      backdrop(width, height),
      caption ? `<text x="${width / 2}" y="32" text-anchor="middle" font-size="15" font-weight="700" fill="${INK.heading}">${esc(caption)}</text>` : '',
      parts.join('\n'),
    ],
  });
}

export function sequenceDiagramMetrics(spec = {}) {
  const { width, height } = computeSequenceLayout(spec);
  return metricsOf(width, height);
}

// ══════════════════════════════════════════════════════════════════
// 8. Process map  (pair 7)
// ══════════════════════════════════════════════════════════════════
//
// spec: { nodes:[{ id, label, num? }], edges:[{ from, to, label? }] }
//
// Lays a small process DAG into left→right layers by longest path, then draws
// numbered cards joined by bezier connectors. One card = one business process.
//
// Boustrophedon wrap: a chain longer than PM_MAX_COLS folds onto another row
// instead of growing without bound to the right, because a very wide single-row
// image gets downscaled hard by markdown viewers (→ unreadably small text).
// Rows alternate direction (row 0 L→R, row 1 R→L, …) and join with a vertical
// U-turn at the fold. Maps of ≤ PM_MAX_COLS columns lay out exactly as before.

const PM_NW        = 200;
const PM_PAD_X     = 36;
const PM_PAD_TOP   = 58;
const PM_PAD_BOT   = 30;
const PM_ARROW_GAP = 116;
const PM_ROW_GAP   = 28;
const PM_LINE_H    = 16;
const PM_MAX_COLS  = 4;
const PM_BAND_GAP  = 64;   // vertical room between rows, incl. the fold connector
const PM_MIN_ROW_H = 60;
const PM_ARROW_ID  = 'pmar';
const PM_SHADOW_ID = 'pmsh';

/**
 * Card height from its wrapped label.
 *
 * QUIRK: the measuring budget (PM_NW − 56) is narrower than the budget the
 * painter uses (PM_NW − 50 numbered, PM_NW − 24 plain), so a label that wraps
 * here may fit on fewer lines when painted. Frozen: card heights and therefore
 * every downstream y-coordinate depend on this exact budget.
 */
function pmMeasureNode(node) {
  const lines = wrapLabel(node.label, PM_NW - 56);
  return { lines, h: Math.max(56, lines.length * PM_LINE_H + 26) };
}

/** One layout pass shared by the builder and its metrics twin. */
function computeProcessMapLayout(spec = {}) {
  const nodes = spec.nodes || [], edges = spec.edges || [];
  const ids = nodes.map(n => n.id);

  // Longest-path layering: relax layer[v] ≥ layer[u]+1 for every edge u→v
  // until nothing moves. A DAG settles in at most |ids| passes.
  const preds = Object.fromEntries(ids.map(id => [id, []]));
  for (const e of edges) if (preds[e.to]) preds[e.to].push(e.from);
  const layer = Object.fromEntries(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const id of ids) {
      for (const p of preds[id]) {
        if (layer[id] < layer[p] + 1) { layer[id] = layer[p] + 1; moved = true; }
      }
    }
    if (!moved) break;
  }

  // Numeric-keyed object → Object.entries walks layers in ascending order.
  const byLayer = {};
  for (const n of nodes) (byLayer[layer[n.id]] ||= []).push(n);
  const measured = Object.fromEntries(nodes.map(n => [n.id, pmMeasureNode(n)]));
  const totalCols = Math.max(...Object.values(layer)) + 1;

  const colH = {};
  for (const [lyr, group] of Object.entries(byLayer)) {
    colH[lyr] = group.reduce((sum, n) => sum + measured[n.id].h, 0) + (group.length - 1) * PM_ROW_GAP;
  }

  // Fold the column sequence into balanced rows, alternating direction.
  const rowCount = Math.max(1, Math.ceil(totalCols / PM_MAX_COLS));
  const perRow = Math.ceil(totalCols / rowCount);
  const rowOf = {}, visColOf = {};
  for (let l = 0; l < totalCols; l++) {
    const r = Math.floor(l / perRow), slot = l % perRow;
    const colsInRow = Math.min(perRow, totalCols - r * perRow);
    rowOf[l] = r;
    visColOf[l] = (r % 2 === 0) ? slot : (colsInRow - 1 - slot);
  }

  // Row band heights, then tops.
  const rowH = [], rowTop = [];
  for (let r = 0; r < rowCount; r++) {
    let h = PM_MIN_ROW_H;
    for (let l = r * perRow; l < Math.min(totalCols, (r + 1) * perRow); l++) h = Math.max(h, colH[l] || PM_MIN_ROW_H);
    rowH[r] = h;
  }
  let band = PM_PAD_TOP;
  for (let r = 0; r < rowCount; r++) { rowTop[r] = band; band += rowH[r] + PM_BAND_GAP; }

  // Place cards, each column stack vertically centred in its row band.
  const pos = {};
  for (const [lyr, group] of Object.entries(byLayer)) {
    const l = +lyr, r = rowOf[l];
    const x = PM_PAD_X + visColOf[l] * (PM_NW + PM_ARROW_GAP);
    let y = rowTop[r] + (rowH[r] - colH[l]) / 2;
    for (const n of group) {
      const m = measured[n.id];
      pos[n.id] = { x, y, w: PM_NW, h: m.h, cy: y + m.h / 2, lines: m.lines, num: n.num, layer: l, row: r };
      y += m.h + PM_ROW_GAP;
    }
  }

  return {
    nodes, edges, pos,
    width: PM_PAD_X * 2 + perRow * PM_NW + (perRow - 1) * PM_ARROW_GAP,
    height: rowTop[rowCount - 1] + rowH[rowCount - 1] + PM_PAD_BOT,
  };
}

/** Bezier connector path, routed from the two cards' relative placement. */
function pmEdgePath(a, b) {
  if (b.row === a.row + 1 && b.layer === a.layer + 1) {
    // Snake fold: consecutive columns that wrapped share the turn column, so
    // drop a vertical U-turn out of a's bottom into b's top.
    const cxA = a.x + a.w / 2, cxB = b.x + b.w / 2, reach = PM_BAND_GAP * 0.55;
    return `M${cxA},${a.y + a.h} C${cxA},${a.y + a.h + reach} ${cxB},${b.y - reach} ${cxB},${b.y - 2}`;
  }
  if (b.x > a.x) {
    const x1 = a.x + a.w, x2 = b.x, mid = (x1 + x2) / 2;
    return `M${x1},${a.cy} C${mid},${a.cy} ${mid},${b.cy} ${x2 - 2},${b.cy}`;
  }
  if (a.x === b.x) {
    // Same column → bulge out to the right and come back.
    const x = a.x + a.w, bulge = 26;
    return `M${x},${a.cy} C${x + bulge},${a.cy} ${x + bulge},${b.cy} ${x},${b.cy}`;
  }
  const x1 = a.x, x2 = b.x + b.w, mid = (x1 + x2) / 2;
  return `M${x1},${a.cy} C${mid},${a.cy} ${mid},${b.cy} ${x2 + 2},${b.cy}`;
}

export function renderProcessMapSVG(spec = {}, { lang = 'ko', title = null } = {}) {
  const layout = computeProcessMapLayout(spec);
  const { nodes, edges, pos, width, height } = layout;

  const defs = `<defs>`
    + solidArrowMarker(PM_ARROW_ID, INK.edge)
    + dropShadowFilter(PM_SHADOW_ID, [-15, -25, 130, 150], 1.4, 1.5, 0.45)
    + `</defs>`;

  const parts = [];

  // Connectors first so cards sit on top of them.
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    parts.push(`<path d="${pmEdgePath(a, b)}" fill="none" stroke="${INK.edge}" stroke-width="1.7" marker-end="url(#${PM_ARROW_ID})"/>`);
  }

  for (const node of nodes) {
    const p = pos[node.id];
    parts.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9" fill="#EAF1F8" stroke="${PANEL.stroke}" stroke-width="1.5" filter="url(#${PM_SHADOW_ID})"/>`);
    const numbered = p.num != null;
    if (numbered) {
      const bx = p.x + 20, by = p.y + p.h / 2;
      parts.push(`<circle cx="${bx}" cy="${by}" r="13" fill="${SAP_BLUE.fill}" stroke="${SAP_BLUE.stroke}" stroke-width="1"/>`);
      parts.push(`<text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#FFFFFF">${esc(p.num)}</text>`);
    }
    // Label column sits right of the badge when there is one.
    const textX = p.x + (numbered ? 40 : 14), textW = p.w - (numbered ? 50 : 24);
    const lines = wrapLabel(node.label, textW);
    const firstBaseline = p.cy - (lines.length - 1) * 8 + 4;
    for (const [i, line] of lines.entries()) {
      parts.push(`<text x="${textX + textW / 2}" y="${firstBaseline + i * PM_LINE_H}" text-anchor="middle" font-size="13" font-weight="600" fill="#234">${esc(line)}</text>`);
    }
  }

  const caption = title || spec.title;
  return svgDocument({
    width,
    height,
    body: [
      defs,
      backdrop(width, height),
      caption ? `<text x="${width / 2}" y="34" text-anchor="middle" font-size="16" font-weight="700" fill="${INK.heading}">${esc(caption)}</text>` : '',
      parts.join('\n'),
    ],
  });
}

export function processMapMetrics(spec = {}) {
  const { width, height } = computeProcessMapLayout(spec);
  return metricsOf(width, height);
}

// ══════════════════════════════════════════════════════════════════
// 9. Multi-pane ALV  (pair 8)
// ══════════════════════════════════════════════════════════════════
//
// Many ABAP programs put two or more grids on one screen — docking+splitter
// (top/bottom), side-by-side comparison, or a tabstrip page per grid. A
// single-grid PNG cannot show the click-to-drill interaction a reader needs,
// so each pane gets its own title bar and grid and the panes are joined by an
// interaction caption: the user-visible flow ("double-click a row up top → the
// bottom refreshes") is documented IN the image, not in prose elsewhere.
//
// Schema (within ALV_IMAGE_SPEC):
//   { layout: 'split-vertical' | 'split-horizontal' | 'tabstrip',
//     interaction: '상단 더블클릭 → 하단 갱신',
//     panes: [ { title, columns, sampleRows, maxRows }
//            , { title, columns, sampleRows: [], placeholder }
//            , { title, treeRows } ] }
// When `panes` is absent the legacy single-pane `{columns, sampleRows, maxRows}`
// shape still works.

const PANE_TITLE_H   = 24;
const PANE_GAP       = 8;
const PANE_INTER_H   = 28;
const PANE_PLACE_H   = 60;
const PANE_PAD_TOP   = 10;
const PANE_PAD_BOT   = 10;
const PANE_CAPTION_H = 36;
const PANE_TREE_ROW_H = 22;
const SIDE_DIVIDER_W = 4;
const SIDE_CANVAS_W  = 1400;

/** Strip the XML prologue and root <svg> so a document can be re-anchored. */
function innerSvgOf(svgString) {
  return svgString
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/^<svg[^>]*>\s*/, '')
    .replace(/<\/svg>\s*$/, '');
}

const paneIsEmpty = (pane) =>
  !pane?.treeRows && (!Array.isArray(pane?.sampleRows) || pane.sampleRows.length === 0);

/**
 * Body size of one pane.
 *
 * QUIRK: the ALV branch returns dimensions that are ALREADY multiplied by
 * RENDER_SCALE (that is what alvLayoutMetrics reports), while the tree and
 * placeholder branches return raw design units. Callers therefore mix units.
 * Frozen — see the QUIRK note on renderMultipaneAlvSVG.
 */
function paneBodyMetrics(pane, allocW) {
  if (pane?.treeRows) {
    return { width: allocW || 560, height: pane.treeRows.length * PANE_TREE_ROW_H + 10 };
  }
  if (paneIsEmpty(pane) && pane?.placeholder) {
    return { width: allocW || 900, height: PANE_PLACE_H };
  }
  return alvLayoutMetrics({ columns: pane?.columns || [], sampleRows: pane?.sampleRows || [], maxRows: pane?.maxRows });
}

const paneTitleBar = (x, y, width, caption, textX) => [
  `<rect x="${x}" y="${y}" width="${width}" height="${PANE_TITLE_H - 2}" fill="#E7E6E6" stroke="#888"/>`,
  `<text x="${textX}" y="${y + PANE_TITLE_H - 9}" font-weight="700" fill="#333">${esc(caption)}</text>`,
];

const panePlaceholderText = (cx, cy, text) =>
  `<text x="${cx}" y="${cy}" text-anchor="middle" fill="#888" font-style="italic">${esc(text)}</text>`;

/**
 * CL_GUI_ALV_TREE hierarchy, emitted WITHOUT a root <svg> so it can be placed
 * inside a parent via <g transform>.
 * treeRows: [{ level: 0|1|2, label, expanded?, selected? }]
 */
function renderAlvTreeInnerSVG({ treeRows = [], paneW = 560 } = {}) {
  return treeRows.map((row, i) => {
    const level = row.level || 0;
    const y = i * PANE_TREE_ROW_H;
    const indent = 10 + level * 16;
    const leaf = level >= 2;
    const glyph = leaf ? (row.selected ? '●' : '○') : (row.expanded === false ? '▶' : '▼');
    const textFill = row.selected ? INK.accent : (level === 0 ? INK.heading : '#222');
    const glyphFill = leaf ? (row.selected ? INK.accent : '#666') : textFill;

    const band = row.selected ? '#D4E6F5' : (i % 2 === 1 ? ALV_ROW_BAND : null);
    const parts = [];
    if (band) parts.push(`<rect x="0" y="${y}" width="${paneW}" height="${PANE_TREE_ROW_H}" fill="${band}"/>`);
    parts.push(`<text x="${indent}" y="${y + 15}" font-size="11" fill="${glyphFill}">${esc(glyph)}</text>`);
    parts.push(`<text x="${indent + 14}" y="${y + 15}" font-size="11" fill="${textFill}" font-weight="${level === 0 ? '700' : '400'}">${esc(row.label || '')}</text>`);
    return parts.join('\n');
  }).join('\n');
}

/** Geometry shared by the side-by-side builder and its metrics twin. */
function computeSideBySideLayout({ panes = [], splitRatio = [40, 60] } = {}) {
  const canvasW = SIDE_CANVAS_W;
  const leftW = Math.round(canvasW * splitRatio[0] / 100);
  const rightW = canvasW - leftW - SIDE_DIVIDER_W;

  const leftBody = paneBodyMetrics(panes[0], leftW);
  const rightBody = paneBodyMetrics(panes[1], rightW);
  // A right pane wider than its allocation is scaled down to fit, not clipped.
  const rightNaturalW = rightBody.width;
  const rightScale = rightNaturalW > rightW ? rightW / rightNaturalW : 1;
  const rightRenderH = Math.ceil(rightBody.height * rightScale);
  const bodyH = Math.max(leftBody.height, rightRenderH);

  return {
    canvasW, leftW, rightW, rightX: leftW + SIDE_DIVIDER_W,
    rightBody, rightNaturalW, rightScale, rightRenderH, bodyH,
    titleY: PANE_PAD_TOP,
    bodyY: PANE_PAD_TOP + PANE_TITLE_H,
    canvasH: PANE_PAD_TOP + PANE_TITLE_H + bodyH + PANE_CAPTION_H + PANE_PAD_BOT,
  };
}

/** Geometry shared by the stacked builder and its metrics twin. */
function computeStackedPaneLayout(panes) {
  let canvasH = PANE_PAD_TOP;
  let canvasW = 900;
  panes.forEach((pane, i) => {
    const body = paneBodyMetrics(pane);
    canvasH += PANE_TITLE_H + body.height;
    if (i < panes.length - 1) canvasH += PANE_GAP + PANE_INTER_H;
    if (body.width > canvasW) canvasW = body.width;
  });
  return { canvasW, canvasH: canvasH + PANE_PAD_BOT };
}

export function multipaneAlvMetrics({ panes = [], layout = 'split-horizontal', splitRatio = [40, 60] } = {}) {
  // QUIRK: unscaled, unlike every other branch. Frozen.
  if (!panes.length) return { width: 900, height: 100 };

  if (layout === 'split-vertical' && panes.length === 2) {
    const g = computeSideBySideLayout({ panes, splitRatio });
    return metricsOf(g.canvasW, g.canvasH);
  }
  const g = computeStackedPaneLayout(panes);
  return metricsOf(g.canvasW, g.canvasH);
}

/** Left | right composition, used for `layout: 'split-vertical'`. */
function renderSideBySideAlvSVG({ panes = [], splitRatio = [40, 60], interaction = '', lang = 'ko' } = {}) {
  const [leftPane, rightPane] = panes;
  const g = computeSideBySideLayout({ panes, splitRatio });
  const { leftW, rightW, rightX, titleY, bodyY, bodyH, canvasW, canvasH } = g;
  const parts = [];

  parts.push(...paneTitleBar(0, titleY, leftW, leftPane.title || 'Pane 1', 10));
  parts.push(`<rect x="0" y="${bodyY}" width="${leftW}" height="${bodyH}" fill="#FFF" stroke="${INK.gridLine}"/>`);
  if (leftPane.treeRows) {
    parts.push(`<g transform="translate(0, ${bodyY + 4})">${renderAlvTreeInnerSVG({ treeRows: leftPane.treeRows, paneW: leftW })}</g>`);
  } else if (paneIsEmpty(leftPane) && leftPane.placeholder) {
    parts.push(panePlaceholderText(leftW / 2, bodyY + bodyH / 2 + 4, leftPane.placeholder));
  } else {
    const grid = renderAlvLayoutSVG({ columns: leftPane.columns || [], sampleRows: leftPane.sampleRows || [], maxRows: leftPane.maxRows, lang });
    parts.push(`<g transform="translate(0, ${bodyY})">${innerSvgOf(grid)}</g>`);
  }

  parts.push(`<rect x="${leftW}" y="${titleY}" width="${SIDE_DIVIDER_W}" height="${PANE_TITLE_H - 2 + bodyH}" fill="#5A85AE"/>`);

  parts.push(...paneTitleBar(rightX, titleY, rightW, rightPane.title || 'Pane 2', rightX + 10));
  parts.push(`<rect x="${rightX}" y="${bodyY}" width="${rightW}" height="${bodyH}" fill="#FFF" stroke="${INK.gridLine}"/>`);
  if (paneIsEmpty(rightPane) && rightPane.placeholder) {
    parts.push(panePlaceholderText(rightX + rightW / 2, bodyY + bodyH / 2 + 4, rightPane.placeholder));
  } else {
    const grid = renderAlvLayoutSVG({ columns: rightPane.columns || [], sampleRows: rightPane.sampleRows || [], maxRows: rightPane.maxRows, lang });
    if (g.rightScale < 1) {
      // Nested viewport does the downscale; preserveAspectRatio pins top-left.
      parts.push(`<svg x="${rightX}" y="${bodyY}" width="${rightW}" height="${g.rightRenderH}" viewBox="0 0 ${g.rightNaturalW} ${g.rightBody.height}" preserveAspectRatio="xMinYMin meet">`);
      parts.push(innerSvgOf(grid));
      parts.push(`</svg>`);
    } else {
      parts.push(`<g transform="translate(${rightX}, ${bodyY})">${innerSvgOf(grid)}</g>`);
    }
  }

  const caption = `← ${esc(interaction || legendFor(lang).pane_caption)} →`;
  parts.push(`<text x="${canvasW / 2}" y="${bodyY + bodyH + 22}" text-anchor="middle" font-size="12" fill="${INK.accent}" font-weight="600">${caption}</text>`);

  return svgDocument({
    width: canvasW,
    height: canvasH,
    body: [backdrop(canvasW, canvasH), parts.join('\n')],
  });
}

export function renderMultipaneAlvSVG({ layout = 'split-horizontal', interaction = '', panes = [], splitRatio = [40, 60], lang = 'ko' } = {}) {
  if (!panes.length) return renderAlvLayoutSVG({ columns: [], sampleRows: [], lang });
  if (layout === 'split-vertical' && panes.length === 2) {
    return renderSideBySideAlvSVG({ panes, splitRatio, interaction, lang });
  }

  // Stacked composition — the default, and the fallback for 'tabstrip' and for
  // a 'split-vertical' request that does not have exactly two panes.
  //
  // QUIRK: multipaneAlvMetrics already returns RENDER_SCALE-multiplied values
  // (and paneBodyMetrics feeds it scaled ALV heights), yet those values are
  // used here as the design-space viewBox and scaled a SECOND time for the
  // declared width/height. The result is a canvas ~1.15× larger than the
  // content that fills it, and a declared box ~1.15× larger than the metrics
  // the rasterizer sizes its window from. Both are frozen: fixing the units
  // would move every embedded PNG in every existing spec. Do not "correct"
  // this without a decision record.
  const { width: canvasW, height: canvasH } = multipaneAlvMetrics({ panes, layout: 'split-horizontal' });

  const parts = [];
  let cursorY = PANE_PAD_TOP;
  panes.forEach((pane, i) => {
    parts.push(...paneTitleBar(0, cursorY, canvasW, pane.title || `Pane ${i + 1}`, 14));
    cursorY += PANE_TITLE_H;

    const body = paneBodyMetrics(pane);
    if (paneIsEmpty(pane) && pane.placeholder) {
      parts.push(`<rect x="10" y="${cursorY}" width="${canvasW - 20}" height="${body.height}" fill="#FAFAFA" stroke="${INK.gridLine}" stroke-dasharray="4,3"/>`);
      parts.push(panePlaceholderText(canvasW / 2, cursorY + body.height / 2 + 4, pane.placeholder));
    } else {
      const grid = renderAlvLayoutSVG({ columns: pane.columns || [], sampleRows: pane.sampleRows || [], maxRows: pane.maxRows, lang });
      parts.push(`<g transform="translate(0, ${cursorY})">${innerSvgOf(grid)}</g>`);
    }
    cursorY += body.height;

    if (i < panes.length - 1) {
      cursorY += PANE_GAP;
      const caption = interaction ? `↓ ${esc(interaction)}` : `↓`;
      parts.push(`<text x="${canvasW / 2}" y="${cursorY + 18}" text-anchor="middle" font-size="12" fill="${INK.accent}" font-weight="600">${caption}</text>`);
      cursorY += PANE_INTER_H;
    }
  });

  return svgDocument({
    width: canvasW,
    height: canvasH,
    body: [backdrop(canvasW, canvasH), parts.join('\n')],
  });
}

// ══════════════════════════════════════════════════════════════════
// 10. Rasterizer — SVG string → PNG buffer via a system headless browser
// ══════════════════════════════════════════════════════════════════

/**
 * First usable Chromium-family binary, or null.
 *
 * Returning null is a SUPPORTED outcome, not an error: rasterizeSvgToPng
 * propagates it and every caller keeps its text/wireframe fallback, so spec
 * generation still succeeds on a CI box with no browser installed.
 */
function findBrowser() {
  const candidates = platform() === 'win32'
    ? [
      // Edge, modern x64 path — the Win11 default since 2022.
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      // Edge, WOW6432 path — older Win10 and downgraded installs.
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
    : platform() === 'darwin'
      ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
      : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];

  for (const candidate of candidates) {
    const isPath = candidate.includes('/') || candidate.includes('\\');
    if (isPath) {
      if (existsSync(candidate)) return candidate;
    } else {
      const probe = spawnSync('which', [candidate]);
      if (probe.status === 0 && probe.stdout?.toString().trim()) return candidate;
    }
  }
  return null;
}

// ── Minimal PNG surgery (zlib + Buffer only, no native deps) ──────

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(payload), 0);
  return Buffer.concat([len, payload, crc]);
}

/** Bytes per pixel by PNG colour type (grey, RGB, palette, grey+A, RGBA). */
const PNG_BYTES_PER_PIXEL = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Crop an 8-bit non-interlaced PNG to its top-left (targetW × targetH).
 *
 * Lossless without re-filtering: every PNG filter mode (None/Sub/Up/Average/
 * Paeth) references only pixels to the LEFT and ABOVE, so the retained
 * top-left rectangle keeps its original filter bytes valid. Chrome/Edge
 * headless screenshots are always 8-bit RGB/RGBA non-interlaced, which covers
 * everything rasterizeSvgToPng can produce. Throws on any other shape; the
 * caller then keeps the uncropped buffer.
 */
function cropPngTopLeft(pngBuf, targetW, targetH) {
  if (!pngBuf.slice(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');

  let offset = 8;
  let ihdr = null;
  const idatParts = [];
  const leadingChunks = [];
  while (offset < pngBuf.length) {
    const len = pngBuf.readUInt32BE(offset);
    const type = pngBuf.toString('ascii', offset + 4, offset + 8);
    const data = pngBuf.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idatParts.push(data);
    else if (type === 'IEND') break;
    else if (idatParts.length === 0) leadingChunks.push({ type, data });
    offset += 8 + len + 4;
  }
  if (!ihdr || idatParts.length === 0) throw new Error('invalid PNG');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  if (ihdr.readUInt8(8) !== 8 || ihdr.readUInt8(12) !== 0) throw new Error('unsupported PNG variant');
  const colorType = ihdr.readUInt8(9);
  const bpp = PNG_BYTES_PER_PIXEL[colorType];
  if (!bpp) throw new Error('unsupported PNG color type ' + colorType);
  if (targetW >= width && targetH >= height) return pngBuf;

  const cropW = Math.min(targetW, width);
  const cropH = Math.min(targetH, height);
  const raw = inflateSync(Buffer.concat(idatParts));
  const srcStride = 1 + width * bpp;      // leading byte is the filter mode
  const dstStride = 1 + cropW * bpp;
  const cropped = Buffer.alloc(cropH * dstStride);
  for (let row = 0; row < cropH; row++) {
    cropped[row * dstStride] = raw[row * srcStride];
    raw.copy(cropped, row * dstStride + 1, row * srcStride + 1, row * srcStride + 1 + cropW * bpp);
  }

  const newIhdr = Buffer.from(ihdr);
  newIhdr.writeUInt32BE(cropW, 0);
  newIhdr.writeUInt32BE(cropH, 4);
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', newIhdr),
    ...leadingChunks.map(c => pngChunk(c.type, c.data)),
    pngChunk('IDAT', deflateSync(cropped)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Browser-chrome compensation.
//
// Even headless, Chrome/Edge reserves pixels for title bar, tab strip, omnibox
// and scrollbar gutter, so `--window-size=W,H` yields an INNER viewport of
// about (W−24) × (H−92). Measured on Edge 147 under both `--headless` and
// `--headless=new`; the same subtraction has held since Chrome 60 on Windows.
// Uncompensated, a 900×328 window rendered only the first 876×236 px of
// content and painted the rest white — reported as "image cut off halfway".
//
// So: pad the window generously (~1.5× the observed shortfall, to absorb
// version drift), then crop the screenshot back to exactly W × H. The reserved
// area falls outside the crop box, leaving a pixel-exact target-size PNG.
const CHROME_W_SLACK = 40;
const CHROME_H_SLACK = 140;
const RASTER_TIMEOUT_MS = 30000;

export async function rasterizeSvgToPng(svg, { width, height } = {}) {
  const browser = findBrowser();
  if (!browser) return null;

  const dir = mkdtempSync(join(tmpdir(), 'sc4sap-svg-'));
  try {
    const htmlPath = join(dir, 'in.html');
    const pngPath = join(dir, 'out.png');

    // INLINE the SVG rather than <img src="in.svg">: inlining makes the
    // browser paint it during the initial parse, which removes a load-vs-paint
    // race that could clip the output on its own.
    const inlineSvg = String(svg).replace(/^<\?xml[^?]*\?>\s*/, '');
    writeFileSync(
      htmlPath,
      `<!doctype html><html><head><meta charset="utf-8">`
      + `<style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>`
      + `</head><body>${inlineSvg}</body></html>`,
      'utf8',
    );

    // Async spawn (not spawnSync) so callers can Promise.all() several jobs and
    // run one headless browser per image concurrently.
    await new Promise((resolve, reject) => {
      const child = spawn(browser, [
        '--headless', '--disable-gpu', '--hide-scrollbars',
        // Pin DPR=1 so --window-size maps 1:1 to screenshot pixels no matter
        // what the host's display scaling is set to (125 % / 150 %).
        '--force-device-scale-factor=1',
        '--default-background-color=FFFFFFFF',
        `--screenshot=${pngPath}`,
        `--window-size=${width + CHROME_W_SLACK},${height + CHROME_H_SLACK}`,
        'file:///' + htmlPath.replace(/\\/g, '/'),
      ], { windowsHide: true, stdio: 'ignore' });

      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        reject(new Error('headless browser timeout (30s)'));
      }, RASTER_TIMEOUT_MS);

      child.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`headless browser exited with code ${code}`));
      });
      child.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (!existsSync(pngPath)) return null;
    const padded = readFileSync(pngPath);
    try {
      return cropPngTopLeft(padded, width, height);
    } catch {
      // Unexpected PNG shape: hand back the padded buffer rather than lose the
      // render — oversized, but visually complete.
      return padded;
    }
  } catch {
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// ══════════════════════════════════════════════════════════════════
// 11. Convenience driver — one image-spec → the three document slots
// ══════════════════════════════════════════════════════════════════

/**
 * Render the Selection / ALV / Process-Flow images for one spec.
 *
 * spec: { selection?: { fields, optionFields, … },
 *         alv?: { columns, sampleRows, maxRows? } | { panes, layout, … },
 *         processFlow?: string[] | { nodes, edges },
 *         lang? }
 *
 * Returns { selection, alv, processFlow }, each either
 * `{ pngBuffer, width, height }` or null. A null slot tells the caller to fall
 * back to its cell-border wireframe / Mermaid text for that section only.
 *
 * The three slots rasterize CONCURRENTLY — one headless browser each — and are
 * fully independent: a timeout or failure in one leaves only that slot null.
 * `lang` reaches every sub-renderer so auto-derived legends come out in the
 * spec's language; omitting it keeps the renderers' 'ko' default.
 */
export async function renderScreenImages({ selection, alv, processFlow, lang = 'ko' } = {}) {
  const out = { selection: null, alv: null, processFlow: null };
  const jobs = [];

  // Each job swallows its own errors so one bad slot cannot fail the others.
  const slot = (key, build) => jobs.push((async () => {
    try {
      const { svg, width, height } = build();
      const png = await rasterizeSvgToPng(svg, { width, height });
      if (png) out[key] = { pngBuffer: png, width, height };
    } catch { /* leave the slot null → caller's fallback */ }
  })());

  if (selection) {
    slot('selection', () => ({
      svg: renderSelectionScreenSVG({ ...selection, lang }),
      // Size the viewport from the shared metrics helper, never from a guess:
      // a long label widens the SVG, and a hardcoded 900 used to crop it.
      ...selectionScreenMetrics(selection),
    }));
  }

  if (alv) {
    // Shape detection lives here, not in the per-spec drivers, so existing
    // callers keep working: `panes` routes to the multipane composer, anything
    // else takes the single-grid path unchanged.
    const multipane = Array.isArray(alv.panes) && alv.panes.length > 0;
    slot('alv', () => ({
      svg: multipane ? renderMultipaneAlvSVG({ ...alv, lang }) : renderAlvLayoutSVG({ ...alv, lang }),
      ...(multipane ? multipaneAlvMetrics({ ...alv }) : alvLayoutMetrics(alv)),
    }));
  }

  // processFlow accepts two shapes:
  //   string[]         → legacy linear chain. The xlsx embed wants this
  //                      HORIZONTAL (2026-05-24 mandate: 가로 레이아웃 강제,
  //                      가시성 우선).
  //   { nodes, edges } → branching flowchart, mirroring the Markdown spec's
  //                      decisions, exception side-paths and loop-backs.
  const asGraph = processFlow && !Array.isArray(processFlow) && Array.isArray(processFlow.nodes);
  if (asGraph || (Array.isArray(processFlow) && processFlow.length > 0)) {
    slot('processFlow', () => ({
      svg: asGraph
        ? renderFlowchartSVG(processFlow, { lang })
        : renderProcessFlowSVG(processFlow, { lang, orientation: 'horizontal' }),
      ...(asGraph
        ? flowchartMetrics(processFlow)
        : processFlowMetrics(processFlow, { orientation: 'horizontal' })),
    }));
  }

  await Promise.all(jobs);
  return out;
}
