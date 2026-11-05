#!/usr/bin/env node
// test-spec-html.mjs — HTML 렌더러 2종(xlsx-to-html · md-to-html)의 게이트.
//
// 두 렌더러는 sapkit이 쓴 문서(명세 워크북 · Markdown)를 **한 파일짜리 오프라인
// HTML 사본**으로 만든다. 이 시험은 그 사본이 원본과 같은 내용·같은 배치를
// 갖는지, 그리고 실패할 때 계약대로 실패하는지를 잰다.
//
// 고정 데이터는 커밋하지 않는다 — 시험이 돌 때마다 만든다. 워크북은
// `cloneTemplate`로 template_base.xlsx를 임시 폴더에 복제하고, 그림 교체용 PNG는
// 코드로 짓는다(zlib + crc32). SAP 무접촉 · 오프라인 · **브라우저를 절대 띄우지
// 않는다**(`--open`은 가짜 openImpl/spawnImpl로만 잰다 — CI에 브라우저가 없다).
//
// 고정하는 것:
//   ⑴ Excel → HTML: 탭 7개 · 탭 이름 = xl/workbook.xml의 시트 이름(번역 안 함) ·
//      시트마다 그 시트의 공유 문자열 전부가 이스케이프된 채 그 탭에 있다 ·
//      병합 = 왼쪽 위 셀 하나가 grid-area로 병합 범위 전체를 덮는다 ·
//      드로잉 앵커의 그림 수 = data: URI 그림 수 · 외부 URL 0 · CSP 해시 = 인라인
//      스크립트의 sha256 · 바닥글(원본 이름 · 시각 · 사본 안내) · --lang 프레임
//   ⑵ 그림 교체(swapImages)한 워크북: 교체된 PNG 바이트(base64)가 HTML에 있고
//      템플릿의 옛 그림은 없다
//   ⑶ Markdown → HTML: 목차 항목 수 = `##`+`###` 수(코드 펜스 안 제외) · 제목 id가
//      GitHub 슬러그(한글 · 구두점 · 이모지 · 중복) · 문서 내 링크 `#0-overview`가
//      실재 id를 가리킨다 · 표 · 목록 · 코드 · 문서 정보 상자(원시 `---` 블록 없음) ·
//      주석 표식 비노출 · `<script>`·`onerror=`·`javascript:` 무력화 · `<details>`
//      통과 · 상대 그림 → data URI · 없는 그림 → 자리표시 + 성공 종료 ·
//      `--draft` 띠는 플래그일 때만 · `--append` 병합과 목차 연속 · `--lang`
//      (ko/ja/en, 모르는 값 → en)
//   ⑷ 음성: zip 아님 · 파일 없음 · `--append` 조각 없음 → exit 1 · stderr 한 줄 ·
//      출력 파일을 만들지 않는다 · 기존 출력은 바이트 그대로 · 사용법 오류 → exit 2
//   ⑸ 결정성: 생성 시각(`<time …>…</time>`)만 가리면 두 번 돌린 결과가 같다
//   ⑹ openInBrowser(spawnImpl 주입): 기동 수락 → {ok:true} · 기동 오류 →
//      {ok:false} · 던지지 않는다 · 플랫폼별 실행기
//   ⑺ runCli stdout 계약: `WROTE <절대경로>` · --open + 가짜 openImpl →
//      `OPENED` / `OPEN-FAILED …` · 둘 다 exit 0 · 없는 출력 폴더는 만든다
//
// exit 0 전부 통과 / 1 실패
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.resolve(HERE, '..', 'tools', 'spec');
const TEMPLATE = path.resolve(HERE, '..', 'assets', 'spec', 'template_base.xlsx');
const XLSX_CLI = path.join(SPEC, 'xlsx-to-html.mjs');
const MD_CLI = path.join(SPEC, 'md-to-html.mjs');

const load = (name) => import(pathToFileURL(path.join(SPEC, name)).href);
const { renderWorkbookHtml } = await load('xlsx-to-html.mjs');
const { renderMarkdownHtml, githubSlug, createSlugger } = await load('md-to-html.mjs');
const { openInBrowser, runCli } = await load('html-page.mjs');
const { cloneTemplate } = await load('template-clone.mjs');
const { swapImages } = await load('image-swap.mjs');
const { unzipEntries, crc32 } = await load('xlsx-zip.mjs');

let pass = 0;
let fail = 0;

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  [ok ] ${label}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-html-'));
const FIXED_NOW = new Date('2026-01-02T03:04:05Z');

