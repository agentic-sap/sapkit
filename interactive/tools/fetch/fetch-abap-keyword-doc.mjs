#!/usr/bin/env node
/**
 * sc4sap — ABAP Keyword Documentation fetcher (browserless, no eval)
 *
 * The SAP Help Portal ABAP keyword docs (`help.sap.com/doc/abapdocu_*`) are a
 * SAPUI5 SPA. The browser route (`...<topic>.htm`) is a client-side wrapper that
 * returns "Page Not Found" to direct fetches. The ACTUAL content lives in a
 * sibling `...<topic>.html` file (note: `.html`, not `.htm`) as a JS object
 * literal passed to `new sap.ui.model.json.JSONModel({ par1: "...", ... })`.
 *
 * This script fetches that `.html` and extracts the content WITHOUT executing
 * any remote code: it locates the model block by brace-balancing (string scan
 * only) and pulls the par / ul / code STRING values with a constrained parser.
 *
 * Usage:
 *   node fetch-abap-keyword-doc.mjs <topic-or-help.sap.com-url>
 *   node fetch-abap-keyword-doc.mjs abenwhere_all_entries
 *
 * Security: only help.sap.com is contacted; topic ids are validated; no eval.
 * Scope: keyword/statement reference pages (the par / ul / code template).
 * Out of scope: OSS Notes (auth-walled) and non-abapdocu Help Portal products.
 */

const BASE = 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US';

function toContentUrl(arg) {
  let topic = String(arg).trim();
  if (/^https?:\/\//i.test(topic)) {
    let u;
    try { u = new URL(topic); } catch { throw new Error('Invalid URL: ' + topic); }
    if (u.hostname !== 'help.sap.com') throw new Error('Only help.sap.com URLs are allowed (got ' + u.hostname + ').');
    const m = u.pathname.match(/\/([A-Za-z0-9_]+)\.html?$/);
    if (!m) throw new Error('Could not parse an abapdocu topic id from URL: ' + topic);
    topic = m[1];
  }
  topic = topic.replace(/\.html?$/i, '');
  if (!/^[A-Za-z0-9_]+$/.test(topic)) throw new Error('Invalid topic id (expected [A-Za-z0-9_]): ' + topic);
  return `${BASE}/${topic}.html`;
}

// Brace-balanced slice starting at the '{' at openIdx (string scan; respects quotes/escapes). No eval.
function extractBalanced(s, openIdx) {
  let depth = 0, inStr = false, q = '', esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(openIdx, i + 1); }
  }
  return null;
}

// Decode a JS string-literal body (escapes intact) to plain text — proper unescaper, no eval.
function decodeJsString(raw) {
  return String(raw).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e) => {
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    switch (e) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r';
      case 'b': return '\b'; case 'f': return '\f'; case 'v': return '\v'; case '0': return '\0';
      default: return e; // \" -> "  \\ -> \  \/ -> /  \<space> -> <space>
    }
  });
}

// Pull (par|ul|code)N string values from the model block — constrained parser, no eval.
function parseModelFields(block) {
  const obj = {};
  const re = /\b(par|ul|code)(\d+)\s*:\s*("|')/g;
  let m;
  while ((m = re.exec(block))) {
    const key = m[1] + m[2];
    const quote = m[3];
    let i = re.lastIndex, out = '', esc = false;
    for (; i < block.length; i++) {
      const c = block[i];
      if (esc) { out += '\\' + c; esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) break;
      out += c;
    }
    if (obj[key] === undefined) obj[key] = decodeJsString(out);
    re.lastIndex = i + 1; // resume scanning AFTER the closing quote — never rescan string contents
  }
  return Object.keys(obj).length ? obj : null;
}

function extractModel(html) {
  const re = /JSONModel\(\s*\{/g; let m;
  while ((m = re.exec(html))) {
    const braceIdx = html.indexOf('{', m.index);
    const block = extractBalanced(html, braceIdx);
    if (block && /\bpar1\s*:\s*["']/.test(block)) {
      const obj = parseModelFields(block);
      if (obj && obj.par1) return obj;
    }
  }
  return null;
}

const strip = h => String(h || '')
  .replace(/<pre[^>]*>/gi, '\n').replace(/<\/pre>/gi, '\n')
  .replace(/<li[^>]*>/gi, '\n  - ').replace(/<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#x9;/g, '  ').replace(/&#xA;/g, '\n').replace(/&nbsp;/g, ' ')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function render(obj) {
  const pars = [], uls = [], codes = [];
  for (const k of Object.keys(obj)) {
    const t = strip(obj[k]); if (!t) continue;
    if (/^par\d+$/.test(k)) pars.push([+k.slice(3), t]);
    else if (/^ul\d+$/.test(k)) uls.push([+k.slice(2), t]);
    else if (/^code\d+$/.test(k)) codes.push([+k.slice(4), t]);
  }
  const byNum = (a, b) => a[0] - b[0];
  const out = [];
  pars.sort(byNum).forEach(p => out.push(p[1]));
  if (uls.length) { out.push('\n## Hints / Restrictions'); uls.sort(byNum).forEach(u => out.push(u[1])); }
  if (codes.length) { out.push('\n## Examples'); codes.sort(byNum).forEach(c => out.push('```abap\n' + c[1] + '\n```')); }
  return out.join('\n\n');
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('Usage: node fetch-abap-keyword-doc.mjs <topic-or-help.sap.com-url>'); process.exit(2); }
  let url;
  try { url = toContentUrl(arg); } catch (e) { console.error(e.message); process.exit(2); }
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } }); }
  catch (e) { console.error('FETCH ERROR: ' + e.message); process.exit(1); }
  if (!res.ok) { console.error(`HTTP ${res.status} for ${url} — topic may not exist (use the exact abapdocu topic id).`); process.exit(1); }
  const html = await res.text();
  const obj = extractModel(html);
  if (!obj) { console.error('NO_CONTENT_MODEL: not a standard keyword/statement reference page (' + url + ')'); process.exit(3); }
  const titleM = html.match(/<title>([^<]*)<\/title>/i);
  console.log('# ' + (titleM ? titleM[1].trim() : arg));
  console.log('Source: ' + url + '\n');
  console.log(render(obj));
}

main();
