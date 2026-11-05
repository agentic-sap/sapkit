// sapkit — Markdown document → one self-contained HTML file (left TOC + body).
//
// WHY THIS EXISTS
//   Four procedures write Markdown for people: create-program (`spec.md`, with
//   `## Approval` appended once approved), deep-interview (the requirements
//   brief, with YAML front matter and the `<!-- SAPKIT:DIG-OUT -->` marker),
//   package-to-process (a process document with its own in-document TOC links,
//   PNGs next to it and `<details>` FALLBACK blocks holding mermaid source) and
//   compare-programs (the comparison report). A reader who receives such a file
//   by mail sees raw `|---|` and `![](…)` and none of the pictures. This tool
//   makes the same sections, tables and images into ONE file that opens
//   offline in any browser, with a table of contents on the left.
//
// SCOPE IS THE SYNTAX THOSE DOCUMENTS USE — NOT ALL OF MARKDOWN
//   ATX headings · paragraphs · bold/italic(/strike) · inline code · links ·
//   images · fenced code · GFM tables · nested bullet/numbered lists · task
//   lists · blockquotes · rules · line breaks · YAML front matter · HTML
//   comments (removed) · `<details>`/`<summary>`/`<br>` (the only raw HTML that
//   passes). Not supported on purpose: setext headings, indented code blocks,
//   reference-style links, bare-URL autolinking, footnotes — none of the four
//   procedures writes them, and each one added is one more way to misread a
//   line the documents do write.
//
// HEADING IDS ARE GITHUB SLUGS
//   The documents carry their own links such as `#0-overview` or
//   `#1-process-<slug>`. Those were written against GitHub's anchor rule, so
//   every heading gets exactly that id, and the links keep working here.
//
// SAFETY
//   Every source string is escaped; the allow-list above is the only markup
//   that survives, and it survives without attributes (bar `open`). Link
//   targets other than http/https/mailto/#/relative are dropped. Images are
//   read from disk and embedded as data URIs — nothing is fetched, ever. The
//   page shell's CSP (html-page.mjs) is the second wall. This page carries no
//   script at all.
//
// CLI
//   node md-to-html.mjs <in.md> <out.html> [--lang <ko|en|ja>] [--draft]
//                       [--append <part.md>]... [--open]
//   Contract (stdout lines, exit codes) lives in html-page.mjs.
//
// node built-ins only.

import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, frameStrings, imageDataUri, renderPage, runCli } from './html-page.mjs';

// =============================================================
// GitHub-style slugs
// =============================================================

/**
 * The anchor GitHub gives a heading: lowercase, keep letters/marks/numbers/
 * underscore/space/hyphen, drop everything else (punctuation, emoji), then
 * each space becomes a hyphen. No trimming — GitHub does not trim either.
 */
export function githubSlug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** A slugger for one combined document: repeats become `-1`, `-2`, … (github-slugger's rule). */
export function createSlugger() {
  const occurrences = new Map();
  return (text) => {
    const original = githubSlug(text);
    let slug = original;
    while (occurrences.has(slug)) {
      const count = occurrences.get(original) + 1;
      occurrences.set(original, count);
      slug = `${original}-${count}`;
    }
    occurrences.set(slug, 0);
    return slug;
  };
}

// =============================================================
// Small text helpers
// =============================================================

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':',
  tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')', period: '.',
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

function unescapeBackslashes(text) {
  return text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** Visible text of rendered inline HTML — what a heading's slug is made from. */
function plainText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ''));
}