/** 시험이 렌더러와 독립적으로 쓰는 이스케이프 — 렌더러의 것을 빌리면 둘이 함께 틀린다. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const xmlDecode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, b) => {
  if (b[0] === '#') return String.fromCodePoint(b[1] === 'x' || b[1] === 'X' ? parseInt(b.slice(2), 16) : parseInt(b.slice(1), 10));
  return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[b.toLowerCase()];
});
const maskTime = (html) => html.replace(/<time[^>]*>[^<]*<\/time>/g, '<time>*</time>');
const count = (text, re) => (text.match(re) || []).length;

/** CLI를 자식 프로세스로 — exit·stdout·stderr를 그대로 받는다. `--open`은 절대 넘기지 않는다. */
function run(cli, args) {
  if (args.includes('--open')) throw new Error('시험이 실제 브라우저를 띄우려 했다');
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/** 단색 RGB PNG — IHDR가 진짜라서 swapImages가 크기를 읽을 수 있다. */
function makePng(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 외부 URL — src·href 속성 값이 http:/https:/프로토콜 상대(//)로 시작하는 것. */
function externalUrls(html) {
  return [...html.matchAll(/\s(?:src|href)\s*=\s*["']?\s*((?:https?:|\/\/)[^"'\s>]*)/gi)].map((m) => m[1]);
}

/** CSP의 script-src가 인라인 스크립트(있으면)를 sha256으로 정확히 고정하는지. */
function cspMatchesScript(html) {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];
  if (!csp) return { ok: false, why: 'CSP meta 없음' };
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const src = /script-src ([^;]*)/.exec(csp)?.[1]?.trim();
  if (!scripts.length) return { ok: src === "'none'" && !/<script/i.test(html), why: `script 없음인데 script-src=${src}` };
  if (scripts.length !== 1) return { ok: false, why: `인라인 스크립트 ${scripts.length}개` };
  const want = `'sha256-${createHash('sha256').update(scripts[0], 'utf8').digest('base64')}'`;
  return { ok: src === want, why: `CSP ${src} / 계산 ${want}` };
}

// =============================================================
// 워크북 판독 — 렌더러와 독립된, 시험 자신의 얕은 읽기
// =============================================================

function readBook(buffer) {
  const parts = new Map(unzipEntries(buffer).map((e) => [e.name, e.data.toString('utf8')]));
  const sst = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => xmlDecode(t[1])).join(''));
  const rels = new Map([...parts.get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)]
    .map((m) => [m[1], `xl/${m[2]}`]));
  const sheets = [...parts.get('xl/workbook.xml').matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)].map((m) => {
    const part = rels.get(m[2]);
    const xml = parts.get(part);
    const strings = [...xml.matchAll(/<c [^>]*?t="s"[^>]*>\s*<v>(\d+)<\/v>/g)].map((c) => sst[Number(c[1])]);
    const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].map((g) => ({
      ref: `${g[1]}${g[2]}:${g[3]}${g[4]}`,
      r1: Number(g[2]), c1: col(g[1]), r2: Number(g[4]), c2: col(g[3]),
    }));
    return { name: xmlDecode(m[1]), part, strings, merges };
  });
  let pictures = 0;
  for (const [name, xml] of parts) {
    if (!/^xl\/drawings\/drawing\d+\.xml$/.test(name)) continue;
    pictures += count(xml, /<xdr:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)>[\s\S]*?<xdr:pic>[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor|absoluteAnchor)>/g);
  }
  const media = [...parts.keys()].filter((n) => n.startsWith('xl/media/'));
  return { sheets, sst, pictures, media, raw: unzipEntries(buffer) };
}

