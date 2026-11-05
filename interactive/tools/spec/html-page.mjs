// sapkit — the shared half of the two HTML renderers (xlsx-to-html.mjs and
// md-to-html.mjs).
//
// WHAT THE HTML IS
//   A read-only copy of a document sapkit already wrote (a spec workbook or a
//   Markdown file), made so the reader can send ONE file by mail or chat. The
//   source stays the document of record; the HTML is regenerated from it and
//   never edited by hand. Hence the footer on every page says so.
//
// WHAT LIVES HERE
//   escaping · image sniffing + data URIs · the page shell (head, CSP, footer)
//   · the frame strings the renderers add in ko/en/ja · CLI argument parsing ·
//   atomic write · opening the default browser · the shared CLI flow.
//
// THE CONTRACT A PROCEDURE READS (stdout, one line each)
//   WROTE <absolute path>      the file is complete on disk
//   OPENED                     the browser launch request was accepted — not
//                              proof that a window appeared, so a procedure
//                              always reports the path alongside
//   OPEN-FAILED <reason>       the launch itself failed; still exit 0
//   Exit 1 = an input could not be read (stderr says why; no output written,
//   an existing output file is left as it was). Exit 2 = usage error.
//
// OFFLINE BY CONSTRUCTION
//   The page shell carries a Content-Security-Policy that admits only data:
//   images, inline styles and the one renderer script (pinned by its SHA-256).
//   Even if a source string slipped past escaping, the browser would refuse to
//   fetch anything or run it.
//
// node built-ins only — the hard constraint every file in tools/spec/ keeps.

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';

// =============================================================
// Escaping
// =============================================================

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape for element content and for double-quoted attribute values alike. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// =============================================================
// Images
// =============================================================

/** Identify an image by its first bytes; the file name is never trusted. */
export function sniffImageType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const head = buf.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  // SVG is text: allow a BOM, an XML declaration, comments or a doctype first.
  const text = buf.subarray(0, 4096).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^<svg[\s>]/i.test(text)) return 'image/svg+xml';
  if (/^<(\?xml|!--|!doctype)/i.test(text) && /<svg[\s>]/i.test(text)) return 'image/svg+xml';
  return null;
}

/** A data: URI for an image buffer, or null when the bytes are not an image we embed. */
export function imageDataUri(buf) {
  const mime = sniffImageType(buf);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}

// =============================================================
// Frame strings — the only words the renderers add themselves
// =============================================================
// The document body is never translated; these frame its edges. Any language
// other than the three below falls back to English.

const FRAME = {
  en: {
    toc: 'Contents',
    sheets: 'Sheets',
    draft: 'Draft — not yet approved. Once approved, this copy is made again without this banner.',
    docInfo: 'Document info',
    missingImage: 'Image file not found',
    remoteImage: 'External image (not embedded)',
    source: 'Source',
    generated: 'Generated',
    copyNote: 'This file is a copy generated from the source. To change it, edit the source and generate it again.',
    openFailed: 'could not open a browser',
  },
  ko: {
    toc: '목차',
    sheets: '시트',
    draft: '승인 전 초안입니다. 승인되면 이 표시 없이 다시 만들어집니다.',
    docInfo: '문서 정보',
    missingImage: '그림 파일을 찾을 수 없음',
    remoteImage: '외부 그림(파일에 넣지 않음)',
    source: '원본',
    generated: '만든 시각',
    copyNote: '이 파일은 원본에서 만든 사본입니다. 고칠 때는 원본을 고친 뒤 다시 만드세요.',
    openFailed: '브라우저를 열지 못했습니다',
  },
  ja: {
    toc: '目次',
    sheets: 'シート',
    draft: '承認前の草案です。承認されると、この表示なしで作り直されます。',
    docInfo: '文書情報',
    missingImage: '画像ファイルが見つかりません',
    remoteImage: '外部画像（埋め込みなし）',
    source: '元ファイル',
    generated: '作成日時',
    copyNote: 'このファイルは元ファイルから作ったコピーです。修正するときは元ファイルを直して作り直してください。',
    openFailed: 'ブラウザを開けませんでした',
  },
};

/** ko / en / ja (a region tag such as ko-KR counts as its language); anything else → en. */
export function normalizeLang(value) {
  const primary = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(FRAME, primary) ? primary : 'en';
}

export function frameStrings(lang) {
  return FRAME[normalizeLang(lang)];
}

// =============================================================
// Page shell
// =============================================================

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0}
.sk-footer{margin:32px 0 0;padding:12px 16px;border-top:1px solid #d0d7de;color:#57606a;font:12px/1.5 system-ui,-apple-system,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.sk-footer p{margin:2px 0}
@media print{.sk-footer{break-inside:avoid}}
`;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Local wall-clock time with its UTC offset — the one non-deterministic byte run. */
function formatLocal(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} `
    + `${pad2(date.getHours())}:${pad2(date.getMinutes())} (UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)})`;
}

/**
 * Assemble the full document. `script` is the renderer's own behaviour (tab
 * switching, TOC highlight); it is the only script the CSP lets run.
 */