function isBlank(line) {
  return /^\s*$/.test(line);
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

/** Tabs in the indentation become spaces (stops of 4) so indent arithmetic holds. */
function expandLeadingTabs(line) {
  return line.replace(/^[ \t]+/, (ws) => {
    let col = 0;
    for (const ch of ws) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
    return ' '.repeat(col);
  });
}

// =============================================================
// Link and image targets
// =============================================================

const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

/** The scheme a browser would see, after the tricks (entities, case, controls, spaces) are undone. */
function schemeOf(value) {
  const probe = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (/^[a-z]:[\\/]/.test(probe)) return null; // a Windows drive path, not a scheme
  const m = /^([a-z][a-z0-9+.-]*):/.exec(probe);
  return m ? m[1] : null;
}

/** http/https/mailto, `#…` and relative paths pass; anything else → null (render text only). */
function safeHref(raw) {
  const value = decodeEntities(unescapeBackslashes(raw)).trim();
  const scheme = schemeOf(value);
  if (scheme && !ALLOWED_SCHEMES.has(scheme)) return null;
  return value;
}

function renderImage(rawSrc, alt, title, ctx) {
  const src = decodeEntities(unescapeBackslashes(rawSrc)).trim();
  const altAttr = escapeHtml(alt);
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  const scheme = schemeOf(src);
  if (scheme === 'http' || scheme === 'https' || src.startsWith('//')) {
    // Never downloaded: the reader gets a link to it instead.
    return `<a class="sk-img-remote" href="${escapeHtml(src)}"${titleAttr}>`
      + `${escapeHtml(ctx.t.remoteImage)}: ${escapeHtml(alt || src)}</a>`;
  }
  const missing = `<span class="sk-img-missing" role="img" aria-label="${altAttr}">`
    + `${escapeHtml(ctx.t.missingImage)}: ${escapeHtml(alt || src)}</span>`;
  if (scheme || !src) return missing;
  let path = src.replace(/[?#].*$/, '');
  try { path = decodeURIComponent(path); } catch { /* keep it as written */ }
  let uri = null;
  // Not confined to the document's folder on purpose: the sources are documents
  // sapkit itself wrote, and their pictures may sit in a sibling folder. Only
  // bytes that sniff as an image are embedded; anything else is the placeholder.
  try { uri = imageDataUri(readFileSync(resolve(ctx.baseDir, path))); } catch { /* missing is not a failure */ }
  return uri ? `<img src="${uri}" alt="${altAttr}"${titleAttr}>` : missing;
}

// =============================================================
// Inline
// =============================================================
// Stage 1 walks the text and turns everything that must not be touched by
// emphasis (code spans, escapes, links, images, allowed tags) into rendered
// HTML parked in `slots`, leaving a \u0000N\u0000 placeholder. Stage 2 escapes
// what is left, applies emphasis, and puts the slots back.

// Sticky (y) patterns: matched at a position without slicing the string.
const ALLOWED_TAG = /<(\/?)(details|summary|br)\b([^<>]*)>/iy;
const AUTOLINK = /<([a-z][a-z0-9+.-]*:[^\s<>]*)>/iy;
const BACKTICKS = /`+/y;
const HARD_BREAK = / {2,}\n/y;

function matchAt(re, src, i) {
  re.lastIndex = i;
  return re.exec(src);
}

/** Allowed raw tags, normalised. `stack` keeps <details>/<summary> balanced within one container. */
function renderAllowedTag(match, stack) {
  const [, closing, rawName, attrs] = match;
  const name = rawName.toLowerCase();
  if (name === 'br') return '<br>';
  if (!closing) {
    stack.push(name);
    return name === 'details' && /(^|\s)open(\s|=|\/|$)/i.test(attrs) ? '<details open>' : `<${name}>`;
  }
  if (!stack.includes(name)) return ''; // a stray closer is dropped
  let html = '';
  while (stack.length) {
    const top = stack.pop();
    html += `</${top}>`;
    if (top === name) break;
  }
  return html;
}

function closeStack(stack) {
  let html = '';
  while (stack.length) html += `</${stack.pop()}>`;
  return html;
}

/** Index of the `]` matching the `[` at `open`, or -1. */
function findCloseBracket(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return i;
  }
  return -1;
}

/** Parse `(dest "title")` starting at `start` (the `(`); returns { dest, title, end } or null. */
function parseLinkTail(src, start) {
  if (src[start] !== '(') return null;
  let i = start + 1;
  const skipSpace = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  skipSpace();
  let dest = '';
  if (src[i] === '<') {
    const close = src.indexOf('>', i);
    if (close < 0 || src.slice(i, close).includes('\n')) return null;
    dest = src.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const from = i;
    while (i < src.length && !/\s/.test(src[i])) {
      const ch = src[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      i++;
    }
    dest = src.slice(from, i);
  }
  skipSpace();
  let title = '';
  const quote = src[i];
  if (quote === '"' || quote === "'" || quote === '(') {
    const closer = quote === '(' ? ')' : quote;
    const close = src.indexOf(closer, i + 1);
    if (close < 0) return null;
    title = unescapeBackslashes(src.slice(i + 1, close));
    i = close + 1;
    skipSpace();
  }
  if (src[i] !== ')') return null;
  return { dest, title, end: i + 1 };
}

function applyEmphasis(html) {
  return html
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

function renderInline(src, ctx, stack = null) {
  const own = stack ?? [];
  const slots = [];
  const put = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === '\n') { out += `${put('<br>')}\n`; i += 2; continue; }
      if (next && ASCII_PUNCT.test(next)) { out += put(escapeHtml(next)); i += 2; continue; }
      out += ch; i++; continue;
    }
    if (ch === ' ') {
      const hard = matchAt(HARD_BREAK, src, i);
      if (hard) { out += `${put('<br>')}\n`; i += hard[0].length; continue; }
    }
    if (ch === '`') {
      const run = matchAt(BACKTICKS, src, i)[0];
      const closer = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
      closer.lastIndex = i + run.length;
      const close = closer.exec(src);
      if (!close) { out += run; i += run.length; continue; }
      let code = src.slice(i + run.length, close.index).replace(/\n/g, ' ');
      if (/^ [\s\S]* $/.test(code) && code.trim()) code = code.slice(1, -1);
      out += put(`<code>${escapeHtml(code)}</code>`);
      i = close.index + run.length;
      continue;
    }
    if (ch === '<') {
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4);
        if (end >= 0) { i = end + 3; continue; } // comments never reach the reader
      }
      const tag = matchAt(ALLOWED_TAG, src, i);
      if (tag) { out += put(renderAllowedTag(tag, own)); i += tag[0].length; continue; }
      const auto = matchAt(AUTOLINK, src, i);
      if (auto) {
        const href = safeHref(auto[1]);
        out += put(href ? `<a href="${escapeHtml(href)}">${escapeHtml(auto[1])}</a>` : escapeHtml(auto[1]));
        i += auto[0].length;
        continue;
      }
    }
    if ((ch === '!' && src[i + 1] === '[') || ch === '[') {
      const open = ch === '!' ? i + 1 : i;
      const close = findCloseBracket(src, open);
      const tail = close >= 0 ? parseLinkTail(src, close + 1) : null;
      if (tail) {
        const label = src.slice(open + 1, close);
        if (ch === '!') {
          out += put(renderImage(tail.dest, plainText(renderInline(label, ctx)), tail.title, ctx));
        } else {
          const text = renderInline(label, ctx);
          const href = safeHref(tail.dest);
          const title = tail.title ? ` title="${escapeHtml(tail.title)}"` : '';
          out += put(href === null ? text : `<a href="${escapeHtml(href)}"${title}>${text}</a>`);
        }
        i = tail.end;
        continue;
      }
    }
    out += ch;
    i++;
  }
  let html = applyEmphasis(escapeHtml(out));
  html = html.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
  return stack ? html : html + closeStack(own);
}