function col(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** HTML을 탭 패널 단위로 자른다. */
function panelsOf(html) {
  return [...html.matchAll(/<section class="xl-panel"[\s\S]*?<\/section>/g)].map((m) => m[0]);
}

// =============================================================
// ⑴ Excel → HTML
// =============================================================
console.log('⑴ Excel → HTML');

const HOSTILE = `<script>alert("x")</script> & 'q' 프로그램 개요`;
const TR = {
  'Program Overview (ZMMRTEST003)': HOSTILE,
  'Inputs & Screens': '입력 & 화면',
  ZMMRTEST003: 'ZMMR1001',
};
const BOOK = path.join(TMP, 'spec_ZMMR1001.xlsx');
cloneTemplate({ outPath: BOOK, tr: TR, templatePath: TEMPLATE, verbose: false });
const bookBuf = fs.readFileSync(BOOK);
const book = readBook(bookBuf);
const xHtml = renderWorkbookHtml(bookBuf, { lang: 'ko', sourceName: BOOK, now: FIXED_NOW });

{
  const tabs = [...xHtml.matchAll(/<button [^>]*class="xl-tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
  check('탭 7개', tabs.length === 7 && book.sheets.length === 7, `탭 ${tabs.length} · 시트 ${book.sheets.length}`);
  const want = book.sheets.map((s) => esc(s.name));
  check('탭 이름 = workbook.xml 시트 이름(순서 그대로)', JSON.stringify(tabs) === JSON.stringify(want),
    `실제 ${JSON.stringify(tabs)} / 기대 ${JSON.stringify(want)}`);
  check('   └ 탭 이름은 번역되지 않는다 (공유 문자열만 바뀐 복제본)', tabs.includes('Inputs &amp; Screens') && !tabs.includes('입력 &amp; 화면'));
  check('탭 패널 7개', panelsOf(xHtml).length === 7, `패널 ${panelsOf(xHtml).length}`);
}

{
  const panels = panelsOf(xHtml);
  const misses = [];
  let total = 0;
  book.sheets.forEach((sheet, i) => {
    for (const s of sheet.strings) {
      if (s === '') continue;
      total += 1;
      if (!panels[i]?.includes(esc(s))) misses.push(`${sheet.name}: ${JSON.stringify(s.slice(0, 40))}`);
    }
  });
  check(`시트마다 공유 문자열 전부가 그 탭에 이스케이프된 채 있다 (${total}건)`, total > 0 && misses.length === 0,
    misses.slice(0, 3).join(' | '));
  check('   └ 적대 문자열은 이스케이프돼 있고 원시 태그는 없다',
    xHtml.includes(esc(HOSTILE)) && !xHtml.includes('<script>alert'));
}

{
  const panels = panelsOf(xHtml);
  const misses = [];
  let total = 0;
  let multi = 0;
  book.sheets.forEach((sheet, i) => {
    const panel = panels[i] ?? '';
    for (const m of sheet.merges) {
      total += 1;
      const want = `style="grid-area:${m.r1}/${m.c1}/${m.r2 + 1}/${m.c2 + 1}"`;
      if (!new RegExp(`<div class="xc[^"]*" ${want.replace(/[/]/g, '\\/')}>`).test(panel)) misses.push(`${sheet.name} ${m.ref}`);
    }
    // 여러 칸을 덮는 셀 요소는 병합에서만 나온다 — 병합 수보다 많으면 병합이 아닌 것이 퍼졌다.
    multi += [...panel.matchAll(/<div class="xc[^"]*" style="grid-area:(\d+)\/(\d+)\/(\d+)\/(\d+)">/g)]
      .filter((g) => Number(g[3]) - Number(g[1]) > 1 || Number(g[4]) - Number(g[2]) > 1).length;
  });
  check(`병합 셀 = 왼쪽 위 셀 하나가 병합 범위 전체를 grid-area로 덮는다 (${total}건)`, total > 0 && misses.length === 0,
    misses.slice(0, 5).join(', '));
  check('   └ 여러 칸 셀 요소 수 = 병합 수', multi === total, `여러 칸 ${multi} / 병합 ${total}`);
}

{
  const imgs = count(xHtml, /<img class="xi" src="data:image\/[a-z+]+;base64,/g);
  check(`드로잉 앵커 그림 수 = data: URI 그림 수 (${book.pictures})`, book.pictures > 0 && imgs === book.pictures,
    `앵커 ${book.pictures} / img ${imgs}`);
  const ext = externalUrls(xHtml);
  check('외부 URL 0 (src·href)', ext.length === 0, ext.slice(0, 3).join(' '));
  const csp = cspMatchesScript(xHtml);
  check('CSP script-src = 인라인 탭 스크립트의 sha256', csp.ok, csp.why);
  check('CSP: img-src data: · default-src none', /default-src 'none'; img-src data:;/.test(xHtml));
  check('바닥글: 원본 이름 · 생성 시각 · 사본 안내(ko)',
    xHtml.includes('원본: spec_ZMMR1001.xlsx')
    && xHtml.includes(`<time datetime="${FIXED_NOW.toISOString()}">`)
    && xHtml.includes('이 파일은 원본에서 만든 사본입니다'));
  check('--lang ko: html lang · 탭 줄 이름표', xHtml.includes('<html lang="ko">') && xHtml.includes('aria-label="시트"'));
  const en = renderWorkbookHtml(bookBuf, { lang: 'xx', sourceName: BOOK, now: FIXED_NOW });
  check('모르는 언어 → en 프레임', en.includes('<html lang="en">') && en.includes('aria-label="Sheets"')
    && en.includes('This file is a copy generated from the source'));
}

// =============================================================
// ⑵ 그림 교체한 워크북
// =============================================================
console.log('⑵ 그림 교체(swapImages)');
{
  const pngs = { selectionPng: makePng(40, 12, [200, 30, 30]), alvPng: makePng(32, 20, [30, 160, 30]), processFlowPng: makePng(24, 24, [30, 30, 200]) };
  const swapped = path.join(TMP, 'spec_swapped.xlsx');
  fs.copyFileSync(BOOK, swapped);
  const original = book.raw.filter((e) => e.name.startsWith('xl/media/')).map((e) => e.data.toString('base64'));
  swapImages({ xlsxPath: swapped, ...pngs, verbose: false });
  const buf = fs.readFileSync(swapped);
  const swappedBook = readBook(buf);
  const html = renderWorkbookHtml(buf, { lang: 'en', sourceName: swapped, now: FIXED_NOW });
  for (const [slot, png] of Object.entries(pngs)) {
    check(`교체한 ${slot} 바이트(base64)가 HTML에 있다`, html.includes(`data:image/png;base64,${png.toString('base64')}"`));
  }
  check('템플릿의 옛 그림은 HTML에 없다', original.length > 0 && original.every((b64) => !html.includes(b64)));
  const imgs = count(html, /<img class="xi" src="data:image\//g);
  check(`교체 뒤 앵커 그림 수 = data: URI 그림 수 (${swappedBook.pictures})`, swappedBook.pictures === 3 && imgs === 3,
    `앵커 ${swappedBook.pictures} / img ${imgs}`);
  check('교체 뒤에도 외부 URL 0', externalUrls(html).length === 0);
}

// =============================================================
// ⑶ Markdown → HTML
// =============================================================
console.log('⑶ Markdown → HTML');

const MD_DIR = path.join(TMP, 'md');
fs.mkdirSync(path.join(MD_DIR, 'img'), { recursive: true });
const FLOW_PNG = makePng(10, 6, [10, 120, 220]);
fs.writeFileSync(path.join(MD_DIR, 'img', 'flow.png'), FLOW_PNG);

const MAIN_MD = [
  '---',
  'status: approved',
  'owner: "Kim"',
  '---',
  '<!-- SAPKIT:DIG-OUT -->',
  '# Spec Title',
  '',
  'Jump to [the overview](#0-overview). <!-- inline reviewer note -->',
  '',
  '## 0. Overview',
  '',
  '| Field | Value |',
  '|---|:---:|',
  '| Program | ZMMR1001 |',
  '| Type | Report |',
  '',
  '- first',
  '  - nested',
  '- second',
  '',
  '1. one',
  '2. two',
  '',
  '```abap',
  '## not a heading',
  'WRITE: / \'<b>bold?</b>\'.',
  '```',
  '',
  '## 한글 제목 테스트',
  '',
  '### Punctuation: (a), b! & c?',
  '',
  '## Emoji 🚀 Launch',
  '',
  '## Notes',
  '',
  '### Notes',
  '',
  '## Safety',
  '',
  '<script>alert(1)</script>',
  '',
  '<img src=x onerror=alert(1)>',
  '',
  '[click me](javascript:alert(1)) and [sneaky](JaVa&#x53;cript:alert(2))',
  '',
  '<details><summary>FALLBACK</summary>',
  '',
  'mermaid source here',
  '',
  '</details>',
  '',
  '![flow chart](img/flow.png)',
  '',
  '![gone](img/nope.png)',
  '',
].join('\n');
const PART_MD = ['## Appendix A', '', '### A.1 Detail', '', '## Notes', ''].join('\n');
const MAIN = path.join(MD_DIR, 'spec.md');
const PART = path.join(MD_DIR, 'approval.md');
fs.writeFileSync(MAIN, MAIN_MD);
fs.writeFileSync(PART, PART_MD);

/** `##`·`###` 제목 수 — 코드 펜스 안은 세지 않는다. */
function headingCount(md) {
  let fence = false;
  let n = 0;
  for (const line of md.split('\n')) {
    if (/^ {0,3}(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (!fence && /^ {0,3}#{2,3}[ \t]+\S/.test(line)) n += 1;
  }
  return n;
}
const tocIds = (html) => [...html.matchAll(/<li class="sk-toc-[23]"><a href="#([^"]*)">/g)].map((m) => m[1]);
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));

const mHtml = renderMarkdownHtml({ files: [MAIN], lang: 'en', now: FIXED_NOW });
{
  const toc = tocIds(mHtml);
  check(`목차 항목 수 = ##+### 수 (${headingCount(MAIN_MD)}, 펜스 안 제외)`, toc.length === headingCount(MAIN_MD) && toc.length === 7,
    `목차 ${toc.length} / 원본 ${headingCount(MAIN_MD)}`);
  const wantIds = ['0-overview', '한글-제목-테스트', 'punctuation-a-b--c', 'emoji--launch', 'notes', 'notes-1', 'safety'];
  const have = ids(mHtml);
  const missing = wantIds.filter((id) => !have.has(id));
  check('제목 id = GitHub 슬러그 (숫자·한글·구두점·이모지·중복)', missing.length === 0, `없는 id: ${missing.join(', ')}`);
  check('   └ 목차 href가 전부 실재 id를 가리킨다', toc.every((id) => have.has(id)), toc.filter((id) => !have.has(id)).join(', '));
  check('   └ 문서 내 링크 #0-overview → 실재 id', mHtml.includes('<a href="#0-overview">the overview</a>') && have.has('0-overview'));
  check('githubSlug 단위: 한글·구두점·이모지', githubSlug('한글 제목 테스트') === '한글-제목-테스트'
    && githubSlug('Punctuation: (a), b! & c?') === 'punctuation-a-b--c' && githubSlug('Emoji 🚀 Launch') === 'emoji--launch',
    `${githubSlug('Punctuation: (a), b! & c?')} · ${githubSlug('Emoji 🚀 Launch')}`);
  const slug = createSlugger();
  const seq = ['Notes', 'Notes', 'Notes-1', 'Notes'].map(slug);
  check('createSlugger 중복 규칙 (github-slugger)', JSON.stringify(seq) === JSON.stringify(['notes', 'notes-1', 'notes-1-1', 'notes-2']),
    JSON.stringify(seq));
}
{
  check('표: thead/tbody · 정렬', /<table>\s*<thead><tr><th>Field<\/th><th style="text-align:center">Value<\/th><\/tr><\/thead>/.test(mHtml)
    && mHtml.includes('<tr><td>Program</td><td style="text-align:center">ZMMR1001</td></tr>'));
  check('목록: 중첩 ul · ol', /<ul>\s*<li>first\s*<ul>\s*<li>nested<\/li>/.test(mHtml) && /<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ol>/.test(mHtml));
  check('코드: 펜스 내용 이스케이프 · 언어 표시 · 펜스 안 # 은 제목 아님',
    mHtml.includes('<code class="language-abap">') && mHtml.includes('&lt;b&gt;bold?&lt;/b&gt;')
    && mHtml.includes('## not a heading') && !/<h2[^>]*>not a heading/.test(mHtml));
  check('문서 정보 상자: 키·값 표', mHtml.includes('<aside class="sk-meta">') && mHtml.includes('<th>status</th><td>approved</td>')
    && mHtml.includes('<th>owner</th><td>Kim</td>'));
  check('   └ 원시 front matter 블록은 본문에 없다', !mHtml.includes('status: approved') && !/<hr>\s*<p>status/.test(mHtml));
  check('주석 표식(<!-- SAPKIT:DIG-OUT -->) 비노출', !mHtml.includes('SAPKIT:DIG-OUT') && !mHtml.includes('&lt;!--'));
  check('   └ 줄 중간 주석도 비노출', !mHtml.includes('inline reviewer note') && mHtml.includes('the overview</a>.'));
  check('<script> 무력화 (태그 0 · 텍스트로 이스케이프)', !/<script/i.test(mHtml) && mHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  check('onerror= 무력화 (속성으로 살아남은 태그 0)', !/<[a-z][^<>]*\sonerror\s*=/i.test(mHtml) && mHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
  check('javascript: 링크 무력화 (대소문자·엔티티 우회 포함)', !/href\s*=\s*["']?\s*j/i.test(mHtml) && !/javascript:/i.test(mHtml.replace(/>[^<]*</g, '><'))
    && mHtml.includes('click me') && mHtml.includes('sneaky'));
  check('<details>/<summary> 통과', mHtml.includes('<details><summary>FALLBACK</summary>') && mHtml.includes('</details>'));
  check('상대 그림 → data URI (원본 바이트)', mHtml.includes(`<img src="data:image/png;base64,${FLOW_PNG.toString('base64')}" alt="flow chart">`));
  check('없는 그림 → 자리표시', mHtml.includes('class="sk-img-missing"') && mHtml.includes('Image file not found: gone'));
  check('외부 URL 0 · CSP script-src none · 스크립트 0', externalUrls(mHtml).length === 0 && cspMatchesScript(mHtml).ok,
    cspMatchesScript(mHtml).why);
  check('--draft 없으면 띠 없음', !mHtml.includes('class="sk-draft"'));
  const draft = renderMarkdownHtml({ files: [MAIN], lang: 'en', draft: true, now: FIXED_NOW });
  check('--draft면 띠 있음', count(draft, /class="sk-draft"/g) === 1 && draft.includes('Draft — not yet approved'));
}
{
  const both = renderMarkdownHtml({ files: [MAIN, PART], lang: 'en', now: FIXED_NOW });
  const toc = tocIds(both);
  const want = headingCount(MAIN_MD) + headingCount(PART_MD);
  check(`--append: 목차가 이어진다 (${want}항목)`, toc.length === want, `목차 ${toc.length}`);
  check('   └ 덧붙인 조각의 제목이 목차 끝에 순서대로', JSON.stringify(toc.slice(-3)) === JSON.stringify(['appendix-a', 'a1-detail', 'notes-2']),
    JSON.stringify(toc.slice(-3)));
  check('   └ 본문 두 조각 · 바닥글 원본 두 이름', count(both, /<section class="sk-part">/g) === 2 && both.includes('Source: spec.md · approval.md'));
}
{
  const frames = { ko: '목차', ja: '目次', en: 'Contents', fr: 'Contents', 'ko-KR': '목차' };
  for (const [lang, title] of Object.entries(frames)) {
    const html = renderMarkdownHtml({ files: [MAIN], lang, now: FIXED_NOW });
    const code = lang === 'fr' ? 'en' : lang.slice(0, 2);
    check(`--lang ${lang} → 프레임 ${code} (${title})`, html.includes(`<div class="sk-toc-title">${title}</div>`) && html.includes(`<html lang="${code}">`));
  }
  const ko = renderMarkdownHtml({ files: [MAIN], lang: 'ko', now: FIXED_NOW });
  check('   └ 본문은 번역하지 않는다 · 프레임만 바뀐다', ko.includes('<h1 id="spec-title">Spec Title</h1>') && ko.includes('그림 파일을 찾을 수 없음: gone'));
}

// =============================================================
// CLI — 정상 경로 · 결정성
// =============================================================
console.log('⑷ CLI 정상 경로 · ⑸ 결정성');
{
  const out = path.join(TMP, 'fresh', 'nested', 'spec.html');
  const r = run(XLSX_CLI, [BOOK, out, '--lang', 'ko']);
  check('xlsx CLI: exit 0 · stdout `WROTE <절대경로>` 한 줄 · 없는 폴더 생성', r.code === 0 && r.out === `WROTE ${path.resolve(out)}\n` && fs.existsSync(out),
    `exit ${r.code} · ${JSON.stringify(r.out)} · ${r.err}`);
  const again = path.join(TMP, 'fresh', 'again.html');
  run(XLSX_CLI, [BOOK, again, '--lang', 'ko']);
  const a = fs.readFileSync(out, 'utf8');
  const b = fs.readFileSync(again, 'utf8');
  check('xlsx 결정성: 시각만 가리면 두 번이 같다', maskTime(a) === maskTime(b) && /<time datetime="[^"]+">[^<]+<\/time>/.test(a));
}
{
  const out = path.join(TMP, 'md-out', 'spec.html');
  const r = run(MD_CLI, [MAIN, out, '--draft', '--append', PART, '--lang', 'ja']);
  check('md CLI: 없는 그림이 있어도 exit 0 · WROTE', r.code === 0 && r.out === `WROTE ${path.resolve(out)}\n`, `exit ${r.code} · ${r.err}`);
  const html = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  check('   └ CLI 플래그가 반영됐다 (draft 띠 · append · ja)', html.includes('class="sk-draft"') && html.includes('id="appendix-a"')
    && html.includes('<html lang="ja">') && html.includes('画像ファイルが見つかりません'));
  const again = path.join(TMP, 'md-out', 'again.html');
  run(MD_CLI, [MAIN, again, '--draft', '--append', PART, '--lang', 'ja']);
  check('md 결정성: 시각만 가리면 두 번이 같다', html !== '' && maskTime(html) === maskTime(fs.readFileSync(again, 'utf8')));
  const plain = path.join(TMP, 'md-out', 'plain.html');
  run(MD_CLI, [MAIN, plain]);
  check('md CLI: --draft 없으면 띠 없음', fs.existsSync(plain) && !fs.readFileSync(plain, 'utf8').includes('class="sk-draft"'));
}

// =============================================================
// ⑷ 음성 — 읽을 수 없는 입력 · 사용법
// =============================================================
console.log('⑷ 음성');
{
  const notZip = path.join(TMP, 'not-a-zip.xlsx');
  fs.writeFileSync(notZip, 'this is plain text, not a zip archive\n'.repeat(4));
  const cases = [
    ['xlsx: zip 아님', XLSX_CLI, (out) => [notZip, out]],
    ['xlsx: 입력 파일 없음', XLSX_CLI, (out) => [path.join(TMP, 'nope.xlsx'), out]],
    ['md: 입력 파일 없음', MD_CLI, (out) => [path.join(TMP, 'nope.md'), out]],
    ['md: --append 조각 없음', MD_CLI, (out) => [MAIN, out, '--append', path.join(TMP, 'nope-part.md')]],
  ];
  for (const [label, cli, argsFor] of cases) {
    const fresh = path.join(TMP, 'neg', `${label.replace(/[^a-z]/gi, '')}-${pass + fail}`, 'out.html');
    const r = run(cli, argsFor(fresh));
    check(`${label} → exit 1 · stderr 한 줄 · stdout 없음`, r.code === 1 && r.err.trim().split('\n').length === 1 && r.out === '',
      `exit ${r.code} · stderr ${JSON.stringify(r.err)}`);
    check('   └ 출력 파일을 만들지 않는다', !fs.existsSync(fresh));
    const existing = path.join(TMP, 'neg', `existing-${pass + fail}.html`);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    const before = Buffer.from(`<p>earlier output ${label}</p>\r\n\u0000tail`, 'utf8');
    fs.writeFileSync(existing, before);
    run(cli, argsFor(existing));
    check('   └ 기존 출력 파일은 바이트 그대로', fs.readFileSync(existing).equals(before));
    const leftovers = fs.readdirSync(path.dirname(existing)).filter((n) => n.endsWith('.tmp'));
    check('   └ 임시 파일 잔재 없음', leftovers.length === 0, leftovers.join(', '));
  }
  const usage = [
    ['xlsx: 무인자', XLSX_CLI, []],
    ['xlsx: 위치 인자 하나', XLSX_CLI, [BOOK]],
    ['xlsx: 모르는 옵션 --draft', XLSX_CLI, [BOOK, path.join(TMP, 'u1.html'), '--draft']],
    ['md: --lang 값 없음', MD_CLI, [MAIN, path.join(TMP, 'u2.html'), '--lang']],
    ['md: --append 값 없음', MD_CLI, [MAIN, path.join(TMP, 'u3.html'), '--append']],
    ['md: 출력 = 입력', MD_CLI, [MAIN, MAIN]],
  ];
  for (const [label, cli, args] of usage) {
    const r = run(cli, args);
    check(`${label} → exit 2 · 사용법 안내`, r.code === 2 && /usage/i.test(r.err) && r.out === '', `exit ${r.code}`);
  }
  check('   └ 사용법 오류는 아무 파일도 만들지 않았다', ['u1.html', 'u2.html', 'u3.html'].every((n) => !fs.existsSync(path.join(TMP, n)))
    && fs.readFileSync(MAIN, 'utf8') === MAIN_MD);
}

// =============================================================
// ⑹ openInBrowser — spawnImpl 주입 (실제로 띄우지 않는다)
// =============================================================
console.log('⑹ openInBrowser');
{
  const calls = [];
  const fakeSpawn = (behaviour) => (command, args, options) => {
    calls.push({ command, args, options });
    if (behaviour === 'throw') throw Object.assign(new Error('boom'), { code: 'EACCES' });
    const child = new EventEmitter();
    child.unrefCalled = false;
    child.unref = () => { child.unrefCalled = true; };
    calls.at(-1).child = child;
    setImmediate(() => (behaviour === 'spawn' ? child.emit('spawn') : child.emit('error', Object.assign(new Error('nf'), { code: 'ENOENT' }))));
    return child;
  };
  const target = path.join(TMP, 'x y.html');
  const safely = async (p) => { try { return await p; } catch (e) { return { threw: e }; } };

  let r = await safely(openInBrowser(target, { platform: 'linux', spawnImpl: fakeSpawn('spawn') }));
  check('기동 수락 → {ok:true} · detach · unref', r.ok === true && calls.at(-1).command === 'xdg-open'
    && calls.at(-1).args[0] === target && calls.at(-1).options.detached === true && calls.at(-1).child.unrefCalled);
  r = await safely(openInBrowser(target, { platform: 'linux', spawnImpl: fakeSpawn('error') }));
  check('기동 오류 이벤트 → {ok:false, reason} · 던지지 않음', r.ok === false && /xdg-open: ENOENT/.test(r.reason), JSON.stringify(r));
  r = await safely(openInBrowser(target, { platform: 'linux', spawnImpl: fakeSpawn('throw') }));
  check('spawn 자체가 던짐 → {ok:false} · 던지지 않음', r.ok === false && /EACCES/.test(r.reason), JSON.stringify(r));
  r = await safely(openInBrowser(target, { platform: 'win32', spawnImpl: fakeSpawn('spawn') }));
  check('win32: cmd.exe start "" "<경로>" (verbatim)', r.ok === true && calls.at(-1).command === 'cmd.exe'
    && JSON.stringify(calls.at(-1).args) === JSON.stringify(['/d', '/c', 'start', '""', `"${target}"`])
    && calls.at(-1).options.windowsVerbatimArguments === true);
  r = await safely(openInBrowser(target, { platform: 'darwin', spawnImpl: fakeSpawn('spawn') }));
  check('darwin: open <경로>', r.ok === true && calls.at(-1).command === 'open' && calls.at(-1).args[0] === target);
}

// =============================================================
// ⑺ runCli stdout 계약 — 가짜 openImpl
// =============================================================
console.log('⑺ runCli stdout 계약');
{
  async function capture(fn) {
    const out = [];
    const err = [];
    const log = console.log;
    const error = console.error;
    console.log = (...a) => out.push(a.join(' '));
    console.error = (...a) => err.push(a.join(' '));
    try {
      return { code: await fn(), out, err };
    } finally {
      console.log = log;
      console.error = error;
    }
  }
  const input = path.join(TMP, 'cli-in.md');
  fs.writeFileSync(input, '# x\n');
  const base = { tool: 't', usage: 'usage: t <in> <out>', accepts: [], render: () => '<p>ok</p>' };
  let opened = 0;
  const outA = path.join(TMP, 'cli', 'deep', 'a.html');

  let r = await capture(() => runCli({ ...base, argv: [input, outA], openImpl: async () => { opened += 1; return { ok: true }; } }));
  check('--open 없음: WROTE <절대경로>만 · openImpl 호출 0 · exit 0',
    r.code === 0 && JSON.stringify(r.out) === JSON.stringify([`WROTE ${path.resolve(outA)}`]) && opened === 0 && fs.readFileSync(outA, 'utf8') === '<p>ok</p>',
    JSON.stringify(r.out));
  check('   └ WROTE 경로는 절대경로', path.isAbsolute(r.out[0].slice('WROTE '.length)));

  r = await capture(() => runCli({ ...base, argv: [input, outA, '--open'], openImpl: async (p) => { opened += 1; return p === path.resolve(outA) ? { ok: true } : { ok: false, reason: 'wrong path' }; } }));
  check('--open + 수락 → WROTE · OPENED · exit 0', r.code === 0 && JSON.stringify(r.out) === JSON.stringify([`WROTE ${path.resolve(outA)}`, 'OPENED']) && opened === 1,
    JSON.stringify(r.out));

  r = await capture(() => runCli({ ...base, argv: [input, outA, '--open', '--lang', 'ko'], openImpl: async () => ({ ok: false, reason: 'xdg-open: ENOENT' }) }));
  check('--open + 실패 → OPEN-FAILED <사유> · 그래도 exit 0', r.code === 0 && r.out[1] === 'OPEN-FAILED 브라우저를 열지 못했습니다 (xdg-open: ENOENT)',
    JSON.stringify(r.out));

  const outB = path.join(TMP, 'cli', 'b.html');
  r = await capture(() => runCli({ ...base, argv: [input, outB], render: () => { throw new Error('cannot read it'); } }));
  check('render 실패 → exit 1 · stderr 한 줄 · stdout 없음 · 파일 없음', r.code === 1 && r.err.length === 1 && r.out.length === 0 && !fs.existsSync(outB),
    JSON.stringify(r));

  r = await capture(() => runCli({ ...base, argv: [input] }));
  check('사용법 오류 → exit 2 · 사용법 안내', r.code === 2 && r.err.includes('usage: t <in> <out>') && r.out.length === 0);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n통과 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