export function renderPage({ lang, title, css, bodyHtml, script = '', sources, now = new Date() }) {
  const code = normalizeLang(lang);
  const t = FRAME[code];
  const scriptHash = script
    ? `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`
    : "'none'";
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src ${scriptHash}; base-uri 'none'; form-action 'none'`;
  const sourceText = sources.map((s) => basename(s)).join(' · ');
  const footer = '<footer class="sk-footer">'
    + `<p>${escapeHtml(t.source)}: ${escapeHtml(sourceText)}</p>`
    + `<p>${escapeHtml(t.generated)}: <time datetime="${now.toISOString()}">${escapeHtml(formatLocal(now))}</time></p>`
    + `<p>${escapeHtml(t.copyNote)}</p>`
    + '</footer>';
  return '<!doctype html>\n'
    + `<html lang="${code}">\n<head>\n<meta charset="utf-8">\n`
    + `<meta http-equiv="Content-Security-Policy" content="${csp}">\n`
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="generator" content="sapkit">\n'
    + `<title>${escapeHtml(title)}</title>\n`
    + `<style>${BASE_CSS}${css}</style>\n</head>\n<body>\n`
    + `${bodyHtml}\n${footer}\n`
    + (script ? `<script>${script}</script>\n` : '')
    + '</body>\n</html>\n';
}

// =============================================================
// Writing and opening
// =============================================================

/**
 * Write via a sibling temp file and a rename, so a reader never sees half a
 * file and a failure leaves any earlier output exactly as it was.
 */
export function writeAtomic(outPath, content) {
  mkdirSync(dirname(outPath), { recursive: true });
  const temp = `${outPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, outPath);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function launchCommand(absPath, platform) {
  if (platform === 'win32') {
    // `start` treats the first quoted token as a window title, hence the "".
    return { command: 'cmd.exe', args: ['/d', '/c', 'start', '""', `"${absPath}"`], verbatim: true };
  }
  if (platform === 'darwin') return { command: 'open', args: [absPath], verbatim: false };
  return { command: 'xdg-open', args: [absPath], verbatim: false };
}

/**
 * Ask the OS to show the file in its default browser, detached. Resolves to
 * { ok: true } once the launcher process has started, or { ok: false, reason }
 * when it could not start at all. Never throws: failing to open is not a
 * failed run. `spawnImpl` exists for tests.
 */
export function openInBrowser(absPath, { platform = process.platform, spawnImpl = spawn } = {}) {
  const { command, args, verbatim } = launchCommand(absPath, platform);
  return new Promise((settle) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: verbatim,
      });
    } catch (error) {
      settle({ ok: false, reason: `${command}: ${error.code || error.message}` });
      return;
    }
    child.once('error', (error) => settle({ ok: false, reason: `${command}: ${error.code || error.message}` }));
    child.once('spawn', () => {
      child.unref();
      settle({ ok: true });
    });
  });
}

// =============================================================
// CLI
// =============================================================

export class UsageError extends Error {}

/**
 * Parse `<in> <out>` plus the flags a renderer accepts.
 * `accepts` lists the optional flags beyond --lang/--open: 'draft', 'append'.
 */
export function parseArgs(argv, accepts = []) {
  const allow = new Set(['--lang', '--open', ...accepts.map((a) => `--${a}`)]);
  const positional = [];
  const parsed = { lang: 'en', open: false, draft: false, append: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (!allow.has(arg)) throw new UsageError(`unknown option ${arg}`);
    if (arg === '--open') parsed.open = true;
    else if (arg === '--draft') parsed.draft = true;
    else {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      if (arg === '--lang') parsed.lang = normalizeLang(value);
      else parsed.append.push(value);
    }
  }
  if (positional.length !== 2) throw new UsageError('expected exactly <input> and <output>');
  [parsed.input, parsed.output] = positional;
  const out = resolve(parsed.output);
  for (const source of [parsed.input, ...parsed.append]) {
    if (resolve(source) === out) throw new UsageError('the output path must not be one of the inputs');
  }
  return parsed;
}

/**
 * The flow both renderers share. `render(args)` returns the HTML string or
 * throws; nothing touches the output path until it has returned.
 * Resolves to the process exit code.
 */
export async function runCli({ tool, usage, argv, accepts, render, openImpl = openInBrowser }) {
  let args;
  try {
    args = parseArgs(argv, accepts);
  } catch (error) {
    console.error(`${tool}: ${error.message}`);
    console.error(usage);
    return 2;
  }
  let html;
  try {
    html = render(args);
  } catch (error) {
    console.error(`${tool}: ${error.message}`);
    return 1;
  }
  const outPath = resolve(args.output);
  try {
    writeAtomic(outPath, html);
  } catch (error) {
    console.error(`${tool}: cannot write ${outPath}: ${error.code || error.message}`);
    return 1;
  }
  console.log(`WROTE ${outPath}`);
  if (args.open) {
    const result = await openImpl(outPath);
    console.log(result.ok ? 'OPENED' : `OPEN-FAILED ${frameStrings(args.lang).openFailed} (${result.reason})`);
  }
  return 0;
}