// =============================================================
// Block recognisers
// =============================================================

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const QUOTE = /^ {0,3}> ?/;
const HTML_LINE = /^ {0,3}<\/?(?:details|summary)(?:\s[^>]*)?>/i;
const COMMENT_START = /^ {0,3}<!--/;
const DELIMITER_ROW = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function parseFence(line) {
  const m = FENCE.exec(line);
  if (!m || (m[2][0] === '`' && m[3].includes('`'))) return null;
  return { indent: m[1].length, marker: m[2], info: m[3].trim() };
}

/** `- item`, `* item`, `1. item`, `1) item` → marker facts, or null. */
function parseListMarker(line) {
  if (RULE.test(line)) return null; // `* * *` is a rule, not an item
  const m = /^( {0,3})([-+*]|\d{1,9}[.)])(?:( +)(.*))?$/.exec(line);
  if (!m) return null;
  const [, indent, marker, spaces, rest] = m;
  const ordered = /\d/.test(marker[0]);
  const base = indent.length + marker.length;
  let contentIndent = base + 1;
  let content = '';
  if (spaces !== undefined) {
    if (spaces.length <= 4) { contentIndent = base + spaces.length; content = rest; }
    else content = ' '.repeat(spaces.length - 1) + rest;
  }
  return {
    ordered,
    kind: ordered ? marker.slice(-1) : marker,
    start: ordered ? parseInt(marker, 10) : 1,
    contentIndent,
    content,
  };
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isTableStart(lines, i) {
  const header = lines[i];
  const delimiter = lines[i + 1];
  if (delimiter === undefined || !header.includes('|') || !DELIMITER_ROW.test(delimiter)) return false;
  const columns = splitRow(header).length;
  return (delimiter.includes('|') || columns === 1) && splitRow(delimiter).length === columns;
}

function isBlockStart(lines, i) {
  const line = lines[i];
  return HEADING.test(line) || RULE.test(line) || parseFence(line) !== null || QUOTE.test(line)
    || parseListMarker(line) !== null || HTML_LINE.test(line) || COMMENT_START.test(line)
    || isTableStart(lines, i);
}

// =============================================================
// Blocks
// =============================================================

function renderHeading(level, text, ctx) {
  const inner = renderInline(text, ctx);
  const plain = plainText(inner);
  const id = ctx.slugger(plain);
  if (!ctx.state.title && level === 1 && plain.trim()) ctx.state.title = plain.trim();
  if (level === 2 || level === 3) ctx.toc.push({ level, id, text: plain });
  return `<h${level}${id ? ` id="${escapeHtml(id)}"` : ''}>${inner}</h${level}>`;
}

function renderFence(lines, i) {
  const fence = parseFence(lines[i]);
  const ch = fence.marker[0];
  const closer = new RegExp(`^ {0,3}${ch === '`' ? '`' : '~'}{${fence.marker.length},}[ \\t]*$`);
  const body = [];
  let j = i + 1;
  while (j < lines.length && !closer.test(lines[j])) {
    const line = lines[j];
    body.push(line.slice(Math.min(fence.indent, leadingSpaces(line))));
    j++;
  }
  const lang = unescapeBackslashes(fence.info.split(/\s+/)[0] || '');
  const label = lang ? `<div class="sk-code-lang">${escapeHtml(lang)}</div>` : '';
  const cls = lang.replace(/[^\w+-]/g, '');
  const html = `<div class="sk-code">${label}<pre><code${cls ? ` class="language-${cls}"` : ''}>`
    + `${escapeHtml(body.join('\n'))}</code></pre></div>`;
  return { html, next: j + 1 };
}

function renderTable(lines, i, ctx) {
  const header = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return left ? 'left' : '';
  });
  const cell = (tag, text, c) => {
    const style = align[c] ? ` style="text-align:${align[c]}"` : '';
    return `<${tag}${style}>${renderInline(text ?? '', ctx)}</${tag}>`;
  };
  let html = '<div class="sk-table"><table>\n<thead><tr>'
    + header.map((text, c) => cell('th', text, c)).join('') + '</tr></thead>\n<tbody>\n';
  let j = i + 2;
  while (j < lines.length && !isBlank(lines[j]) && !isBlockStart(lines, j)) {
    const row = splitRow(lines[j]);
    html += `<tr>${header.map((_, c) => cell('td', row[c], c)).join('')}</tr>\n`;
    j++;
  }
  return { html: `${html}</tbody>\n</table></div>`, next: j };
}

function renderQuote(lines, i, ctx) {
  const inner = [];
  let j = i;
  while (j < lines.length) {
    const line = lines[j];
    if (QUOTE.test(line)) inner.push(line.replace(QUOTE, ''));
    else if (!isBlank(line) && inner.length && !isBlank(inner.at(-1)) && !isBlockStart(lines, j)) inner.push(line);
    else break;
    j++;
  }
  return { html: `<blockquote>\n${renderBlocks(inner, ctx)}\n</blockquote>`, next: j };
}

/** A blank line between two blocks of an item (outside fenced code) makes the list loose. */
function hasInnerBlank(itemLines) {
  let fence = null;
  let sawContent = false;
  let pendingBlank = false;
  for (const line of itemLines) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(line)) fence = null;
      continue;
    }
    if (isBlank(line)) { pendingBlank = sawContent; continue; }
    if (pendingBlank) return true;
    sawContent = true;
    const f = parseFence(line);
    if (f) fence = f.marker;
  }
  return false;
}

function renderList(lines, i, ctx) {
  const first = parseListMarker(lines[i]);
  const items = [];
  let loose = false;
  let j = i;
  while (j < lines.length) {
    const marker = parseListMarker(lines[j]);
    if (!marker || marker.ordered !== first.ordered || marker.kind !== first.kind) break;
    const body = [marker.content];
    j++;
    while (j < lines.length) {
      const line = lines[j];
      if (isBlank(line)) { body.push(''); j++; continue; }
      if (leadingSpaces(line) >= marker.contentIndent) { body.push(line.slice(marker.contentIndent)); j++; continue; }
      if (isBlank(body.at(-1)) || isBlockStart(lines, j)) break;
      body.push(line.trimStart()); // lazy paragraph continuation
      j++;
    }
    let trailing = 0;
    while (body.length > 1 && isBlank(body.at(-1))) { body.pop(); trailing++; }
    if (hasInnerBlank(body)) loose = true;
    items.push(body);
    const next = j < lines.length ? parseListMarker(lines[j]) : null;
    const continues = next && next.ordered === first.ordered && next.kind === first.kind;
    if (!continues) { j -= trailing; break; }
    if (trailing) loose = true;
  }
  const tag = first.ordered ? 'ol' : 'ul';
  const start = first.ordered && first.start !== 1 ? ` start="${first.start}"` : '';
  const lis = items.map((body) => {
    const task = /^\[([ xX])\](?:[ \t]+|$)/.exec(body[0]);
    if (!task) return `<li>${renderBlocks(body, ctx, !loose)}</li>`;
    const box = `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> `;
    const rest = [body[0].slice(task[0].length), ...body.slice(1)];
    return `<li class="sk-task">${box}${renderBlocks(rest, ctx, !loose)}</li>`;
  });
  return { html: `<${tag}${start}>\n${lis.join('\n')}\n</${tag}>`, next: j };
}

/** `<!-- … -->` starting a line: drop it (it may span lines); null when it never closes. */
function skipComment(lines, i) {
  let from = lines[i].indexOf('<!--') + 4;
  for (let j = i; j < lines.length; j++) {
    const end = lines[j].indexOf('-->', j === i ? from : 0);
    if (end >= 0) return { line: j, rest: lines[j].slice(end + 3) };
    from = 0;
  }
  return null;
}

/**
 * Render a run of lines as blocks. `tight` = inside a tight list item, where
 * paragraphs are not wrapped in <p>.
 */
function renderBlocks(input, ctx, tight = false) {
  const lines = [...input];
  const out = [];
  const stack = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    if (parseFence(line)) {
      const r = renderFence(lines, i);
      out.push(r.html); i = r.next; continue;
    }
    if ((m = HEADING.exec(line))) {
      out.push(renderHeading(m[1].length, m[2] ?? '', ctx)); i++; continue;
    }
    if (RULE.test(line)) { out.push('<hr>'); i++; continue; }
    if (COMMENT_START.test(line)) {
      const c = skipComment(lines, i);
      if (c) {
        if (isBlank(c.rest)) i = c.line + 1;
        else { lines[c.line] = c.rest; i = c.line; }
        continue;
      }
    }
    if (HTML_LINE.test(line)) { out.push(renderInline(line.trim(), ctx, stack)); i++; continue; }
    if (QUOTE.test(line)) {
      const r = renderQuote(lines, i, ctx);
      out.push(r.html); i = r.next; continue;
    }
    if (isTableStart(lines, i)) {
      const r = renderTable(lines, i, ctx);
      out.push(r.html); i = r.next; continue;
    }
    if (parseListMarker(line)) {
      const r = renderList(lines, i, ctx);
      out.push(r.html); i = r.next; continue;
    }
    const para = [line.trimStart()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines, i)) para.push(lines[i++].trimStart());
    const inner = renderInline(para.join('\n').trimEnd(), ctx);
    out.push(tight ? inner : `<p>${inner}</p>`);
  }
  out.push(closeStack(stack));
  return out.filter(Boolean).join('\n');
}

// =============================================================
// Front matter
// =============================================================

/** `---` … `---` (or `...`) on the very first line → [[key, value]…] and the remaining body. */
function splitFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return { meta: null, body: lines };
  const end = lines.findIndex((line, n) => n > 0 && (line.trim() === '---' || line.trim() === '...'));
  if (end < 0) return { meta: null, body: lines };
  const meta = [];
  for (const line of lines.slice(1, end)) {
    if (isBlank(line) || /^\s*#/.test(line)) continue;
    const pair = /^([^\s:#-][^:]*?)\s*:(?:\s+(.*))?$/.exec(line);
    if (pair && !/^\s/.test(line)) {
      meta.push([pair[1], unquote(pair[2] ?? '')]);
      continue;
    }
    if (!meta.length) continue;
    const last = meta.at(-1);
    const item = /^\s*-\s+(.*)$/.exec(line);
    const piece = item ? unquote(item[1]) : line.trim();
    last[1] = last[1] && !/^[|>][+-]?$/.test(last[1]) ? `${last[1]}${item ? ', ' : ' '}${piece}` : piece;
  }
  return { meta, body: lines.slice(end + 1) };
}

function unquote(value) {
  const v = value.trim();
  return /^(["']).*\1$/.test(v) && v.length >= 2 ? v.slice(1, -1) : v;
}

function renderMeta(meta, t) {
  const rows = meta.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`);
  return `<aside class="sk-meta"><div class="sk-meta-title">${escapeHtml(t.docInfo)}</div>`
    + `<table>\n${rows.join('\n')}\n</table></aside>`;
}

// =============================================================
// Document
// =============================================================

const CSS = `
:root{color-scheme:light dark;--fg:#1f2328;--muted:#59636e;--bg:#fff;--panel:#f6f8fa;--line:#d1d9e0;--link:#0969da;--warn-bg:#fff8c5;--warn-line:#d4a72c;--toc-w:280px}
@media (prefers-color-scheme:dark){:root{--fg:#e6edf3;--muted:#9198a1;--bg:#0d1117;--panel:#151b23;--line:#3d444d;--link:#4493f8;--warn-bg:#3b2e05;--warn-line:#9e6a03}}
body{background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Yu Gothic UI",sans-serif}
a{color:var(--link)}
.sk-toc{padding:16px;border-bottom:1px solid var(--line);background:var(--panel);font-size:14px}
.sk-toc-title{font-weight:600;margin:0 0 8px}
.sk-toc ul{list-style:none;margin:0;padding:0}
.sk-toc li{margin:2px 0}
.sk-toc li.sk-toc-3{padding-left:16px;font-size:13px}
.sk-toc a{text-decoration:none;color:var(--fg)}
.sk-toc a:hover{color:var(--link);text-decoration:underline}
.sk-main{max-width:1000px;padding:16px 24px 8px}
.sk-part+.sk-part{margin-top:32px;padding-top:16px;border-top:2px solid var(--line)}
.sk-draft{margin:0 0 16px;padding:10px 14px;border:1px solid var(--warn-line);border-radius:6px;background:var(--warn-bg);font-weight:600}
.sk-meta{margin:0 0 16px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;background:var(--panel);font-size:13px}
.sk-meta-title{font-weight:600;color:var(--muted);margin-bottom:4px}
.sk-meta table{border-collapse:collapse}
.sk-meta th,.sk-meta td{padding:1px 12px 1px 0;text-align:left;vertical-align:top;border:0}
.sk-meta th{color:var(--muted);font-weight:500}
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:24px 0 12px;scroll-margin-top:12px}
h1{font-size:1.9em;border-bottom:1px solid var(--line);padding-bottom:6px}
h2{font-size:1.45em;border-bottom:1px solid var(--line);padding-bottom:4px}
h3{font-size:1.2em}
p,ul,ol,blockquote,.sk-code,.sk-table,details{margin:0 0 14px}
ul,ol{padding-left:2em}
li>ul,li>ol{margin:2px 0}
li.sk-task{list-style:none;margin-left:-1.4em}
blockquote{padding:0 14px;color:var(--muted);border-left:4px solid var(--line)}
hr{border:0;border-top:2px solid var(--line);margin:20px 0}
code{font:0.9em/1.45 ui-monospace,Consolas,"D2Coding",monospace;background:var(--panel);padding:1px 4px;border-radius:4px}
.sk-code{border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.sk-code-lang{padding:2px 10px;font:12px ui-monospace,Consolas,monospace;color:var(--muted);border-bottom:1px solid var(--line)}
.sk-code pre{margin:0;padding:10px 12px;overflow:auto}
.sk-code code{background:none;padding:0}
.sk-table{overflow-x:auto}
table{border-collapse:collapse}
th,td{border:1px solid var(--line);padding:5px 10px;vertical-align:top}
thead th{background:var(--panel)}
img{max-width:100%;height:auto}
.sk-img-missing,.sk-img-remote{display:inline-block;padding:6px 10px;border:1px dashed var(--line);border-radius:4px;color:var(--muted);font-size:13px}
details{border:1px solid var(--line);border-radius:6px;padding:6px 12px}
summary{cursor:pointer;font-weight:600}
.sk-footer{color:var(--muted);border-top-color:var(--line)}
@media (min-width:900px){
.sk-has-toc .sk-toc{position:fixed;top:0;left:0;bottom:0;width:var(--toc-w);overflow-y:auto;border-bottom:0;border-right:1px solid var(--line)}
.sk-has-toc .sk-main{margin-left:var(--toc-w);padding:24px 40px 8px}
.sk-has-toc+.sk-footer{margin-left:var(--toc-w)}
}
@media print{
.sk-toc{display:none}
.sk-has-toc .sk-main,.sk-has-toc+.sk-footer{margin-left:0}
details{border:0;padding:0}
}
`;

function readSource(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.code || error.message}`);
  }
  return text.replace(/^﻿/, '').replace(/\u0000/g, '�').split(/\r\n?|\n/).map(expandLeadingTabs);
}

function renderToc(toc, t) {
  if (!toc.length) return '';
  const items = toc.map((h) => `<li class="sk-toc-${h.level}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`);
  return `<nav class="sk-toc" aria-label="${escapeHtml(t.toc)}"><div class="sk-toc-title">${escapeHtml(t.toc)}</div>`
    + `<ul>\n${items.join('\n')}\n</ul></nav>`;
}

/**
 * Render one or more Markdown files (the first, then each appendix in order)
 * into one HTML page. Throws when any file cannot be read.
 */
export function renderMarkdownHtml({ files, lang = 'en', draft = false, now = new Date() }) {
  const t = frameStrings(lang);
  const sources = files.map((file) => ({ file, lines: readSource(file) }));
  const ctx = { slugger: createSlugger(), toc: [], t, state: { title: null }, baseDir: '' };
  const parts = sources.map(({ file, lines }) => {
    const { meta, body } = splitFrontMatter(lines);
    ctx.baseDir = dirname(resolve(file));
    const metaHtml = meta && meta.length ? `${renderMeta(meta, t)}\n` : '';
    return `<section class="sk-part">\n${metaHtml}${renderBlocks(body, ctx)}\n</section>`;
  });
  const banner = draft ? `<div class="sk-draft" role="note">${escapeHtml(t.draft)}</div>\n` : '';
  const toc = renderToc(ctx.toc, t);
  const bodyHtml = `<div class="sk-page${toc ? ' sk-has-toc' : ''}">\n${toc}\n`
    + `<main class="sk-main">\n${banner}${parts.join('\n')}\n</main>\n</div>`;
  return renderPage({
    lang,
    title: ctx.state.title ?? basename(files[0]),
    css: CSS,
    bodyHtml,
    sources: files,
    now,
  });
}

// =============================================================
// CLI
// =============================================================

const USAGE = 'usage: node md-to-html.mjs <in.md> <out.html> [--lang <ko|en|ja>] [--draft] [--append <part.md>]... [--open]';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({
    tool: 'md-to-html',
    usage: USAGE,
    argv: process.argv.slice(2),
    accepts: ['draft', 'append'],
    render: (args) => renderMarkdownHtml({
      files: [args.input, ...args.append],
      lang: args.lang,
      draft: args.draft,
    }),
  });
}
